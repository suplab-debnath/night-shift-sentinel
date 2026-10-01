import { describe, expect, it } from 'vitest';
import { beatShift, clampPace, compile, pickTake, STREAM_CPS, thinkMs } from './compile';
import { createPlayer } from './player';
import { initialStageState, reduce } from './reducer';
import { parseScenario, ScenarioValidationError, type ScenarioInput } from './schema';
import { fixtureInput } from './test-fixture';

const ALT = ['p99 is at 4.8 seconds.', 'Latency p99 reads 4.8 seconds.'];

/** Fixture with alternates on the a1.b02 thought and jitter on a1.b03. */
function withTakes(): ScenarioInput {
  const input = JSON.parse(JSON.stringify(fixtureInput)) as ScenarioInput;
  const act = input.segments.main!.acts[0]!;
  const b2 = act.beats.find((b) => b.id === 'a1.b02')!;
  const thought = b2.events.find((e) => e.kind === 'thought')!;
  Object.assign(thought, { alt: ALT });
  Object.assign(act.beats.find((b) => b.id === 'a1.b03')!, { jitterMs: 300 });
  return input;
}

const thoughtText = (take: number) => {
  const tl = compile(parseScenario(withTakes()), [], { take });
  const e = tl.events.find((x) => x.kind === 'thought');
  return e?.kind === 'thought' ? e.text : null;
};

describe('takes', () => {
  it('take 0 is the canonical script with no spread', () => {
    const plain = compile(parseScenario(fixtureInput));
    const take0 = compile(parseScenario(withTakes()), [], { take: 0 });
    expect(take0.events.map((e) => [e.id, e.t, e.kind === 'thought' ? e.text : ''])).toEqual(
      plain.events.map((e) => [e.id, e.t, e.kind === 'thought' ? e.text : '']),
    );
  });

  it('is deterministic per take and varies across takes', () => {
    const texts = new Set<string | null>();
    for (let take = 1; take <= 40; take++) {
      expect(thoughtText(take)).toBe(thoughtText(take));
      texts.add(thoughtText(take));
    }
    expect(texts).toEqual(new Set(['p99 latency is 4.8 seconds.', ...ALT]));
    expect(pickTake(7, 'x', 0)).toBe(0);
  });

  it('spreads beat starts within ±jitterMs and keeps the timeline sorted', () => {
    const shifts = new Set<number>();
    for (let take = 1; take <= 30; take++) {
      const shift = beatShift(take, 'a1.b03', 300);
      expect(Math.abs(shift)).toBeLessThanOrEqual(300);
      shifts.add(shift);
      const tl = compile(parseScenario(withTakes()), [], { take });
      expect(tl.beats.find((b) => b.id === 'a1.b03')?.t).toBe(2000 + shift);
      const ts = tl.events.map((e) => e.t);
      expect([...ts].sort((a, b) => a - b)).toEqual(ts);
    }
    expect(shifts.size).toBeGreaterThan(5);
    expect(beatShift(0, 'a1.b03', 300)).toBe(0);
    expect(beatShift(3, 'a1.b03', undefined)).toBe(0);
  });

  it('players keep their take through decisions and reset', () => {
    const scenario = parseScenario(withTakes());
    const take = [...Array(40).keys()].find((k) => thoughtText(k) === ALT[1])!;
    const player = createPlayer(scenario, { take });
    player.reset();
    const tl = player.getSnapshot().timeline;
    const e = tl.events.find((x) => x.kind === 'thought');
    expect(e?.kind === 'thought' && e.text).toBe(ALT[1]);
  });

  it('never lets alt reach an emitted event, including through overrides', () => {
    const scenario = parseScenario(withTakes());
    const beat = scenario.segments.main!.acts[0]!.beats.find((b) => b.id === 'a1.b02')!;
    const tl = compile(scenario, [], {
      take: 3,
      overrides: { 'a1.b02': { events: beat.events.map((e) => ({ ...e, source: 'fallback' as const })) } },
    });
    expect(tl.events.some((e) => 'alt' in e)).toBe(false);
    expect(compile(scenario, [], { take: 3 }).events.some((e) => 'alt' in e)).toBe(false);
  });

  it('rejects alt on events without text', () => {
    const input = withTakes();
    const b1 = input.segments.main!.acts[0]!.beats[0]!;
    Object.assign(b1.events[0]!, { alt: ['x'] });
    expect(() => parseScenario(input)).toThrow(ScenarioValidationError);
  });
});

