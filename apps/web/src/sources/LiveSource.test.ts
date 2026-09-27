import { compile, type LiveFrame } from '@night-shift/engine';
import { incidentCheckout } from '@night-shift/scenarios';
import { describe, expect, it, vi } from 'vitest';

// When the first gate opens on the canonical take.
const GATE_T = compile(incidentCheckout.scenario).endT;
import { LiveSource, liveBeatsOf, readFrames, scriptedFallback } from './LiveSource';

const scenario = incidentCheckout.scenario;
const enc = new TextEncoder();

/** A controllable SSE body. */
function sseBody() {
  let ctrl!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start: (c) => (ctrl = c) });
  return {
    body,
    send: (f: LiveFrame) => ctrl.enqueue(enc.encode(`data: ${JSON.stringify(f)}\n\n`)),
    close: () => ctrl.close(),
  };
}

function harness(opts: { health?: 'ok' | 'down' | 'scripted' } = {}) {
  const streams: { segment: string; headers: Record<string, string>; sse: ReturnType<typeof sseBody> }[] = [];
  let clock = 0;
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    if (url.endsWith('/health')) {
      if (opts.health === 'down') throw new Error('offline');
      return new Response(JSON.stringify({ live: opts.health !== 'scripted', stallMs: 1000 }), { status: 200 });
    }
    const sse = sseBody();
    streams.push({ segment: JSON.parse(String(init?.body)).segment, headers: init?.headers as Record<string, string>, sse });
    return new Response(sse.body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
  }) as typeof fetch;
  let cb: ((n: number) => void) | null = null;
  const src = new LiveSource(
    scenario,
    { approver: 'Asha', speed: 4, raf: (f) => ((cb = f), 1), caf: () => (cb = null) },
    { apiBase: '/api', scenarioId: 'incident-checkout', fetchImpl, now: () => clock, passcode: 'pw' },
  );
  const frame = (dt: number) => {
    clock += dt;
    const f = cb;
    cb = null;
    f?.(clock);
  };
  return { src, streams, frame, tick: (n: number, dt = 100) => Array.from({ length: n }, () => frame(dt)) };
}

const liveThought = (beatId: string, text: string): LiveFrame => {
  const beat = liveBeatsOf(scenario, 'main').find((b) => b.id === beatId)!;
  return {
    frame: 'beat',
    beatId,
    outcome: 'live',
    events: beat.events.map((e) => (e.kind === 'thought' ? { ...e, text, source: 'live' } : { ...e, source: 'script' })) as LiveFrame extends { events: infer E } ? E : never,
  };
};

