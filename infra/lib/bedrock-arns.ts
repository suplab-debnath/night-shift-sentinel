// Least-privilege Bedrock resources from the configured model id (ARCHITECTURE §8).
// Model ids are never guessed: they come from CDK context and are only parsed here.

/** Cross-region inference profile ids start with a geography prefix, e.g. "eu." or "global.". */
const PROFILE_PREFIX = /^(us|us-gov|eu|apac|jp|au|ca|global)\./;

export interface BedrockArnInput {
  modelId: string;
  partition: string;
  region: string;
  account: string;
  /** Regions an inference profile may route to; if omitted the foundation-model ARN uses region "*" (model stays pinned). */
  profileRegions?: string[];
}

export interface BedrockArns {
  resources: string[];
  kind: 'foundation-model' | 'inference-profile' | 'arn';
  /** True when the foundation-model ARN had to use region "*". */
  anyRegion: boolean;
}

export function bedrockModelArns(input: BedrockArnInput): BedrockArns {
  const { modelId, partition, region, account } = input;
  if (modelId.startsWith('arn:')) return { resources: [modelId], kind: 'arn', anyRegion: false };
  const m = PROFILE_PREFIX.exec(modelId);
  if (!m) return { resources: [`arn:${partition}:bedrock:${region}::foundation-model/${modelId}`], kind: 'foundation-model', anyRegion: false };
  const base = modelId.slice(m[0].length);
  const regions = input.profileRegions && input.profileRegions.length > 0 ? input.profileRegions : ['*'];
  return {
    kind: 'inference-profile',
    anyRegion: regions.includes('*'),
    resources: [
      `arn:${partition}:bedrock:${region}:${account}:inference-profile/${modelId}`,
      ...regions.map((r) => `arn:${partition}:bedrock:${r}::foundation-model/${base}`),
    ],
  };
}
