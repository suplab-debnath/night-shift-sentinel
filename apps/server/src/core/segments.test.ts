import { incidentCheckout } from '@night-shift/scenarios';
import { describe, expect, it } from 'vitest';
import type { LiveFrame } from '@night-shift/engine';
import { testConfig } from '../test-helpers';
import { MockProvider } from './providers/mock';
import { liveBeats, runSegment, SegmentError } from './segments';

async function collect(gen: AsyncGenerator<LiveFrame>) {
  const out: LiveFrame[] = [];
  for await (const f of gen) out.push(f);
  return out;
}

describe('director', () => {
  it('streams one frame per live beat, then segment.end', async () => {
    const log: string[] = [];
    const frames = await collect(
      runSegment({ bundle: incidentCheckout, segment: 'main', decisions: [], context: '', provider: new MockProvider({ delayScale: 0 }), config: testConfig(), log: (e) => log.push(e.beat) }),
    );
    const beats = frames.filter((f) => f.frame === 'beat');
    expect(beats.map((f) => f.frame === 'beat' && f.beatId).sort()).toEqual(liveBeats(incidentCheckout, 'main').map((b) => b.id).sort());
    expect(beats.every((f) => f.frame === 'beat' && f.outcome === 'live')).toBe(true);
    expect(frames.at(-1)).toEqual({ frame: 'segment.end', segment: 'main', beats: 8, fallbacks: 0 });
    expect(log).toHaveLength(8);
  });

  it('counts fallbacks, handles segments without live beats, and rejects unknown segments', async () => {
    const provider = new MockProvider({ delayScale: 0, failures: { 'a1.b04': 'invalid', 'a3.b12': 'error' } });
    const frames = await collect(runSegment({ bundle: incidentCheckout, segment: 'main', decisions: [], context: '', provider, config: testConfig({ concurrency: 1 }) }));
    expect(frames.at(-1)).toMatchObject({ fallbacks: 2 });
    const chaos = await collect(runSegment({ bundle: incidentCheckout, segment: 'chaos', decisions: [], context: '', provider, config: testConfig() }));
    expect(chaos).toEqual([{ frame: 'segment.end', segment: 'chaos', beats: 0, fallbacks: 0 }]);
    expect(() => liveBeats(incidentCheckout, 'nope')).toThrow(SegmentError);
  });

  it('stops when aborted', async () => {
    const abort = new AbortController();
    abort.abort();
    const frames = await collect(
      runSegment({ bundle: incidentCheckout, segment: 'main', decisions: [], context: '', provider: new MockProvider({ delayScale: 0 }), config: testConfig(), signal: abort.signal }),
    );
    expect(frames).toEqual([]);
  });
});
