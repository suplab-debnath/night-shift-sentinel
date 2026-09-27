// Server configuration from the environment (CLAUDE.md §9). Never read in the browser.
import { z } from 'zod';

const num = (fallback: number) => z.coerce.number().int().positive().default(fallback);

const EnvSchema = z.object({
  AGENT_MODE: z.enum(['scripted', 'live-mock', 'live-bedrock']).default('live-mock'),
  PORT: num(8787),
  AWS_REGION: z.string().optional(),
  BEDROCK_MODEL_ID: z.string().optional(),
  BEDROCK_FAST_MODEL_ID: z.string().optional(),
  BEDROCK_GUARDRAIL_ID: z.string().optional(),
  BEDROCK_GUARDRAIL_VERSION: z.string().optional(),
  LIVE_TURN_TIMEOUT_MS: num(9000),
  LIVE_MAX_TOKENS_PER_TURN: num(600),
  LIVE_STALL_MS: num(4000),
  LIVE_CONCURRENCY: num(3),
  /** Test hook: "beatId:timeout|error|invalid|slow,..." forces mock failures. */
  LIVE_MOCK_FAIL: z.string().optional(),
  DEMO_PASSCODE: z.string().optional(),
});

export type AgentMode = z.output<typeof EnvSchema>['AGENT_MODE'];
export type MockFailure = 'timeout' | 'error' | 'invalid' | 'slow';

export interface ServerConfig {
  mode: AgentMode;
  port: number;
  region: string | undefined;
  modelId: string | undefined;
  fastModelId: string | undefined;
  guardrail: { id: string; version: string } | undefined;
  turnTimeoutMs: number;
  maxTokensPerTurn: number;
  stallMs: number;
  concurrency: number;
  mockFailures: Record<string, MockFailure>;
  passcode: string | undefined;
}

const blank = (v: string | undefined) => (v && v.trim() !== '' ? v.trim() : undefined);

export function parseMockFailures(spec: string | undefined): Record<string, MockFailure> {
  const out: Record<string, MockFailure> = {};
  for (const part of (spec ?? '').split(',')) {
    const [beat, kind] = part.split(':').map((s) => s.trim());
    if (beat && (kind === 'timeout' || kind === 'error' || kind === 'invalid' || kind === 'slow')) out[beat] = kind;
  }
  return out;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env, overrides: Partial<{ mode: AgentMode }> = {}): ServerConfig {
  const e = EnvSchema.parse(Object.fromEntries(Object.entries(env).map(([k, v]) => [k, blank(v)])));
  const guardrailId = blank(e.BEDROCK_GUARDRAIL_ID);
  return {
    mode: overrides.mode ?? e.AGENT_MODE,
    port: e.PORT,
    region: blank(e.AWS_REGION),
    modelId: blank(e.BEDROCK_MODEL_ID),
    fastModelId: blank(e.BEDROCK_FAST_MODEL_ID),
    guardrail: guardrailId ? { id: guardrailId, version: blank(e.BEDROCK_GUARDRAIL_VERSION) ?? 'DRAFT' } : undefined,
    turnTimeoutMs: e.LIVE_TURN_TIMEOUT_MS,
    maxTokensPerTurn: e.LIVE_MAX_TOKENS_PER_TURN,
    stallMs: e.LIVE_STALL_MS,
    concurrency: e.LIVE_CONCURRENCY,
    mockFailures: parseMockFailures(e.LIVE_MOCK_FAIL),
    passcode: blank(e.DEMO_PASSCODE),
  };
}

/** Model IDs are never shown in full outside the server (ARCHITECTURE §11). */
export function maskId(id: string | undefined): string | null {
  if (!id) return null;
  if (id.length <= 8) return '****';
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}
