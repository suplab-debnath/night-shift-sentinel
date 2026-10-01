import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import type { Decision } from './compile';
import { createPlayer, MAX_SPEED, MIN_SPEED, type Player } from './player';
import { FIX, fixture } from './test-fixture';

function runUntil(p: Player, pred: () => boolean, dt = 100, max = 10000) {
  p.play();
  for (let i = 0; i < max && !pred(); i++) p.advance(dt);
}

describe('player basics', () => {
  it('starts at t=0 with t=0 events applied and paused', () => {
    const p = createPlayer(fixture);
    const s = p.getSnapshot();
    expect(s.t).toBe(0);
    expect(s.status).toBe('paused');
    expect(s.state.titleCard?.title).toMatch(/02:07/);
    expect(s.clock).toBe('02:07:00');
    expect(s.canChaos).toBe(false);
    expect(s.currentAct).toBe(1);
  });

  it('does nothing while paused or for non-positive dt', () => {
    const p = createPlayer(fixture);
    expect(p.advance(1000)).toEqual([]);
    p.play();
    expect(p.advance(0)).toEqual([]);
    expect(p.getSnapshot().t).toBe(0);
  });

  it('advances, emits events in order, and applies speed', () => {
    const p = createPlayer(fixture, { speed: 2 });
    p.play();
    const emitted = p.advance(500);
    expect(p.getSnapshot().t).toBe(1000);
    expect(emitted.map((e) => e.kind)).toEqual(['metric.update', 'agent.state', 'tool.call', 'thought']);
    p.setSpeed(100);
    expect(p.getSnapshot().speed).toBe(MAX_SPEED);
    p.setSpeed(0);
    expect(p.getSnapshot().speed).toBe(MIN_SPEED);
    p.setSpeed(Number.NaN);
    expect(p.getSnapshot().speed).toBe(1);
  });

  it('notifies subscribers and supports unsubscribe', () => {
    const p = createPlayer(fixture);
    const fn = vi.fn();
    const off = p.subscribe(fn);
    p.play();
    p.advance(1000);
    expect(fn).toHaveBeenCalled();
    const last = fn.mock.calls.at(-1)!;
    expect(last[1].length).toBeGreaterThan(0);
    off();
    fn.mockClear();
    p.advance(100);
    expect(fn).not.toHaveBeenCalled();
  });

  it('toggles play and pause', () => {
    const p = createPlayer(fixture);
    p.togglePlay();
    expect(p.getSnapshot().playing).toBe(true);
    p.togglePlay();
    expect(p.getSnapshot().status).toBe('paused');
  });
});

describe('gates', () => {
  it('waits at a gate, then resumes after a decision', () => {
    const p = createPlayer(fixture);
    runUntil(p, () => p.getSnapshot().status === 'awaitingGate');
    const s = p.getSnapshot();
    expect(s.t).toBe(FIX.g1RequestT);
    expect(s.pendingGateId).toBe('g1');
    expect(s.state.gate?.status).toBe('open');
    expect(p.advance(1000)).toEqual([]);
    expect(p.decide('g2', 'approved')).toBe(false);
    const atGate = s.clock;
    expect(p.decide('g1', 'approved', 'Asha')).toBe(true);
    expect(p.getSnapshot().status).toBe('playing');
    p.advance(1000);
    const after = p.getSnapshot();
    expect(after.state.gate).toMatchObject({ status: 'approved', by: 'Asha' });
    expect(after.clock > atGate).toBe(true);
    runUntil(p, () => p.getSnapshot().status === 'ended');
    expect(p.getSnapshot().playing).toBe(false);
    expect(p.getSnapshot().state.endCard).not.toBeNull();
    p.play();
    expect(p.getSnapshot().playing).toBe(false);
  });

  it('refuses decisions when no gate is open', () => {
    const p = createPlayer(fixture);
    expect(p.decide('g1', 'approved')).toBe(false);
  });

  it('uses the default approver', () => {
    const p = createPlayer(fixture, { defaultApprover: 'On-call engineer' });
    p.seek(FIX.g1RequestT);
    p.decide('g1', 'rejected');
    p.seek(FIX.g1ResolveT);
    expect(p.getSnapshot().state.gate?.by).toBe('On-call engineer');
  });

  it('clears a decision when seeking before it', () => {
    const p = createPlayer(fixture);
    p.seek(FIX.g1RequestT);
    p.decide('g1', 'approved');
    p.seek(FIX.g1ResolveT + 2000);
    expect(p.getSnapshot().decisions).toHaveLength(1);
    p.seek(FIX.g1ResolveT - 1);
    expect(p.getSnapshot().decisions).toHaveLength(1);
    p.seek(FIX.g1RequestT);
    const s = p.getSnapshot();
    expect(s.decisions).toHaveLength(0);
    expect(s.t).toBe(FIX.g1RequestT);
    expect(s.status).toBe('awaitingGate');
  });

  it('accepts initial decisions', () => {
    const p = createPlayer(fixture, { decisions: [{ type: 'gate', gateId: 'g1', decision: 'approved', by: 'X' }] });
    expect(p.getSnapshot().timeline.end.kind).toBe('end');
  });
});

