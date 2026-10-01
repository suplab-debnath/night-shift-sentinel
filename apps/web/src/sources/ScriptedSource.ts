// Engine player driven by requestAnimationFrame (ARCHITECTURE §1, §6).
import { clampPace, createPlayer, type Decision, type GateDecision, type Player, type Scenario } from '@night-shift/engine';
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
  /** Pacing factor (DECISIONS D-072); 1 is the authored timing. */
  pace?: number;
  /** Wall clock; injected for tests, defaults to performance.now. */
  now?: () => number;
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
  protected readonly wall: () => number;
  /** Wall time the current gate opened, while it waits on a person. */
  private gateSince: number | null = null;
  /** Wall time the squad was paused, while paused. */
  private squadSince: number | null = null;
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
      pace: opts.pace ?? 1,
    });
    this.wall = opts.now ?? (() => performance.now());
    this.raf = opts.raf ?? ((cb) => requestAnimationFrame(cb));
    this.caf = opts.caf ?? ((id) => cancelAnimationFrame(id));
    if (opts.seek !== undefined && opts.seek !== null) this.player.seek(opts.seek);
    if (opts.pauseAt) this.player.setPauseAt(opts.pauseAt);
    this.snapshot = this.wrap();
    this.player.subscribe(() => this.refresh());
    if (opts.autoplay) this.player.play();
  }

  protected wrap(): StageSnapshot {
    const s = this.player.getSnapshot();
    if (s.status === 'awaitingGate' && !s.state.overlay.active) this.gateSince ??= this.wall();
    else if (s.status !== 'awaitingGate') this.gateSince = null;
    const clockHold =
      this.gateSince !== null
        ? { kind: 'gate' as const, since: this.gateSince }
        : this.squadSince !== null
          ? { kind: 'squad' as const, since: this.squadSince }
          : null;
    const frozen = !s.playing && s.t > 0 && s.status === 'paused' && this.squadSince === null;
    return { ...s, mode: 'scripted', take: this.opts.take ?? 0, pace: clampPace(this.opts.pace), clockHold, frozen };
  }

  /** Story ms that have passed on the run clock since a wall time (speed applies). */
  protected heldMs(since: number): number {
    return Math.max(0, (this.wall() - since) * this.player.getSnapshot().speed);
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

  play = () => {
    this.squadSince = null;
    this.player.play();
  };
  pause = () => {
    this.squadSince = null;
    this.player.pause();
  };
  togglePlay = () => {
    this.squadSince = null;
    this.player.togglePlay();
  };
  toggleSquad = () => {
    const s = this.player.getSnapshot();
    if (s.status === 'awaitingGate' || s.status === 'ended') return;
    if (this.squadSince !== null) {
      const ms = this.heldMs(this.squadSince);
      this.squadSince = null;
      this.player.holdClock(ms);
      this.player.play();
    } else if (s.playing) {
      this.squadSince = this.wall();
      this.player.pause();
    } else {
      this.player.play();
    }
  };
  toggleFreeze = () => this.togglePlay();
  setSpeed = (s: number) => this.player.setSpeed(s);
  seek = (t: number) => {
    this.squadSince = null;
    this.player.seek(t);
  };
  stepForward = () => {
    this.squadSince = null;
    this.player.stepForward();
  };
  stepBack = () => {
    this.squadSince = null;
    this.player.stepBack();
  };
  jumpToAct = (n: number) => {
    this.squadSince = null;
    return this.player.jumpToAct(n);
  };
  decide = (gateId: string, decision: GateDecision) => this.decideWithWait(gateId, decision);

  /** Decide a gate, handing the engine how long the person took (the run clock counts it). */
  protected decideWithWait(gateId: string, decision: GateDecision): boolean {
    const waited = this.gateSince === null ? 0 : this.heldMs(this.gateSince);
    return this.player.decide(gateId, decision, this.opts.approver, waited);
  }
  triggerChaos = () => this.player.triggerChaos();
  reset = () => {
    this.squadSince = null;
    this.player.reset();
  };
}
