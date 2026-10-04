// Assertions on the synthesized template (P7 DoD: no Docker, least-privilege IAM, private bucket),
// plus a smoke test that runs the bundled Lambda code itself.
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { PassThrough } from 'node:stream';
import * as cdk from 'aws-cdk-lib';
import { Annotations, Match, Template } from 'aws-cdk-lib/assertions';
import { beforeAll, describe, expect, it } from 'vitest';
import { bedrockModelArns } from '../lib/bedrock-arns';
import { NightShiftStack, type NightShiftConfig } from '../lib/night-shift-stack';

// Any Docker use would fail loudly (CLAUDE.md §3.2).
process.env.CDK_DOCKER = '/nonexistent/docker-must-not-be-called';

const webDist = mkdtempSync(path.join(tmpdir(), 'ns-web-'));
writeFileSync(path.join(webDist, 'index.html'), '<!doctype html><title>Night Shift</title>');

function synth(config: NightShiftConfig = {}) {
  const app = new cdk.App({ outdir: mkdtempSync(path.join(tmpdir(), 'ns-cdk-')) });
  const stack = new NightShiftStack(app, 'Test', { config: { webDist, ...config }, env: { account: '111122223333', region: 'eu-west-1' } });
  return { app, stack, template: Template.fromStack(stack) };
}

type Statement = { Action: string | string[]; Resource: unknown; Condition?: unknown; Sid?: string };

function statements(template: Template): Statement[] {
  return Object.values(template.findResources('AWS::IAM::Policy')).flatMap(
    (p) => (p as { Properties: { PolicyDocument: { Statement: Statement[] } } }).Properties.PolicyDocument.Statement,
  );
}

const full: NightShiftConfig = {
  modelId: 'eu.example-model-id',
  fastModelId: 'example-fast-model-id',
  profileRegions: ['eu-west-1', 'eu-central-1'],
  guardrailId: 'gr123',
  guardrailVersion: '3',
  passcodeParam: '/night-shift/passcode',
  budgetMonthlyUsd: 50,
  budgetEmail: 'ops@example.com',
};