describe('investigation events', () => {
  const init = () => initialStageState({ initialMetrics: { p99: 180, errorRate: 0.2, poolActive: 22 }, clock: '02:07:00' });

  it('records failed tool calls in the stream and the audit trail', () => {
    const s = reduce(init(), {
      id: 'e1',
      t: 5,
      source: 'script',
      kind: 'tool.result',
      agent: 'sentinel',
      callId: 's-1',
      summary: 'traces.get timed out after 5 s',
      status: 'error',
    });
    expect(s.stream[0]).toMatchObject({ type: 'tool.result', status: 'error' });
    expect(s.audit[0]).toMatchObject({ severity: 'warn', category: 'tool', text: 'Tool call failed: traces.get timed out after 5 s' });
    const ok = reduce(init(), { id: 'e2', t: 5, source: 'script', kind: 'tool.result', agent: 'sentinel', callId: 's-2', summary: 'ok' });
    expect(ok.stream[0]).toMatchObject({ status: 'ok' });
    expect(ok.audit).toHaveLength(0);
  });

  it('pins hypotheses and rules them out', () => {
    let s = reduce(init(), {
      id: 'e1',
      t: 1,
      source: 'script',
      kind: 'evidence.pin',
      cardId: 'hyp-db',
      agent: 'log-detective',
      text: 'Hypothesis: orders-db is overloaded',
      evidenceKind: 'hypothesis',
    });
    expect(s.evidence.cards[0]).toMatchObject({ kind: 'hypothesis', ruledOut: null });
    s = reduce(s, { id: 'e2', t: 9, source: 'script', kind: 'evidence.ruleOut', cardId: 'hyp-db', reason: 'orders-db at 22% CPU' });
    expect(s.evidence.cards[0]?.ruledOut).toEqual({ reason: 'orders-db at 22% CPU', t: 9 });
    s = reduce(s, { id: 'e3', t: 10, source: 'script', kind: 'evidence.ruleOut', cardId: 'missing', reason: 'x' });
    expect(s.evidence.cards).toHaveLength(1);
  });

  it('collects channel posts, which a chaos run discards', () => {
    let s = reduce(init(), { id: 'e1', t: 1, source: 'script', kind: 'channel.post', author: 'Pager', text: 'Alert fired' });
    expect(s.channel).toEqual([{ id: 'e1', t: 1, clock: '02:07:00', author: 'Pager', agent: null, text: 'Alert fired' }]);
    s = reduce(s, { id: 'e2', t: 2, source: 'script', kind: 'chaos.start' });
    s = reduce(s, { id: 'e3', t: 3, source: 'script', kind: 'channel.post', author: 'Scribe', agent: 'scribe', text: 'x' });
    s = reduce(s, { id: 'e4', t: 4, source: 'script', kind: 'chaos.end' });
    expect(s.channel).toHaveLength(1);
  });
});

describe('pace (DECISIONS D-072)', () => {
  const approve = { type: 'gate' as const, gateId: 'g1', decision: 'approved' as const, by: 'Asha' };
  const STREAM = ['thought', 'tool.call', 'tool.result', 'message.send'];

  it('pace 1 is the authored timing', () => {
    const scenario = parseScenario(fixtureInput);
    expect(compile(scenario, [approve], { pace: 1 }).events).toEqual(compile(scenario, [approve]).events);
  });

  it('slows everything and gives each line reading time and a thinking pause', () => {
    const scenario = parseScenario(fixtureInput);
    const base = compile(scenario, [approve]);
    for (const take of [0, 7]) {
      const slow = compile(scenario, [approve], { pace: 1.5, take });
      const byId = new Map(slow.events.map((e) => [e.id, e]));
      for (const b of base.events) {
        const s = byId.get(b.id)!;
        expect(s.t).toBeGreaterThanOrEqual(b.t * 1.5 - 1e-6);
        if (b.kind === 'metric.update' && s.kind === 'metric.update') expect(s.durationMs).toBeCloseTo(b.durationMs * 1.5, 6);
      }
      const stream = slow.events.filter((e) => STREAM.includes(e.kind));
      stream.forEach((e, i) => {
        const prev = stream[i - 1];
        if (!prev || prev.kind !== 'thought') return;
        expect(e.t - prev.t, `${prev.id} → ${e.id}`).toBeGreaterThanOrEqual((prev.text.length / STREAM_CPS) * 1000);
      });
      for (const e of stream) {
        if (e.kind !== 'thought') continue;
        const before = stream.filter((x) => x.t < e.t).at(-1);
        if (before) expect(e.t - before.t).toBeGreaterThanOrEqual(700);
      }
      expect(thinkMs(0, 'x')).toBe(1000);
      expect(thinkMs(take, 'x')).toBeGreaterThanOrEqual(700);
      const ts = slow.events.map((e) => e.t);
      expect([...ts].sort((a, b) => a - b)).toEqual(ts);
      expect(slow.endT).toBeGreaterThan(base.endT * 1.5);
    }
  });

  it('clamps pace to 1–3 and players keep it through decisions', () => {
    expect(clampPace(undefined)).toBe(1);
    expect(clampPace(0.2)).toBe(1);
    expect(clampPace(9)).toBe(3);
    expect(clampPace(Number.NaN)).toBe(1);
    const scenario = parseScenario(fixtureInput);
    const player = createPlayer(scenario, { pace: 2 });
    const endT = player.getSnapshot().timeline.endT;
    expect(endT).toBe(compile(scenario, [], { pace: 2 }).endT);
    player.seek(endT);
    player.decide('g1', 'approved');
    expect(player.getSnapshot().timeline.endT).toBe(compile(scenario, [approve], { pace: 2 }).endT);
  });
});
