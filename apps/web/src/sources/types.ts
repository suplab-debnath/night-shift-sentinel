// The UI consumes a StageSource. ScriptedSource wraps the engine player;
// LiveSource (P6) streams events from the server. The UI never branches on mode.
import type { GateDecision, PlayerSnapshot } from '@night-shift/engine';

export type SourceMode = 'scripted' | 'live' | 'fallback';

export interface StageSnapshot extends PlayerSnapshot {
  mode: SourceMode;
  /** Which model drives live mode, when live. */
  provider?: 'bedrock' | 'mock' | null;
  /** Take being played (presenter-only information). */
  take: number;
}

export interface StageSource {
  getSnapshot(): StageSnapshot;
  subscribe(listener: (snapshot: StageSnapshot) => void): () => void;
  start(): void;
  stop(): void;
  play(): void;
  pause(): void;
  togglePlay(): void;
  setSpeed(speed: number): void;
  seek(t: number): void;
  stepForward(): void;
  stepBack(): void;
  jumpToAct(n: number): boolean;
  decide(gateId: string, decision: GateDecision): boolean;
  triggerChaos(): boolean;
  reset(): void;
  /** Toggle scripted ↔ live when a live source exists (RUNBOOK §5 `M`). */
  switchMode?(): boolean;
}