describe('NightShiftStack', () => {
  let t: Template;
  beforeAll(() => {
    t = synth(full).template;
  });

  it('keeps the web bucket private, encrypted, versioned, TLS-only', () => {
    t.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: { BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true },
      BucketEncryption: { ServerSideEncryptionConfiguration: [{ ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } }] },
      VersioningConfiguration: { Status: 'Enabled' },
    });
    t.hasResourceProperties('AWS::S3::BucketPolicy', {
      PolicyDocument: { Statement: Match.arrayWith([Match.objectLike({ Effect: 'Deny', Condition: { Bool: { 'aws:SecureTransport': 'false' } } })]) },
    });
    t.resourceCountIs('AWS::CloudFront::OriginAccessControl', 2);
  });

  it('runs the API on Node 22 arm64, streaming, IAM-authenticated, with a concurrency cap', () => {
    t.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs22.x',
      Architectures: ['arm64'],
      MemorySize: 512,
      Timeout: 120,
      ReservedConcurrentExecutions: 5,
      Environment: { Variables: Match.objectLike({ AGENT_MODE: 'live-bedrock', BEDROCK_MODEL_ID: 'eu.example-model-id', DEMO_PASSCODE_PARAM: '/night-shift/passcode' }) },
    });
    t.hasResourceProperties('AWS::Lambda::Url', { AuthType: 'AWS_IAM', InvokeMode: 'RESPONSE_STREAM' });
  });

  it('routes /api/* to the Function URL uncached with all methods, and the rest to S3', () => {
    const dist = Object.values(t.findResources('AWS::CloudFront::Distribution'))[0] as {
      Properties: { DistributionConfig: { CacheBehaviors: Record<string, unknown>[]; DefaultCacheBehavior: Record<string, unknown> } };
    };
    const api = dist.Properties.DistributionConfig.CacheBehaviors.find((b) => b.PathPattern === '/api/*')!;
    expect(api.AllowedMethods).toEqual(expect.arrayContaining(['POST', 'GET', 'OPTIONS']));
    expect(api.CachePolicyId).toBe('4135ea2d-6df8-44a3-9df3-4b5a84be39ad'); // Managed-CachingDisabled
    expect(api.OriginRequestPolicyId).toBe('b689b0a8-53d0-40ab-baf2-68738e2966ac'); // AllViewerExceptHostHeader
    expect(api.ViewerProtocolPolicy).toBe('https-only');
    expect(dist.Properties.DistributionConfig.DefaultCacheBehavior.ViewerProtocolPolicy).toBe('redirect-to-https');
  });

  it('lets only this distribution invoke the function URL', () => {
    t.hasResourceProperties('AWS::Lambda::Permission', { Action: 'lambda:InvokeFunctionUrl', Principal: 'cloudfront.amazonaws.com', SourceArn: Match.anyValue() });
    t.hasResourceProperties('AWS::Lambda::Permission', {
      Action: 'lambda:InvokeFunction',
      Principal: 'cloudfront.amazonaws.com',
      InvokedViaFunctionUrl: true,
      SourceArn: Match.anyValue(),
    });
    const perms = Object.values(t.findResources('AWS::Lambda::Permission')) as { Properties: { Principal: string; SourceArn?: unknown } }[];
    for (const p of perms.filter((x) => x.Properties.Principal === 'cloudfront.amazonaws.com')) expect(p.Properties.SourceArn).toBeDefined();
  });

  it('grants Bedrock only on the configured models, never a wildcard model', () => {
    const bedrock = statements(t).filter((s) => [s.Action].flat().some((a) => a.startsWith('bedrock:')));
    const actions = bedrock.flatMap((s) => [s.Action].flat());
    expect(actions.sort()).toEqual(['bedrock:ApplyGuardrail', 'bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream']);
    const resources = JSON.stringify(bedrock.map((s) => s.Resource));
    expect(resources).not.toMatch(/"\*"/);
    expect(resources).not.toMatch(/foundation-model\/\*/);
    expect(resources).toContain('inference-profile/eu.example-model-id');
    expect(resources).toContain('foundation-model/example-model-id');
    expect(resources).toContain('eu-central-1::foundation-model/example-model-id');
    expect(resources).toContain('foundation-model/example-fast-model-id');
    expect(resources).toContain('guardrail/gr123');
  });

  it('reads only the passcode parameter, decrypting only via SSM', () => {
    const ssm = statements(t).filter((s) => [s.Action].flat().some((a) => a.startsWith('ssm:')));
    expect(ssm).toHaveLength(1);
    expect(JSON.stringify(ssm[0]!.Resource)).toContain('parameter/night-shift/passcode');
    const kms = statements(t).find((s) => [s.Action].flat().includes('kms:Decrypt'))!;
    expect(kms.Condition).toMatchObject({ StringEquals: { 'kms:ViaService': expect.anything() } });
  });

  it('adds security headers, the SPA function, and the budget alarm', () => {
    t.hasResourceProperties('AWS::CloudFront::ResponseHeadersPolicy', {
      ResponseHeadersPolicyConfig: { SecurityHeadersConfig: Match.objectLike({ ContentSecurityPolicy: Match.objectLike({ ContentSecurityPolicy: Match.stringLikeRegexp("connect-src 'self'") }) }) },
    });
    t.resourceCountIs('AWS::CloudFront::Function', 1);
    t.hasResourceProperties('AWS::Budgets::Budget', { Budget: Match.objectLike({ BudgetLimit: { Amount: 50, Unit: 'USD' } }) });
  });

  it('without a model: scripted API, no Bedrock permissions, and a warning', () => {
    const { stack, template } = synth({});
    template.hasResourceProperties('AWS::Lambda::Function', { Environment: { Variables: Match.objectLike({ AGENT_MODE: 'scripted' }) } });
    expect(statements(template).some((s) => [s.Action].flat().some((a) => a.startsWith('bedrock:') || a.startsWith('ssm:')))).toBe(false);
    template.resourceCountIs('AWS::Budgets::Budget', 0);
    expect(Annotations.fromStack(stack).findWarning('*', Match.stringLikeRegexp('scripted mode')).length).toBe(1);
  });

  it('warns when an inference profile has no region list', () => {
    const { stack } = synth({ modelId: 'global.example-model-id' });
    expect(Annotations.fromStack(stack).findWarning('*', Match.stringLikeRegexp('profileRegions')).length).toBe(1);
  });

  it('refuses to synth without a web build', () => {
    const app = new cdk.App({ outdir: mkdtempSync(path.join(tmpdir(), 'ns-cdk-')) });
    expect(() => new NightShiftStack(app, 'NoWeb', { config: { webDist: path.join(webDist, 'missing') } })).toThrow(/build:aws/);
  });
});

