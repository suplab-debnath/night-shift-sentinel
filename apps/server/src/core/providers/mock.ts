// Mock provider: replays the scripted text through the live path (ARCHITECTURE §7.4),
// with seeded, realistic delays. Can be told to fail per beat for fallback tests.
import { hashString, mulberry32 } from '@night-shift/engine';
import type { MockFailure } from '../../config';
import { ProviderError, type ConverseRequest, type LlmProvider, type ProviderDelta } from './types';

export interface MockOptions {
  failures?: Record<string, MockFailure>;
  /** Scales every delay; 0 in unit tests. */
  delayScale?: number;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new ProviderError('aborted', 'aborted'));
    const id = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(id);
        reject(new ProviderError('aborted', 'aborted'));
      },
      { once: true },
    );
  });
}

export class MockProvider implements LlmProvider {
  readonly name = 'mock' as const;
  constructor(private readonly opts: MockOptions = {}) {}

  async *converseStream(req: ConverseRequest): AsyncIterable<ProviderDelta> {
    const mock = req.mock;
    if (!mock) throw new ProviderError('mock provider needs scripted text', 'config');
    const scale = this.opts.delayScale ?? 1;
    const rng = mulberry32(hashString(`${mock.beatId}:${req.messages.length}`));
    const failure = this.opts.failures?.[mock.beatId];

    if (failure === 'error') throw new ProviderError('mock provider error', 'provider');
    if (failure === 'timeout') {
      await sleep(3_600_000, req.signal);
      return;
    }
    await sleep((250 + rng() * 350) * scale * (failure === 'slow' ? 20 : 1), req.signal);

    // First round: use the beat's scripted tool once, to exercise the tool loop.
    const alreadyUsedTool = req.messages.some((m) => m.content.some((c) => 'toolResult' in c));
    const tool = mock.toolCall && req.tools.some((t) => t.name === mock.toolCall!.name) ? mock.toolCall : undefined;
    if (tool && !alreadyUsedTool) {
      yield { type: 'toolUse', id: `mock-${mock.beatId}`, name: tool.name, input: tool.input };
      yield { type: 'stop', reason: 'tool_use' };
      return;
    }

    const text = failure === 'invalid' ? 'Everything is fine!' : mock.text;
    // About 30 chunks whatever the length, so long documents stream in about a second.
    const words = text.split(/(?<=\s)/);
    const per = Math.max(3, Math.ceil(words.length / 30));
    for (let i = 0; i < words.length; i += per) {
      await sleep((20 + rng() * 40) * scale, req.signal);
      yield { type: 'text', text: words.slice(i, i + per).join('') };
    }
    yield { type: 'usage', inputTokens: 400 + Math.round(rng() * 200), outputTokens: Math.ceil(text.length / 4) };
    yield { type: 'stop', reason: 'end_turn' };
  }
}
