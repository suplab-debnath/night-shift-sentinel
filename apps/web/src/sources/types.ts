// The UI consumes a StageSource. ScriptedSource wraps the engine player;
// LiveSource (P6) streams events from the server. The UI never branches on mode.
import type { GateDecision, OverlayName, PlayerSnapshot } from '@night-shift/engine';

export type SourceMode = 'scripted' | 'live' | 'fallback';

export interface StageSnapshot extends PlayerSnapshot {
  mode: SourceMode;
  /** Which model drives live mode, when live. */
  provider?: 'bedrock' | 'mock' | null;
  /** Take being played (presenter-only information). */
  take: number;
  /** Pacing factor in effect (presenter-only information). */
  pace: number;
  /**
   * The run clock is running while playback waits (D-074): a person deciding at a gate, or the
   * squad paused. `since` is wall time (performance.now); the clock adds (now - since) × speed.
   */
  clockHold: { kind: 'gate' | 'squad'; since: number } | null;
  /** Playback stopped by the presenter (not the squad): nothing moves, the clock included. */
  frozen: boolean;
}

export interface StageSource {
  getSnapshot(): StageSnapshot;
  subscribe(listener: (snapshot: StageSnapshot) => void): () => void;
  start(): void;
  stop(): void;
  play(): void;
  pause(): void;
  togglePlay(): void;
  /** The primary operations control: start, pause the squad (the clock keeps running), resume. */
  toggleSquad(): void;
  /** Presenter freeze for questions: stops everything, the clock included. */
  toggleFreeze(): void;
  setSpeed(speed: number): void;
  seek(t: number): void;
  stepForward(): void;
  stepBack(): void;
  jumpToAct(n: number): boolean;
  decide(gateId: string, decision: GateDecision): boolean;
  /** Start a what-if test: the over-eager fix (default) or the poisoned log line (D-079). */
  triggerChaos(overlay?: OverlayName): boolean;
  reset(): void;
  /** Toggle scripted ↔ live when a live source exists (RUNBOOK §5 `M`). */
  switchMode?(): boolean;
}