describe('LiveSource', () => {
  it('holds live beats, applies the server version, and reports live mode', async () => {
    const h = harness();
    await h.src.connect();
    await vi.waitFor(() => expect(h.streams.map((s) => s.segment)).toEqual(['main']));
    expect(h.streams[0]!.headers['x-demo-passcode']).toBe('pw');
    expect(h.streams[0]!.headers['x-amz-content-sha256']).toMatch(/^[0-9a-f]{64}$/);
    expect(h.src.getSnapshot().mode).toBe('live');
    h.src.start();
    h.src.play();
    h.tick(7); // speed 4 × 100 ms frames: reaches the a1.b04 hold, well under the 1 s stall limit
    expect(h.src.getSnapshot().holding).toBe('a1.b04');
    const t = h.src.getSnapshot().t;
    h.streams[0]!.sse.send(liveThought('a1.b04', 'Live words from the model.'));
    await vi.waitFor(() => expect(h.src.getSnapshot().holding).toBeNull());
    h.tick(10);
    expect(h.src.getSnapshot().t).toBeGreaterThan(t);
    const thoughts = h.src.getSnapshot().state.stream.filter((e) => e.type === 'thought');
    expect(thoughts.some((e) => e.type === 'thought' && e.text === 'Live words from the model.' && e.source === 'live')).toBe(true);
  });

  it('falls back to scripted when a live beat stalls', async () => {
    const h = harness();
    await h.src.connect();
    h.src.start();
    h.src.play();
    h.tick(7);
    expect(h.src.getSnapshot().holding).toBe('a1.b04');
    h.tick(12, 100); // 1.2 s > stallMs (1000)
    expect(h.src.getSnapshot().mode).toBe('fallback');
    h.tick(10);
    const first = h.src.getSnapshot().state.stream.find((e) => e.type === 'thought');
    expect(first).toMatchObject({ source: 'fallback', text: 'p99 latency on checkout-api is 4.8 seconds. The SLO is 800 milliseconds.' });
  });

  it('plays scripted in fallback mode when the server is down or not live', async () => {
    for (const health of ['down', 'scripted'] as const) {
      const h = harness({ health });
      await h.src.connect();
      expect(h.streams).toHaveLength(0);
      expect(h.src.getSnapshot().mode).toBe('fallback');
      h.src.start();
      h.src.play();
      h.tick(30);
      expect(h.src.getSnapshot().holding).toBeNull();
    }
  });

  it('degrades on a server error frame and on beats the server never sent', async () => {
    const h = harness();
    await h.src.connect();
    await vi.waitFor(() => expect(h.streams).toHaveLength(1));
    h.streams[0]!.sse.send({ frame: 'error', message: 'Live segment failed' });
    await vi.waitFor(() => expect(h.src.getSnapshot().mode).toBe('fallback'));

    const h2 = harness();
    await h2.src.connect();
    await vi.waitFor(() => expect(h2.streams).toHaveLength(1));
    h2.streams[0]!.sse.send({ frame: 'segment.end', segment: 'main', beats: 8, fallbacks: 0 });
    await vi.waitFor(() => expect(h2.src.getSnapshot().timeline.events.some((e) => e.source === 'fallback')).toBe(true));
    h2.src.start();
    h2.src.play();
    h2.tick(40);
    expect(h2.src.getSnapshot().holding).toBeNull();
  });

  it('requests the continuation segment after a gate decision, and switches modes', async () => {
    const h = harness();
    await h.src.connect();
    await vi.waitFor(() => expect(h.streams).toHaveLength(1));
    h.src.seek(GATE_T);
    h.src.decide('g1', 'approved');
    await vi.waitFor(() => expect(h.streams.map((s) => s.segment)).toEqual(['main', 'g1-approved']));

    expect(h.src.switchMode()).toBe(true);
    expect(h.src.getSnapshot().mode).toBe('scripted');
    expect(h.src.getSnapshot().holding).toBeNull();
    h.src.switchMode();
    expect(h.src.getSnapshot().mode).toBe('live');
    await vi.waitFor(() => expect(h.streams.length).toBeGreaterThanOrEqual(3));

    const before = h.streams.length;
    h.src.reset();
    expect(h.src.getSnapshot().t).toBe(0);
    await vi.waitFor(() => expect(h.streams.length).toBeGreaterThan(before));
    expect(h.streams.at(-1)!.segment).toBe('main');
  });
});

it('requests the continuation when a gate is auto-decided (regression)', async () => {
  const streams: string[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) =>
    url.endsWith('/health')
      ? new Response('{"live":true}')
      : (streams.push(JSON.parse(String(init?.body)).segment), new Response(new ReadableStream()))) as typeof fetch;
  const src = new LiveSource(
    scenario,
    { approver: 'A', seek: GATE_T, autoDecide: { g1: 'approved' }, raf: () => 1, caf: () => {} },
    { apiBase: '', scenarioId: 'incident-checkout', fetchImpl },
  );
  await src.connect();
  src.seek(GATE_T);
  await vi.waitFor(() => expect(streams).toContain('g1-approved'));
});

describe('live helpers', () => {
  it('parses SSE frames across chunk boundaries and ignores comments', async () => {
    const parts = [': ping\n\ndata: {"frame":"segment', '.end","segment":"main","beats":0,"fallbacks":0}\n\n'];
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        for (const p of parts) c.enqueue(enc.encode(p));
        c.close();
      },
    });
    const frames: LiveFrame[] = [];
    for await (const f of readFrames(body)) frames.push(f);
    expect(frames).toEqual([{ frame: 'segment.end', segment: 'main', beats: 0, fallbacks: 0 }]);
  });

  it('marks only text events as fallback', () => {
    const beat = liveBeatsOf(scenario, 'main').find((b) => b.id === 'a1.b04')!;
    expect(scriptedFallback(beat).events.map((e) => `${e.kind}:${e.source}`)).toEqual(['tool.result:script', 'thought:fallback']);
    expect(liveBeatsOf(scenario, 'nope')).toEqual([]);
  });
});
