import { describe, expect, it } from 'vitest';
import { formatClock, parseClock } from './clock';
import { compile, resolveRunText, storyClock, type Decision } from './compile';
import { createPlayer } from './player';
import { formatSpan, resolveTokens, runClockAnchors } from './runclock';
import { parseScenario, type ScenarioInput } from './schema';
import { FIX, fixture, fixtureInput } from './test-fixture';

const approve = (waitedMs?: number): Decision => ({ type: 'gate', gateId: 'g1', decision: 'approved', by: 'Asha', ...(waitedMs ? { waitedMs } : {}) });

describe('run clock (D-074)', () => {
  it('counts the time a person took at the gate', () => {
    const quick = compile(fixture, [approve()]);
    const slow = compile(fixture, [approve(42_000)]);
    const after = FIX.g1ResolveT + 10;
    expect(parseClock(storyClock(slow, after)) - parseClock(storyClock(quick, after))).toBe(42);
    expect(storyClock(slow, FIX.g1RequestT - 1)).toBe(storyClock(quick, FIX.g1RequestT - 1));
    expect(slow.gateWaits).toEqual({ g1: 42_000 });
  });

  it('counts squad pauses from where they happened, and seeking before one clears it', () => {
    const tl = compile(fixture, [{ type: 'hold', at: 1500, ms: 20_000 }]);
    expect(storyClock(tl, 1400)).toBe('02:07:01');
    expect(storyClock(tl, 2000)).toBe('02:07:22');
    expect(() => compile(fixture, [{ type: 'hold', at: -1, ms: 5 }])).toThrow();
    const p = createPlayer(fixture);
    p.seek(1500);
    p.holdClock(20_000);
    expect(p.getSnapshot().decisions).toEqual([{ type: 'hold', at: 1500, ms: 20_000 }]);
    p.seek(1000);
    expect(p.getSnapshot().decisions).toEqual([]);
  });

  it('fast-forwards at a labelled rate and stands still during chaos', () => {
    const input = JSON.parse(JSON.stringify(fixtureInput)) as ScenarioInput;
    const a1 = input.segments.main!.acts[0]!;
    a1.beats[1]!.events.unshift({ kind: 'clock.rate', rate: 4, label: 'Rolling out' } as never);
    a1.beats[2]!.events.unshift({ kind: 'clock.rate', rate: 1 } as never);
    const tl = compile(parseScenario(input));
    const b2 = tl.beats.find((b) => b.id === 'a1.b02')!.t;
    const b3 = tl.beats.find((b) => b.id === 'a1.b03')!.t;
    expect(parseClock(storyClock(tl, b3)) - parseClock(storyClock(tl, b2))).toBe(Math.round(((b3 - b2) * 4) / 1000));
    const chaos = compile(fixture, [{ type: 'chaos', at: FIX.g1RequestT }]);
    const w = chaos.chaosWindows[0]!;
    expect(storyClock(chaos, w.end - 1)).toBe(storyClock(chaos, w.start));
  });

  it('builds anchors that extrapolate past the end', () => {
    const anchors = runClockAnchors({ startSec: 100, events: [], jumps: [{ t: 1000, sec: 10 }], stops: [], endT: 2000 });
    const at = (t: number) => anchors.filter((a) => a.t <= t).at(-1)!;
    expect(at(1000).sec).toBe(111);
    expect(anchors.at(-1)!.t).toBeGreaterThan(2000);
  });
});

describe('run-time tokens (SCENARIO §11.2)', () => {
  const ctx = { beatSec: (id: string) => ({ a: parseClock('02:07:14'), b: parseClock('02:09:32') })[id as 'a' | 'b'], nowSec: parseClock('02:10:05'), waitSec: { g1: 12, g2: 30 } };
  it('fills clocks, spans, and waits', () => {
    expect(resolveTokens('now {{clock}} / {{hm}}', ctx)).toBe('now 02:10:05 / 02:10');
    expect(resolveTokens('at {{clock:b}} ({{hm:x|b}})', ctx)).toBe('at 02:09:32 (02:09)');
    expect(resolveTokens('{{since:a}} after the alert', ctx)).toBe('2 min 51 s after the alert');
    expect(resolveTokens('{{span:a:b}}', ctx)).toBe('2 min 18 s');
    expect(resolveTokens('{{wait:g1}} / {{wait}}', ctx)).toBe('12 s / 42 s');
    expect(resolveTokens('{{clock:missing}}', ctx)).toBe('{{clock:missing}}');
    expect(formatSpan(300)).toBe('5 min');
  });
  it('resolves inside compiled events and scenario-level text', () => {
    const input = JSON.parse(JSON.stringify(fixtureInput)) as ScenarioInput;
    const thought = input.segments.main!.acts[0]!.beats[1]!.events.find((e) => e.kind === 'thought')!;
    Object.assign(thought, { text: 'Seen at {{clock}}, {{since:a1.b01}} in.' });
    const tl = compile(parseScenario(input), [approve(5000)]);
    const e = tl.events.find((x) => x.kind === 'thought')!;
    expect(e.kind === 'thought' && e.text).toBe(`Seen at ${e.clock}, 1 s in.`);
    expect(resolveRunText('{{wait:g1}}', tl, tl.endT)).toBe('5 s');
    expect(resolveRunText('{{hm}}', tl, 0)).toBe(formatClock(parseClock('02:07:00')).slice(0, 5));
  });
});

describe('run clock rounding (regression)', () => {
  it('formats a whole second the same whatever the interpolation error', () => {
    expect(formatClock(7630 - 1e-9)).toBe(formatClock(7630));
    expect(formatClock(7629.9)).toBe('02:07:09');
  });
  it('gives an event the same clock whether the timeline ends at a gate or later', () => {
    const chaosFirst = compile(fixture, [{ type: 'chaos', at: 8056 }]);
    const later = compile(fixture, [{ type: 'chaos', at: 8056 }, approve()]);
    for (const e of chaosFirst.events) expect(later.events.find((x) => x.id === e.id)?.clock).toBe(e.clock);
  });
});
