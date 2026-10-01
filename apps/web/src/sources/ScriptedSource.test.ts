import { incidentCheckout } from '@night-shift/scenarios';
import { describe, expect, it } from 'vitest';
import { ScriptedSource } from './ScriptedSource';

function manualRaf() {
  let cb: ((now: number) => void) | null = null;
  let now = 0;
  return {
    raf: (fn: (n: number) => void) => {
      cb = fn;
      return 1;
    },
    caf: () => {
      cb = null;
    },
    frame(dt: number) {
      now += dt;
      const f = cb;
      cb = null;
      f?.(now);
    },
  };
}

describe('ScriptedSource', () => {
  it('drives the player from animation frames and clamps long frames', () => {
    const r = manualRaf();
    const src = new ScriptedSource(incidentCheckout.scenario, { approver: 'Asha', raf: r.raf, caf: r.caf });
    src.start();
    src.play();
    r.frame(16); // first frame only sets the baseline
    r.frame(50);
    expect(src.getSnapshot().t).toBe(50);
    r.frame(5000); // background tab: clamped to 100 ms
    expect(src.getSnapshot().t).toBe(150);
    src.stop();
    r.frame(16);
    expect(src.getSnapshot().t).toBe(150);
    expect(src.getSnapshot().mode).toBe('scripted');
  });

  it('auto-decides gates, honours pauseAt, and notifies subscribers', async () => {
    const r = manualRaf();
    const src = new ScriptedSource(incidentCheckout.scenario, {
      approver: 'Asha',
      speed: 16,
      autoplay: true,
      autoDecide: { g1: 'approved' },
      raf: r.raf,
      caf: r.caf,
    });
    let calls = 0;
    const off = src.subscribe(() => calls++);
    src.start();
    for (let i = 0; i < 400 && src.getSnapshot().status !== 'awaitingGate'; i++) r.frame(100);
    expect(src.getSnapshot().pendingGateId).toBe('g1');
    await Promise.resolve();
    expect(src.getSnapshot().decisions[0]).toMatchObject({ gateId: 'g1', decision: 'approved', by: 'Asha' });
    expect(calls).toBeGreaterThan(0);
    off();

    const p = new ScriptedSource(incidentCheckout.scenario, { approver: 'Asha', speed: 16, autoplay: true, pauseAt: 'a3.b20', raf: r.raf, caf: r.caf });
    p.start();
    for (let i = 0; i < 400 && p.getSnapshot().playing; i++) r.frame(100);
    expect(p.getSnapshot().state.evidence.conclusion).not.toBeNull();
    expect(p.getSnapshot().playing).toBe(false);
  });

  it('exposes controls', () => {
    const src = new ScriptedSource(incidentCheckout.scenario, { approver: 'Asha', seek: 30000, raf: () => 1, caf: () => {} });
    expect(src.getSnapshot().t).toBe(30000);
    src.stepForward();
    expect(src.getSnapshot().t).toBeGreaterThan(30000);
    src.stepBack();
    src.setSpeed(2);
    expect(src.getSnapshot().speed).toBe(2);
    expect(src.jumpToAct(3)).toBe(true);
    src.seek(0);
    expect(src.triggerChaos()).toBe(false);
    src.togglePlay();
    expect(src.getSnapshot().playing).toBe(true);
    src.pause();
    expect(src.decide('g1', 'approved')).toBe(false);
    src.reset();
    expect(src.getSnapshot().t).toBe(0);
  });
});

describe('ScriptedSource run clock (D-074, D-075)', () => {
  const wallClock = () => {
    let now = 1000;
    return { now: () => now, advance: (ms: number) => (now += ms) };
  };

  it('counts the time a person takes at the gate', () => {
    const w = wallClock();
    const src = new ScriptedSource(incidentCheckout.scenario, { approver: 'Asha', now: w.now, raf: () => 1, caf: () => {} });
    src.seek(src.getSnapshot().timeline.endT);
    expect(src.getSnapshot().clockHold).toEqual({ kind: 'gate', since: 1000 });
    w.advance(42_000);
    src.decide('g1', 'approved');
    const s = src.getSnapshot();
    expect(s.decisions[0]).toMatchObject({ type: 'gate', waitedMs: 42_000 });
    expect(s.clockHold).toBeNull();
  });

  it('pauses the squad with the clock running, and freezes without it', () => {
    const w = wallClock();
    const src = new ScriptedSource(incidentCheckout.scenario, { approver: 'Asha', now: w.now, raf: () => 1, caf: () => {} });
    src.toggleSquad(); // start
    expect(src.getSnapshot().playing).toBe(true);
    src.seek(5000);
    src.play();
    src.toggleSquad(); // pause squad
    expect(src.getSnapshot()).toMatchObject({ playing: false, clockHold: { kind: 'squad' }, frozen: false });
    w.advance(20_000);
    src.toggleSquad(); // resume: the pause becomes a hold on the clock
    expect(src.getSnapshot().decisions).toEqual([{ type: 'hold', at: 5000, ms: 20_000 }]);
    expect(src.getSnapshot().playing).toBe(true);
    src.toggleFreeze();
    expect(src.getSnapshot()).toMatchObject({ playing: false, frozen: true, clockHold: null });
    w.advance(60_000);
    src.toggleFreeze();
    expect(src.getSnapshot().decisions).toHaveLength(1);
  });
});
