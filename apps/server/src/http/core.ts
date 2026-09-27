// Transport-neutral request handling: health and segment streams.
import type { LiveFrame } from '@night-shift/engine';
import { getScenario } from '@night-shift/scenarios';
import { maskId, parseMockFailures, type ServerConfig } from '../config';
import { MockProvider } from '../core/providers/mock';
import { BedrockProvider } from '../core/providers/bedrock';
import type { LlmProvider } from '../core/providers/types';
import { runSegment, SegmentError } from '../core/segments';
import { SegmentRequestSchema } from './protocol';

export function createProvider(config: ServerConfig): LlmProvider | null {
  if (config.mode === 'live-mock') return new MockProvider({ failures: config.mockFailures });
  if (config.mode === 'live-bedrock') {
    return new BedrockProvider({ ...(config.region ? { region: config.region } : {}), ...(config.guardrail ? { guardrail: config.guardrail } : {}) });
  }
  return null;
}

export function health(config: ServerConfig) {
  return {
    mode: config.mode,
    live: config.mode !== 'scripted',
    provider: config.mode === 'live-mock' ? 'mock' : config.mode === 'live-bedrock' ? 'bedrock' : null,
    stallMs: config.stallMs,
    passcodeRequired: Boolean(config.passcode),
    bedrock: {
      configured: Boolean(config.modelId),
      region: config.region ?? null,
      model: maskId(config.modelId),
      fastModel: maskId(config.fastModelId),
      guardrail: Boolean(config.guardrail),
    },
  };
}

export type SegmentStart =
  | { ok: true; frames: AsyncGenerator<LiveFrame> }
  | { ok: false; status: number; message: string };

export function startSegment(
  body: unknown,
  headers: Record<string, string | string[] | undefined>,
  config: ServerConfig,
  provider: LlmProvider | null,
  log: (entry: Record<string, unknown>) => void,
  signal?: AbortSignal,
): SegmentStart {
  if (config.passcode && headers['x-demo-passcode'] !== config.passcode) return { ok: false, status: 401, message: 'Passcode required' };
  if (!provider) return { ok: false, status: 409, message: 'Live mode is off on this server' };
  const parsed = SegmentRequestSchema.safeParse(body);
  if (!parsed.success) return { ok: false, status: 400, message: 'Invalid request' };
  const bundle = getScenario(parsed.data.scenarioId);
  if (!bundle) return { ok: false, status: 404, message: 'Unknown scenario' };
  if (!bundle.scenario.segments[parsed.data.segment]) return { ok: false, status: 404, message: 'Unknown segment' };

  // Mock mode only: a request may ask for failures (e2e and fallback rehearsals).
  const mockFail = headers['x-mock-fail'];
  const runProvider =
    provider.name === 'mock' && typeof mockFail === 'string'
      ? new MockProvider({ failures: { ...config.mockFailures, ...parseMockFailures(mockFail) } })
      : provider;

  async function* frames(): AsyncGenerator<LiveFrame> {
    try {
      yield* runSegment({
        bundle: bundle!,
        segment: parsed.data!.segment,
        decisions: parsed.data!.decisions,
        context: parsed.data!.context,
        provider: runProvider,
        config,
        log: (entry) => log({ msg: 'turn', ...entry }),
        ...(signal ? { signal } : {}),
      });
    } catch (e) {
      // Never leak a stack trace to the presenter (CLAUDE.md §3.4).
      log({ msg: 'segment failed', error: e instanceof Error ? e.message : String(e) });
      yield { frame: 'error', message: e instanceof SegmentError ? e.message : 'Live segment failed' };
    }
  }
  return { ok: true, frames: frames() };
}
