// NightShiftStack (ARCHITECTURE §8): S3 + CloudFront (OAC) for the web app, and a
// response-streaming Lambda behind a Function URL (OAC, AWS_IAM) for /api/*. No Docker:
// NodejsFunction bundles with the locally installed esbuild.
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cdk from 'aws-cdk-lib';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import type { Construct } from 'constructs';
import { bedrockModelArns } from './bedrock-arns';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export interface NightShiftConfig {
  modelId?: string;
  fastModelId?: string;
  guardrailId?: string;
  guardrailVersion?: string;
  /** SSM SecureString name holding the optional demo passcode. */
  passcodeParam?: string;
  budgetMonthlyUsd?: number;
  budgetEmail?: string;
  profileRegions?: string[];
  /** Built web app to host (npm run build:aws -w @night-shift/web). */
  webDist?: string;
  liveTurnTimeoutMs?: number;
  liveMaxTokensPerTurn?: number;
}

export interface NightShiftStackProps extends cdk.StackProps {
  config: NightShiftConfig;
}

export class NightShiftStack extends cdk.Stack {
  readonly apiFunction: nodejs.NodejsFunction;
  readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: NightShiftStackProps) {
    super(scope, id, props);
    const cfg = props.config;

    // ---------------------------------------------------------------- web bucket (private, OAC)
    const bucket = new s3.Bucket(this, 'WebBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      // Demo hosting: the bucket only holds the rebuildable web build.
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // ---------------------------------------------------------------- live-mode API (Lambda, streaming)
    const logGroup = new logs.LogGroup(this, 'ApiLogs', {
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const liveMode = cfg.modelId ? 'live-bedrock' : 'scripted';
    const environment: Record<string, string> = {
      AGENT_MODE: liveMode,
      LIVE_TURN_TIMEOUT_MS: String(cfg.liveTurnTimeoutMs ?? 9000),
      LIVE_MAX_TOKENS_PER_TURN: String(cfg.liveMaxTokensPerTurn ?? 600),
      ...(cfg.modelId ? { BEDROCK_MODEL_ID: cfg.modelId } : {}),
      ...(cfg.fastModelId ? { BEDROCK_FAST_MODEL_ID: cfg.fastModelId } : {}),
      ...(cfg.guardrailId ? { BEDROCK_GUARDRAIL_ID: cfg.guardrailId, BEDROCK_GUARDRAIL_VERSION: cfg.guardrailVersion ?? 'DRAFT' } : {}),
      ...(cfg.passcodeParam ? { DEMO_PASSCODE_PARAM: cfg.passcodeParam } : {}),
    };

    this.apiFunction = new nodejs.NodejsFunction(this, 'ApiFunction', {
      entry: path.join(REPO_ROOT, 'apps/server/src/http/lambda.ts'),
      handler: 'handler',
      projectRoot: REPO_ROOT,
      depsLockFilePath: path.join(REPO_ROOT, 'package-lock.json'),
      // Node 22 (DECISIONS D-004), arm64.
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 512,
      timeout: cdk.Duration.seconds(120),
      // Cost cap (ARCHITECTURE §11).
      reservedConcurrentExecutions: 5,
      logGroup,
      loggingFormat: lambda.LoggingFormat.JSON,
      environment,
      bundling: {
        // CLAUDE.md §3.2: never Docker.
        forceDockerBundling: false,
        format: nodejs.OutputFormat.CJS,
        target: 'node22',
        minify: true,
        sourceMap: true,
        // Bundle the AWS SDK too, so the deployed code matches the tested versions.
        externalModules: [],
        tsconfig: path.join(REPO_ROOT, 'apps/server/tsconfig.json'),
      },
    });

    const functionUrl = this.apiFunction.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.AWS_IAM,
      invokeMode: lambda.InvokeMode.RESPONSE_STREAM,
    });

    // ---------------------------------------------------------------- least-privilege IAM
    if (cfg.modelId) {
      const arns = [cfg.modelId, ...(cfg.fastModelId && cfg.fastModelId !== cfg.modelId ? [cfg.fastModelId] : [])].map((id) =>
        bedrockModelArns({ modelId: id, partition: this.partition, region: this.region, account: this.account, ...(cfg.profileRegions ? { profileRegions: cfg.profileRegions } : {}) }),
      );
      this.apiFunction.addToRolePolicy(
        new iam.PolicyStatement({
          sid: 'InvokeConfiguredModels',
          actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
          resources: [...new Set(arns.flatMap((a) => a.resources))],
        }),
      );
      if (arns.some((a) => a.anyRegion)) {
        cdk.Annotations.of(this).addWarningV2(
          'nightshift:profileRegions',
          'An inference profile is configured without -c profileRegions=...; its foundation-model ARN allows any region (the model itself stays pinned).',
        );
      }
    } else {
      cdk.Annotations.of(this).addWarningV2('nightshift:noModel', 'No -c modelId: the hosted API runs in scripted mode and the stage plays scripted.');
    }
    if (cfg.guardrailId) {
      this.apiFunction.addToRolePolicy(
        new iam.PolicyStatement({
          sid: 'ApplyConfiguredGuardrail',
          actions: ['bedrock:ApplyGuardrail'],
          resources: [`arn:${this.partition}:bedrock:${this.region}:${this.account}:guardrail/${cfg.guardrailId}`],
        }),
      );
    }
    if (cfg.passcodeParam) {
      const name = cfg.passcodeParam.replace(/^\//, '');
      this.apiFunction.addToRolePolicy(
        new iam.PolicyStatement({
          sid: 'ReadPasscode',
          actions: ['ssm:GetParameter'],
          resources: [`arn:${this.partition}:ssm:${this.region}:${this.account}:parameter/${name}`],
        }),
      );
      // SecureString with the AWS managed key: decrypt only through SSM in this region.
      this.apiFunction.addToRolePolicy(
        new iam.PolicyStatement({
          sid: 'DecryptPasscodeViaSsm',
          actions: ['kms:Decrypt'],
          resources: [`arn:${this.partition}:kms:${this.region}:${this.account}:key/*`],
          conditions: { StringEquals: { 'kms:ViaService': `ssm.${this.region}.amazonaws.com` } },
        }),
      );
    }

    // ---------------------------------------------------------------- CloudFront
    const spaIndex = new cloudfront.Function(this, 'SpaIndex', {
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      comment: 'Serve index.html for extension-less paths (web app only; /api is untouched)',
      code: cloudfront.FunctionCode.fromInline(
        "function handler(event){var r=event.request;if(r.uri==='/'||r.uri.indexOf('.')===-1){r.uri='/index.html';}return r;}",
      ),
    });

    const headers = new cloudfront.ResponseHeadersPolicy(this, 'SecurityHeaders', {
      securityHeadersBehavior: {
        contentSecurityPolicy: {
          override: true,
          contentSecurityPolicy: [
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self' 'unsafe-inline'",
            "font-src 'self'",
            "img-src 'self' data:",
            "connect-src 'self'",
            "frame-ancestors 'none'",
            "base-uri 'none'",
            "form-action 'none'",
          ].join('; '),
        },
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
        referrerPolicy: { referrerPolicy: cloudfront.HeadersReferrerPolicy.NO_REFERRER, override: true },
        strictTransportSecurity: { accessControlMaxAge: cdk.Duration.days(365), includeSubdomains: true, override: true },
      },
    });

    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: 'Night Shift: Agent Theater',
      defaultRootObject: 'index.html',
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: headers,
        functionAssociations: [{ function: spaIndex, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST }],
      },
      additionalBehaviors: {
        '/api/*': {
          origin: origins.FunctionUrlOrigin.withOriginAccessControl(functionUrl, { readTimeout: cdk.Duration.seconds(60) }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          responseHeadersPolicy: headers,
        },
      },
    });

    // CloudFront calls the Function URL with OAC; besides lambda:InvokeFunctionUrl (added by the
    // origin) grant lambda:InvokeFunction limited to Function URL invocations from this
    // distribution only (see DECISIONS D-057).
    new lambda.CfnPermission(this, 'CloudFrontInvokeViaFunctionUrl', {
      action: 'lambda:InvokeFunction',
      principal: 'cloudfront.amazonaws.com',
      functionName: this.apiFunction.functionArn,
      sourceArn: `arn:${this.partition}:cloudfront::${this.account}:distribution/${this.distribution.distributionId}`,
      invokedViaFunctionUrl: true,
    });

    // ---------------------------------------------------------------- web content
    const webDist = cfg.webDist ?? path.join(REPO_ROOT, 'apps/web/dist-aws');
    if (!existsSync(path.join(webDist, 'index.html'))) {
      throw new Error(`Web build not found at ${webDist}. Run: npm run build:aws -w @night-shift/web`);
    }
    new s3deploy.BucketDeployment(this, 'DeployWeb', {
      sources: [s3deploy.Source.asset(webDist)],
      destinationBucket: bucket,
      distribution: this.distribution,
      distributionPaths: ['/*'],
      memoryLimit: 256,
    });

    // ---------------------------------------------------------------- optional budget alarm
    if (cfg.budgetMonthlyUsd) {
      new budgets.CfnBudget(this, 'MonthlyBudget', {
        budget: {
          budgetName: `${cdk.Stack.of(this).stackName}-monthly`,
          budgetType: 'COST',
          timeUnit: 'MONTHLY',
          budgetLimit: { amount: cfg.budgetMonthlyUsd, unit: 'USD' },
        },
        notificationsWithSubscribers: cfg.budgetEmail
          ? [80, 100].map((threshold) => ({
              notification: { notificationType: 'ACTUAL', comparisonOperator: 'GREATER_THAN', threshold, thresholdType: 'PERCENTAGE' },
              subscribers: [{ subscriptionType: 'EMAIL', address: cfg.budgetEmail! }],
            }))
          : [],
      });
    }

    new cdk.CfnOutput(this, 'SiteUrl', { value: `https://${this.distribution.distributionDomainName}` });
    new cdk.CfnOutput(this, 'LiveMode', { value: liveMode });
  }
}