describe('navigation', () => {
  it('steps forward and back across beat boundaries', () => {
    const p = createPlayer(fixture);
    p.stepForward();
    expect(p.getSnapshot().t).toBe(400);
    p.stepForward();
    expect(p.getSnapshot().t).toBe(1000);
    p.stepBack();
    expect(p.getSnapshot().t).toBe(400);
    p.stepBack();
    p.stepBack();
    expect(p.getSnapshot().t).toBe(0);
    p.seek(FIX.g1RequestT);
    p.stepForward();
    expect(p.getSnapshot().t).toBe(FIX.g1RequestT);
  });

  it('steps back over a gate decision and clears it', () => {
    const p = createPlayer(fixture);
    p.seek(FIX.g1RequestT);
    p.decide('g1', 'approved');
    p.stepForward();
    expect(p.getSnapshot().t).toBe(FIX.g1ResolveT);
    p.stepBack();
    expect(p.getSnapshot().decisions).toHaveLength(0);
  });

  it('jumps to acts, auto-approving past an open gate', () => {
    const p = createPlayer(fixture);
    expect(p.jumpToAct(2)).toBe(true);
    expect(p.getSnapshot().t).toBe(4000);
    expect(p.getSnapshot().currentAct).toBe(2);
    expect(p.jumpToAct(3)).toBe(false);
    expect(p.jumpToAct(6)).toBe(true);
    const s = p.getSnapshot();
    expect(s.currentAct).toBe(6);
    expect(s.decisions[0]).toMatchObject({ type: 'gate', decision: 'approved' });
    expect(p.jumpToAct(9)).toBe(false);
  });

  it('pauses at a requested beat', () => {
    const p = createPlayer(fixture);
    p.setPauseAt('a2.b01');
    runUntil(p, () => !p.getSnapshot().playing, 700);
    expect(p.getSnapshot().t).toBe(4000);
    expect(p.getSnapshot().state.evidence.cards).toHaveLength(2);
  });

  it('resets to the title', () => {
    const p = createPlayer(fixture);
    p.seek(FIX.g1RequestT);
    p.decide('g1', 'approved');
    p.play();
    p.reset();
    const s = p.getSnapshot();
    expect(s).toMatchObject({ t: 0, playing: false, decisions: [] });
  });
});

describe('chaos overlay', () => {
  it('is only available from act 4', () => {
    const p = createPlayer(fixture);
    expect(p.triggerChaos()).toBe(false);
    p.seek(FIX.act4Start);
    expect(p.getSnapshot().canChaos).toBe(true);
  });

  it('plays the overlay, then resumes the main timeline with audit rows kept', () => {
    const p = createPlayer(fixture);
    p.seek(9000);
    const agentsBefore = p.getSnapshot().state.agents;
    expect(p.triggerChaos()).toBe(true);
    let s = p.getSnapshot();
    expect(s.state.overlay.active).toBe(true);
    expect(s.canChaos).toBe(false);
    expect(s.playing).toBe(true);
    expect(p.triggerChaos()).toBe(false);
    p.advance(1500);
    s = p.getSnapshot();
    expect(s.state.agents.guardian).toBe('blocked');
    expect(s.state.permissionDenied?.tool).toBe('db.alter');
    p.advance(1500);
    s = p.getSnapshot();
    expect(s.state.overlay.active).toBe(false);
    expect(s.state.agents).toEqual(agentsBefore);
    expect(s.state.audit.some((a) => a.overlay && a.category === 'permission')).toBe(true);
    expect(s.state.chaosRuns).toBe(1);
  });

  it('runs at an open gate and returns to the gate', () => {
    const p = createPlayer(fixture);
    p.seek(FIX.g1RequestT);
    expect(p.triggerChaos()).toBe(true);
    runUntil(p, () => p.getSnapshot().status === 'awaitingGate');
    const s = p.getSnapshot();
    expect(s.t).toBe(FIX.g1RequestT + FIX.chaosDuration);
    expect(s.state.gate?.status).toBe('open');
    expect(s.state.overlay.active).toBe(false);
  });

  it('runs from the end card and returns to it', () => {
    const p = createPlayer(fixture);
    p.seek(FIX.g1RequestT);
    p.decide('g1', 'approved');
    runUntil(p, () => p.getSnapshot().status === 'ended');
    expect(p.triggerChaos()).toBe(true);
    expect(p.getSnapshot().state.endCard).not.toBeNull();
    runUntil(p, () => p.getSnapshot().status === 'ended');
    const s = p.getSnapshot();
    expect(s.state.endCard).not.toBeNull();
    expect(s.state.chaosRuns).toBe(1);
  });

  it('is available during the gate gap and delays the continuation', () => {
    const p = createPlayer(fixture);
    p.seek(FIX.g1RequestT);
    p.decide('g1', 'approved');
    expect(p.triggerChaos()).toBe(true);
    runUntil(p, () => p.getSnapshot().state.gate?.status === 'approved');
    expect(p.getSnapshot().t).toBeGreaterThanOrEqual(FIX.g1ResolveT + FIX.chaosDuration);
  });
});

