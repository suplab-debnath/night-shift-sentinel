# Night Shift on AWS (CDK, no Docker)

One stack, `NightShiftStack`: the web app on a private S3 bucket behind CloudFront (OAC), and live mode
on a response-streaming Lambda (Node.js 22, arm64) behind a Function URL that only CloudFront can call
(OAC, `AWS_IAM`). The Lambda is bundled with the locally installed esbuild; Docker is never used.

## Before the first deploy
1. AWS credentials for the target account (profile or SSO), e.g. `export AWS_PROFILE=...`.
2. In the Bedrock console, enable access to the Claude model you will use, in the region you deploy to.
   For an EU client prefer an EU region and an EU inference profile.
3. Bootstrap once per account and region (CloudFormation only): `npx cdk bootstrap -c region=us-east-1` from `infra/`.
4. Optional passcode for the hosted API:
   `aws ssm put-parameter --name /night-shift/passcode --type SecureString --value '<passcode>'`

## Deploy
```bash
npm run cdk:synth -- -c region=us-east-1 -c modelId=<model or inference profile id>
npm run cdk:deploy -- -c region=us-east-1 -c modelId=<model or inference profile id>
```
The output `SiteUrl` is the demo. Live mode starts automatically there; without `modelId` the API runs
scripted and the stage plays scripted.

| Context key | Meaning |
|---|---|
| `region` | Deploy region (must have the model enabled) |
| `modelId` | `BEDROCK_MODEL_ID`: model id, inference profile id (`eu.…`, `global.…`), or an ARN |
| `fastModelId` | Optional cheaper model for specialist agents |
| `profileRegions` | Comma list of regions an inference profile may route to (tightens IAM; otherwise the model ARN allows any region and synth warns) |
| `guardrailId`, `guardrailVersion` | Optional Bedrock Guardrail |
| `passcodeParam` | SSM SecureString name for the passcode (`?passcode=` in the URL) |
| `budgetMonthlyUsd`, `budgetEmail` | Optional AWS Budgets alarm at 80% and 100% |
| `stackName` | Defaults to `NightShiftStack` |

## Least privilege
- Lambda role: `bedrock:InvokeModel` and `bedrock:InvokeModelWithResponseStream` on the configured
  model(s) only; `bedrock:ApplyGuardrail` on the configured guardrail only; `ssm:GetParameter` on the
  passcode parameter only; `kms:Decrypt` only via SSM in the region.
- CloudFront may call the Function URL (`lambda:InvokeFunctionUrl`, plus `lambda:InvokeFunction` limited
  to Function URL invocations), from this distribution only.
- Reserved concurrency 5, 120 s timeout, 600 output tokens per turn: a hard cost ceiling.

## First-deploy checks
- `curl https://<SiteUrl>/api/health` returns `"live": true` and a masked model id.
- Open the site and the settings menu; its source line should read "Live on Bedrock". If it reads "Live, scripted fallback", check the
  Lambda logs (`/aws/lambda/...ApiFunction...`, one JSON line per turn with the fallback reason).
- POSTs through CloudFront OAC carry `x-amz-content-sha256` (the web client computes it). If AWS changes
  the OAC requirements for Function URLs, adjust `infra/lib/night-shift-stack.ts` and
  `apps/web/src/sources/LiveSource.ts` (DECISIONS D-057).

## Manual deploy of the API Lambda (without CDK)
`npm run build:lambda -w @night-shift/server` writes `apps/server/dist-lambda/lambda.zip` with the same
bundling as the stack (esbuild, CJS, node22, AWS SDK included, no Docker) and smoke-tests it locally
with the mock provider. Create the function with runtime Node.js 22.x, arm64, handler `index.handler`,
512 MB, 120 s timeout, reserved concurrency 5, and the environment variables the stack sets
(`AGENT_MODE=live-bedrock`, `BEDROCK_MODEL_ID`, `LIVE_TURN_TIMEOUT_MS=9000`,
`LIVE_MAX_TOKENS_PER_TURN=600`, optional `BEDROCK_FAST_MODEL_ID`, `DEMO_PASSCODE_PARAM`). Give its role
the Bedrock permissions under "Least privilege", add a Function URL with auth `AWS_IAM` and invoke mode
`RESPONSE_STREAM`, and route CloudFront `/api/*` to it with a Lambda OAC.

## Tear down
`npx cdk destroy -c region=us-east-1` from `infra/`. The bucket only holds the rebuildable web build and is emptied automatically.
