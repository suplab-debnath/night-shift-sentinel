import { describe, expect, it } from 'vitest';
import { compile, InvalidDecisionError, storyClock, type Decision } from './compile';
import { parseClock } from './clock';
import { parseScenario } from './schema';
import { FIX, fixture, fixtureInput } from './test-fixture';

const approve: Decision = { type: 'gate', gateId: 'g1', decision: 'approved', by: 'Asha' };
const reject: Decision = { type: 'gate', gateId: 'g1', decision: 'rejected', by: 'Asha' };

describe('compile', () => {
  it('builds the main path up to the first gate', () => {
    const tl = compile(fixture);
    expect(tl.end).toEqual({ kind: 'gate', gateId: 'g1' });
    expect(tl.endT).toBe(FIX.g1RequestT);
    expect(tl.events.at(-1)?.kind).toBe('gate.request');
    expect(tl.gatePoints).toEqual([{ gateId: 'g1', requestT: FIX.g1RequestT, resolveT: null }]);
    expect(tl.acts.map((a) => a.n)).toEqual([1, 2, 4, 5]);
    // Sorted by time, unique ids, all scripted.
    const ts = tl.events.map((e) => e.t);
    expect([...ts].sort((a, b) => a - b)).toEqual(ts);
    expect(new Set(tl.events.map((e) => e.id)).size).toBe(tl.events.length);
    expect(tl.events.every((e) => e.source === 'script' && typeof e.clock === 'string')).toBe(true);
  });

  it('applies offsets and interleaves beats by time', () => {
    const tl = compile(fixture);
    const metric = tl.events.find((e) => e.kind === 'metric.update');
    expect(metric?.t).toBe(400);
    const msg = tl.events.find((e) => e.kind === 'message.send');
    expect(msg?.t).toBe(2500);
    expect(tl.beats.find((b) => b.id === 'a1.b03')?.endT).toBe(2500);
    expect(tl.beats.find((b) => b.id === 'a1.b01')?.endT).toBe(400);
  });

  it('appends the approve continuation with the decision-maker recorded', () => {
    const tl = compile(fixture, [approve]);
    expect(tl.end).toEqual({ kind: 'end', ending: 'A' });
    const resolve = tl.events.find((e) => e.kind === 'gate.resolve');
    expect(resolve).toMatchObject({ t: FIX.g1ResolveT, decision: 'approved', by: 'Asha', clock: storyClock(tl, FIX.g1ResolveT) });
    expect(tl.decisionPoints).toEqual([FIX.g1RequestT]);
    expect(tl.gatePoints[0]?.resolveT).toBe(FIX.g1ResolveT);
    expect(tl.endT).toBe(FIX.g1ResolveT + 500 + 4000 + 3000);
  });

  it('follows reject → g2 approve and reject → g2 reject', () => {
    const a = compile(fixture, [reject, { type: 'gate', gateId: 'g2', decision: 'approved', by: 'Asha' }]);
    expect(a.end).toEqual({ kind: 'end', ending: 'A' });
    expect(a.gatePoints.map((g) => g.gateId)).toEqual(['g1', 'g2']);
    const b = compile(fixture, [reject, { type: 'gate', gateId: 'g2', decision: 'rejected', by: 'Asha' }]);
    expect(b.end).toEqual({ kind: 'end', ending: 'B' });
    const resolves = b.events.filter((e) => e.kind === 'gate.resolve');
    expect(resolves.map((e) => (e.kind === 'gate.resolve' ? e.decision : ''))).toEqual(['rejected', 'rejected']);
  });

  it('rejects invalid decisions', () => {
    expect(() => compile(fixture, [{ type: 'gate', gateId: 'g2', decision: 'approved', by: 'x' }])).toThrow(InvalidDecisionError);
    expect(() => compile(fixture, [approve, approve])).toThrow(/not awaiting/);
    expect(() => compile(fixture, [{ type: 'chaos', at: 100 }])).toThrow(/not available/);
    expect(() => compile(fixture, [{ type: 'chaos', at: 999999 }])).toThrow(/not available/);
    expect(() =>
      compile(fixture, [
        { type: 'chaos', at: 9000 },
        { type: 'chaos', at: 9500 },
      ]),
    ).toThrow(/already running/);
  });

  it('rejects broken gate wiring', () => {
    const noSeg = JSON.parse(JSON.stringify(fixtureInput)) as typeof fixtureInput;
    const s = parseScenario(noSeg);
    const broken = { ...s, gates: { ...s.gates, g1: { onApprove: 'ghost', onReject: 'g1-rejected' } } };
    expect(() => compile(broken, [approve])).toThrow(/Unknown segment "ghost"/);
    const noGate = { ...s, gates: {} };
    expect(() => compile(noGate, [approve])).toThrow(/Unknown gate/);
    const loop = { ...s, gates: { ...s.gates, g1: { onApprove: 'chaos', onReject: 'chaos' } } };
    expect(() => compile(loop, [approve])).toThrow(/cannot follow a gate/);
    const mainChaos = { ...s, segments: { ...s.segments, main: s.segments.chaos! } };
    expect(() => compile(mainChaos)).toThrow(/cannot return/);
    const noMain = { ...s, segments: {} };
    expect(() => compile(noMain)).toThrow(/Unknown segment "main"/);
  });

  it('splices chaos in at the trigger and shifts the rest', () => {
    const at = 8500;
    const base = compile(fixture);
    const tl = compile(fixture, [{ type: 'chaos', at }]);
    expect(tl.chaosWindows).toEqual([{ start: at, end: at + FIX.chaosDuration }]);
    expect(tl.endT).toBe(base.endT + FIX.chaosDuration);
    const start = tl.events.findIndex((e) => e.kind === 'chaos.start');
    expect(tl.events[start]?.t).toBe(at);
    expect(tl.events.slice(0, start).every((e) => e.t <= at)).toBe(true);
    const shifted = tl.events.find((e) => e.kind === 'guardrail.check' && e.policyId === 'P-04');
    expect(shifted?.t).toBe(9000 + FIX.chaosDuration);
    expect(tl.beats.find((b) => b.id === 'a4.b01')?.endT).toBe(9000 + FIX.chaosDuration);
    expect(tl.acts.some((a) => a.overlay && a.n === 8)).toBe(true);
    expect(tl.events.find((e) => e.id === 'c.b01.r1.e0')).toBeDefined();
    // The story clock holds during chaos.
    expect(storyClock(tl, at)).toBe(storyClock(tl, at + FIX.chaosDuration));
  });

  it('allows chaos at an open gate and at the end card', () => {
    const atGate = compile(fixture, [{ type: 'chaos', at: FIX.g1RequestT }]);
    expect(atGate.end).toEqual({ kind: 'gate', gateId: 'g1' });
    expect(atGate.endT).toBe(FIX.g1RequestT + FIX.chaosDuration);
    const approved = compile(fixture, [approve]);
    const atEnd = compile(fixture, [approve, { type: 'chaos', at: approved.endT }]);
    expect(atEnd.endT).toBe(approved.endT + FIX.chaosDuration);
    const twice = compile(fixture, [approve, { type: 'chaos', at: approved.endT }, { type: 'chaos', at: approved.endT + FIX.chaosDuration }]);
    expect(twice.chaosWindows).toHaveLength(2);
    expect(new Set(twice.events.map((e) => e.id)).size).toBe(twice.events.length);
  });

  it('delays the continuation when chaos runs in the gate gap', () => {
    const tl = compile(fixture, [approve, { type: 'chaos', at: FIX.g1RequestT + 100 }]);
    expect(tl.gatePoints[0]?.resolveT).toBe(FIX.g1ResolveT + FIX.chaosDuration);
    expect(tl.events.find((e) => e.kind === 'gate.resolve')?.t).toBe(FIX.g1ResolveT + FIX.chaosDuration);
  });

  it('shifts a later gate when chaos runs before it is decided', () => {
    const tl = compile(fixture, [{ type: 'chaos', at: 9000 }, approve]);
    expect(tl.gatePoints[0]?.requestT).toBe(FIX.g1RequestT + FIX.chaosDuration);
    expect(tl.gatePoints[0]?.resolveT).toBe(FIX.g1RequestT + FIX.chaosDuration + 600);
  });

  it('runs the story clock in real time, then time-lapses (D-074)', () => {
    const tl = compile(fixture, [approve]);
    expect(storyClock(tl, 0)).toBe('02:07:00');
    expect(storyClock(tl, 1000)).toBe('02:07:01');
    expect(storyClock(tl, 5000)).toBe('02:07:05');
    const ev = tl.events.find((e) => e.kind === 'timelapse')!;
    const before = parseClock(storyClock(tl, ev.t - 1));
    expect(parseClock(ev.clock!) - before).toBeGreaterThanOrEqual(300);
    // Every emitted clock follows the run clock.
    for (const e of tl.events) expect(e.clock).toBe(storyClock(tl, e.t));
  });
});