// ---------------------------------------------------------------------------
// Property: seek(t) equals linear playback to t, on every decision path.

type Plan = { g1: 'approved' | 'rejected'; g2: 'approved' | 'rejected'; chaosAt: number | null; dts: number[]; target: number };

const planArb: fc.Arbitrary<Plan> = fc.record({
  g1: fc.constantFrom('approved' as const, 'rejected' as const),
  g2: fc.constantFrom('approved' as const, 'rejected' as const),
  chaosAt: fc.option(fc.integer({ min: FIX.act4Start, max: 20000 }), { nil: null }),
  dts: fc.array(fc.integer({ min: 1, max: 900 }), { minLength: 1, maxLength: 12 }),
  target: fc.integer({ min: 0, max: 30000 }),
});

function playLinear(plan: Plan): Player {
  const p = createPlayer(fixture, { speed: 1 });
  p.play();
  let i = 0;
  for (let guard = 0; guard < 5000; guard++) {
    const s = p.getSnapshot();
    if (s.t >= plan.target || s.status === 'ended') break;
    if (s.status === 'awaitingGate') {
      p.decide(s.pendingGateId!, s.pendingGateId === 'g1' ? plan.g1 : plan.g2, 'Asha');
      continue;
    }
    if (plan.chaosAt !== null && s.t >= plan.chaosAt && s.canChaos && !s.decisions.some((d) => d.type === 'chaos')) {
      p.triggerChaos();
      continue;
    }
    const dt = plan.dts[i % plan.dts.length]!;
    i++;
    p.advance(Math.min(dt, plan.target - s.t));
  }
  return p;
}

describe('determinism (property)', () => {
  it('seek(t) on a fresh player equals linear playback to t', () => {
    fc.assert(
      fc.property(planArb, (plan) => {
        const linear = playLinear(plan).getSnapshot();
        const fresh = createPlayer(fixture, { decisions: [...linear.decisions] as Decision[] });
        fresh.seek(linear.t);
        const seeked = fresh.getSnapshot();
        expect(seeked.t).toBe(linear.t);
        expect(seeked.clock).toBe(linear.clock);
        expect(seeked.state).toEqual(linear.state);
      }),
      { numRuns: 150 },
    );
  });

  it('scrubbing back and forth matches a direct seek (snapshot cache)', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 19000 }), { minLength: 2, maxLength: 10 }), (targets) => {
        const decisions: Decision[] = [{ type: 'gate', gateId: 'g1', decision: 'approved', by: 'Asha' }];
        const scrub = createPlayer(fixture, { decisions, snapshotEveryMs: 1000 });
        for (const t of targets) scrub.seek(Math.max(t, FIX.g1ResolveT));
        const last = Math.max(targets.at(-1)!, FIX.g1ResolveT);
        const direct = createPlayer(fixture, { decisions });
        direct.seek(last);
        expect(scrub.getSnapshot().state).toEqual(direct.getSnapshot().state);
      }),
      { numRuns: 100 },
    );
  });

  it('is repeatable: same inputs, same frames', () => {
    const a = playLinear({ g1: 'rejected', g2: 'approved', chaosAt: 9000, dts: [16, 33], target: 30000 });
    const b = playLinear({ g1: 'rejected', g2: 'approved', chaosAt: 9000, dts: [16, 33], target: 30000 });
    expect(a.getSnapshot().state).toEqual(b.getSnapshot().state);
    expect(a.getSnapshot().timeline.events).toEqual(b.getSnapshot().timeline.events);
  });
});
