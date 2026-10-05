// CDK app entry. Configuration via context, e.g.:
//   npm run cdk:deploy -- -c region=us-east-1 -c modelId=<your model or inference profile id>
import * as cdk from 'aws-cdk-lib';
import { NightShiftStack, type NightShiftConfig } from '../lib/night-shift-stack';

const app = new cdk.App();
const ctx = (key: string): string | undefined => {
  const v = app.node.tryGetContext(key) as string | undefined;
  return v === undefined || v === '' ? undefined : String(v);
};

const config: NightShiftConfig = {
  ...(ctx('modelId') ? { modelId: ctx('modelId') } : {}),
  ...(ctx('fastModelId') ? { fastModelId: ctx('fastModelId') } : {}),
  ...(ctx('guardrailId') ? { guardrailId: ctx('guardrailId') } : {}),
  ...(ctx('guardrailVersion') ? { guardrailVersion: ctx('guardrailVersion') } : {}),
  ...(ctx('passcodeParam') ? { passcodeParam: ctx('passcodeParam') } : {}),
  ...(ctx('budgetMonthlyUsd') ? { budgetMonthlyUsd: Number(ctx('budgetMonthlyUsd')) } : {}),
  ...(ctx('budgetEmail') ? { budgetEmail: ctx('budgetEmail') } : {}),
  ...(ctx('profileRegions') ? { profileRegions: ctx('profileRegions')!.split(',').map((s) => s.trim()) } : {}),
};

new NightShiftStack(app, ctx('stackName') ?? 'NightShiftStack', {
  config,
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: ctx('region') ?? process.env.CDK_DEFAULT_REGION },
  description: 'Night Shift: Agent Theater (web app on S3 + CloudFront, live mode on Lambda + Amazon Bedrock)',
});
