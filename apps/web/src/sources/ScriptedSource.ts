// Engine player driven by requestAnimationFrame (ARCHITECTURE §1, §6).
import { createPlayer, type Decision, type GateDecision, type Player, type Scenario } from '@night-shift/engine';
import type { StageSnapshot, StageSource } from './types';

export interface ScriptedSourceOptions {
  speed?: number;
  decisions?: Decision[];
  approver: string;
  pauseAt?: string | null;
  autoDecide?: Record<string, GateDecision>;
  autoplay?: boolean;
  seek?: number | null;
  /** Take to play (DECISIONS D-068); 0 is the canonical script. */
  take?: number;
  /** Injected for tests; defaults to requestAnimationFrame. */
  raf?: (cb: (now: number) => void) => number;
  caf?: (id: number) => void;
}

/** Longest frame step; avoids jumps after a background tab resumes. */
const MAX_FRAME_MS = 100;

export class ScriptedSource implements StageSource {
  protected readonly player: Player;
  protected snapshot: StageSnapshot;
  private readonly listeners = new Set<(s: StageSnapshot) => void>();
  private frame: number | null = null;
  private last: number | null = null;
  private readonly raf: (cb: (now: number) => void) => number;
  private readonly caf: (id: number) => void;

  constructor(
    protected readonly scenario: Scenario,
    protected readonly opts: ScriptedSourceOptions,
  ) {
    this.player = createPlayer(scenario, {
      speed: opts.speed ?? 1,
      decisions: opts.decisions ?? [],
      defaultApprover: opts.approver,
      take: opts.take ?? 0,
    });
    this.raf = opts.raf ?? ((cb) => requestAnimationFrame(cb));
    this.caf = opts.caf ?? ((id) => cancelAnimationFrame(id));
    if (opts.seek !== undefined && opts.seek !== null) this.player.seek(opts.seek);
    if (opts.pauseAt) this.player.setPauseAt(opts.pauseAt);
    this.snapshot = this.wrap();
    this.player.subscribe(() => this.refresh());
    if (opts.autoplay) this.player.play();
  }

  protected wrap(): StageSnapshot {
    return { ...this.player.getSnapshot(), mode: 'scripted', take: this.opts.take ?? 0 };
  }

  /** Rebuild the snapshot and notify (also used by subclasses when only the mode changes). */
  protected refresh() {
    this.snapshot = this.wrap();
    this.autoDecideIfNeeded();
    for (const l of this.listeners) l(this.snapshot);
  }

  /** Per-frame hook for subclasses (live-mode stall detection). */
  protected onFrame(_now: number): void {}

  private autoDecideIfNeeded() {
    const gate = this.snapshot.pendingGateId;
    const decision = gate ? this.opts.autoDecide?.[gate] : undefined;
    // Through decide() so subclasses (live mode) see the decision too.
    if (gate && decision) queueMicrotask(() => this.decide(gate, decision));
  }

  private tick = (now: number) => {
    const dt = this.last === null ? 0 : Math.min(MAX_FRAME_MS, now - this.last);
    this.last = now;
    if (dt > 0) this.player.advance(dt);
    this.onFrame(now);
    this.frame = this.raf(this.tick);
  };

  getSnapshot = (): StageSnapshot => this.snapshot;

  subscribe = (listener: (s: StageSnapshot) => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  start() {
    if (this.frame !== null) return;
    this.last = null;
    this.frame = this.raf(this.tick);
  }

  stop() {
    if (this.frame !== null) this.caf(this.frame);
    this.frame = null;
  }

  play = () => this.player.play();
  pause = () => this.player.pause();
  togglePlay = () => this.player.togglePlay();
  setSpeed = (s: number) => this.player.setSpeed(s);
  seek = (t: number) => this.player.seek(t);
  stepForward = () => this.player.stepForward();
  stepBack = () => this.player.stepBack();
  jumpToAct = (n: number) => this.player.jumpToAct(n);
  decide = (gateId: string, decision: GateDecision) => this.player.decide(gateId, decision, this.opts.approver);
  triggerChaos = () => this.player.triggerChaos();
  reset = () => this.player.reset();
}