describe('bedrockModelArns', () => {
  const base = { partition: 'aws', region: 'eu-west-1', account: '111122223333' };
  it('handles foundation models, inference profiles, and ARNs', () => {
    expect(bedrockModelArns({ ...base, modelId: 'vendor.model-v1:0' })).toEqual({
      kind: 'foundation-model',
      anyRegion: false,
      resources: ['arn:aws:bedrock:eu-west-1::foundation-model/vendor.model-v1:0'],
    });
    expect(bedrockModelArns({ ...base, modelId: 'eu.vendor.model-v1:0', profileRegions: ['eu-west-1', 'eu-west-3'] }).resources).toEqual([
      'arn:aws:bedrock:eu-west-1:111122223333:inference-profile/eu.vendor.model-v1:0',
      'arn:aws:bedrock:eu-west-1::foundation-model/vendor.model-v1:0',
      'arn:aws:bedrock:eu-west-3::foundation-model/vendor.model-v1:0',
    ]);
    expect(bedrockModelArns({ ...base, modelId: 'global.vendor.m' })).toMatchObject({ anyRegion: true });
    expect(bedrockModelArns({ ...base, modelId: 'arn:aws:bedrock:eu-west-1:1:application-inference-profile/x' }).kind).toBe('arn');
  });
});

describe('bundled Lambda (esbuild, no Docker)', () => {
  it('serves health and streams a live segment from the real bundle', async () => {
    const { app, stack } = synth({ modelId: 'eu.example-model-id' });
    const assembly = app.synth();
    expect(stack.stackName).toBe('Test');
    // The API asset is the staged directory whose index.js carries the scenario.
    const bundle = readdirSync(assembly.directory)
      .filter((d) => d.startsWith('asset.'))
      .map((d) => path.join(assembly.directory, d, 'index.js'))
      .find((f) => existsSync(f) && readFileSync(f, 'utf8').includes('premium-run'))!;
    expect(bundle).toBeDefined();
    expect(readFileSync(bundle, 'utf8').length).toBeGreaterThan(100_000);

    // The Lambda streaming runtime provides this global; emulate it.
    type Handler = (event: unknown, stream: PassThrough) => Promise<void>;
    const outputs: { status: number; body: string }[] = [];
    (globalThis as Record<string, unknown>).awslambda = {
      streamifyResponse: (h: Handler) => h,
      HttpResponseStream: {
        from: (stream: PassThrough, meta: { statusCode: number }) => {
          const record = { status: meta.statusCode, body: '' };
          outputs.push(record);
          stream.on('data', (c: Buffer) => (record.body += c.toString()));
          return stream;
        },
      },
    };
    process.env.AGENT_MODE = 'live-mock';
    const { handler } = createRequire(import.meta.url)(bundle) as { handler: Handler };
    const call = async (method: string, rawPath: string, body?: unknown) => {
      const stream = new PassThrough();
      const done = new Promise((r) => stream.on('finish', r));
      await handler({ rawPath, body: body ? JSON.stringify(body) : undefined, headers: {}, requestContext: { http: { method } } }, stream);
      await done;
      return outputs.at(-1)!;
    };
    const health = await call('GET', '/api/health');
    expect(health.status).toBe(200);
    expect(JSON.parse(health.body)).toMatchObject({ mode: 'live-mock', live: true });
    const seg = await call('POST', '/api/segments', { scenarioId: 'premium-run', segment: 'main', decisions: [], context: '' });
    expect(seg.status).toBe(200);
    expect(seg.body).toContain('"frame":"segment.end"');
    expect((await call('POST', '/api/segments', { nope: 1 })).status).toBe(400);
    expect((await call('GET', '/elsewhere')).status).toBe(404);
  });
});
