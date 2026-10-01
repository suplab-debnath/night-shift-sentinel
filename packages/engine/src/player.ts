// Virtual-clock player (ARCHITECTURE §6). Driven by advance(dtMs); never reads
// a clock. Invariant: state === reduce(initial, events with t <= this.t).
import { chaosAvailableFrom, compile, storyClock, type BeatOverride, type Decision, type Timeline } from './compile';
import type { EngineEvent, GateDecision } from './events';
import { initialStageState, reduce, type StageState } from './reducer';
import type { Scenario } from './schema';

export type PlayerStatus = 'playing' | 'paused' | 'awaitingGate' | 'ended';

export interface PlayerSnapshot {
  t: number;
  speed: number;
  playing: boolean;
  status: PlayerStatus;
  state: StageState;
  timeline: Timeline;
  clock: string;
  decisions: readonly Decision[];
  canChaos: boolean;
  currentAct: number;
  pendingGateId: string | null;
  /** Beat playback is waiting for (live mode), or null. */
  holding: string | null;
}

export interface PlayerOptions {
  speed?: number;
  decisions?: Decision[];
  /** Name recorded on gate decisions when none is given. */
  defaultApprover?: string;
  /** Snapshot cache interval in ms of timeline. */
  snapshotEveryMs?: number;
  /** Take to play (DECISIONS D-068); 0 is the canonical script. */
  take?: number;
  /** Playback pacing factor (DECISIONS D-072); 1 is the authored timing. */
  pace?: number;
}

export type PlayerListener = (snapshot: PlayerSnapshot, emitted: readonly EngineEvent[]) => void;

export const MIN_SPEED = 0.25;
export const MAX_SPEED = 16;

export interface Player {
  advance(dtMs: number): EngineEvent[];
  play(): void;
  pause(): void;
  togglePlay(): void;
  setSpeed(speed: number): void;
  seek(t: number): void;
  stepForward(): void;
  stepBack(): void;
  jumpToAct(n: number): boolean;
  /** waitedMs: story time the person took (counted by the run clock, D-074). */
  decide(gateId: string, decision: GateDecision, by?: string, waitedMs?: number): boolean;
  /** The squad was paused here for `ms` of story time; the run clock counts it (D-074). */
  holdClock(ms: number): void;
  triggerChaos(): boolean;
  reset(): void;
  /** Pause automatically once the given beat has fully played. */
  setPauseAt(beatId: string | null): void;
  /**
   * Replace a beat's events (live mode). Only applies to beats that have not started;
   * returns false otherwise. The rest of the timeline keeps its timing.
   */
  setOverride(beatId: string, override: BeatOverride): boolean;
  clearOverrides(): void;
  /** Hold playback just before these beats until released (live mode). */
  hold(beatIds: readonly string[]): void;
  release(beatId: string): void;
  releaseAll(): void;
  getSnapshot(): PlayerSnapshot;
  subscribe(listener: PlayerListener): () => void;
}

export function createPlayer(scenario: Scenario, options: PlayerOptions = {}): Player {
  const every = options.snapshotEveryMs ?? 5000;
  const defaultApprover = options.defaultApprover ?? 'On-call engineer';
  const initial = initialStageState({ initialMetrics: scenario.initialMetrics, clock: scenario.clockStart });

  let decisions: Decision[] = [];
  const take = options.take ?? 0;
  const pace = options.pace ?? 1;
  let timeline: Timeline = compile(scenario, [], { take, pace });
  let t = 0;
  let cursor = 0;
  let state = initial;
  let playing = false;
  let speed = clampSpeed(options.speed ?? 1);
  let pauseAt: string | null = null;
  let overrides: Record<string, BeatOverride> = {};
  const holds = new Set<string>();
  let checkpoints: { idx: number; state: StageState }[] = [];
  const listeners = new Set<PlayerListener>();
  let snapshot: PlayerSnapshot;

  function clampSpeed(s: number): number {
    if (!Number.isFinite(s)) return 1;
    return Math.min(MAX_SPEED, Math.max(MIN_SPEED, s));
  }

  function recompile(next: Decision[]) {
    timeline = compile(scenario, next, { overrides, take, pace });
    decisions = [...timeline.decisions];
    checkpoints = [];
  }

  /** State after applying the first `count` events, using cached checkpoints. */
  function stateAfter(count: number): StageState {
    let from = 0;
    let s = initial;
    for (const c of checkpoints) {
      if (c.idx <= count && c.idx > from) {
        from = c.idx;
        s = c.state;
      }
    }
    const events = timeline.events;
    for (let i = from; i < count; i++) {
      s = reduce(s, events[i]!);
      const next = events[i + 1];
      // Checkpoint at the last event of each `every`-ms bucket.
      if (next && Math.floor(next.t / every) > Math.floor(events[i]!.t / every) && !checkpoints.some((c) => c.idx === i + 1)) {
        checkpoints.push({ idx: i + 1, state: s });
      }
    }
    return s;
  }

  function countAtOrBefore(target: number): number {
    const events = timeline.events;
    let lo = 0;
    let hi = events.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (events[mid]!.t <= target) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  function status(): PlayerStatus {
    if (t >= timeline.endT) return timeline.end.kind === 'gate' ? 'awaitingGate' : 'ended';
    return playing ? 'playing' : 'paused';
  }

  function canChaos(): boolean {
    if (state.overlay.active) return false;
    const from = chaosAvailableFrom(timeline, scenario);
    if (from === null || t < from) return false;
    return true;
  }

  function currentAct(): number {
    let n = timeline.acts[0]?.n ?? 0;
    for (const a of timeline.acts) {
      if (a.overlay) continue;
      if (a.t <= t) n = a.n;
    }
    return n;
  }

  /** Earliest held beat that has not started yet. */
  function nextHeld(): { id: string; t: number } | null {
    let best: { id: string; t: number } | null = null;
    for (const b of timeline.beats) {
      if (holds.has(b.id) && b.t > t && (!best || b.t < best.t)) best = { id: b.id, t: b.t };
    }
    return best;
  }

  function buildSnapshot(): PlayerSnapshot {
    const held = holds.size > 0 ? nextHeld() : null;
    return {
      t,
      speed,
      playing,
      status: status(),
      state,
      timeline,
      clock: storyClock(timeline, t),
      decisions,
      canChaos: canChaos(),
      currentAct: currentAct(),
      pendingGateId: t >= timeline.endT && timeline.end.kind === 'gate' ? timeline.end.gateId : null,
      holding: held && t >= held.t - 1 ? held.id : null,
    };
  }

  function notify(emitted: readonly EngineEvent[] = []) {
    snapshot = buildSnapshot();
    for (const l of listeners) l(snapshot, emitted);
  }

  /** Apply pending events with t <= current t. */
  function catchUp(): EngineEvent[] {
    const emitted: EngineEvent[] = [];
    while (cursor < timeline.events.length && timeline.events[cursor]!.t <= t) {
      const e = timeline.events[cursor]!;
      state = reduce(state, e);
      emitted.push(e);
      cursor++;
    }
    return emitted;
  }

  function seekInternal(target: number, clearLaterDecisions = true) {
    let tgt = Math.max(0, Number.isFinite(target) ? target : 0);
    // Seeking before a decision clears it and everything after it.
    const keep = clearLaterDecisions
      ? timeline.decisionPoints.findIndex((p, i) => (timeline.decisions[i]!.type === 'gate' ? tgt <= p : tgt < p))
      : -1;
    if (keep !== -1) recompile(decisions.slice(0, keep));
    tgt = Math.min(tgt, timeline.endT);
    const count = countAtOrBefore(tgt);
    state = stateAfter(count);
    cursor = count;
    t = tgt;
  }

  function init() {
    recompile(options.decisions ?? []);
    seekInternal(0, false);
    snapshot = buildSnapshot();
  }

  init();

  const player: Player = {
    advance(dtMs) {
      if (!playing || dtMs <= 0) return [];
      if (t >= timeline.endT) return [];
      let target = Math.min(t + dtMs * speed, timeline.endT);
      if (holds.size > 0) {
        const held = nextHeld();
        if (held && target >= held.t) target = Math.max(t, held.t - 1);
      }
      let hitPause = false;
      if (pauseAt) {
        const beat = timeline.beats.find((b) => b.id === pauseAt);
        if (beat && beat.endT > t && beat.endT <= target) {
          target = beat.endT;
          hitPause = true;
        }
      }
      t = target;
      const emitted = catchUp();
      if (hitPause) {
        playing = false;
        pauseAt = null;
      }
      if (t >= timeline.endT && timeline.end.kind === 'end') playing = false;
      notify(emitted);
      return emitted;
    },
    play() {
      if (t >= timeline.endT && timeline.end.kind === 'end') return;
      playing = true;
      notify();
    },
    pause() {
      playing = false;
      notify();
    },
    togglePlay() {
      if (playing) player.pause();
      else player.play();
    },
    setSpeed(s) {
      speed = clampSpeed(s);
      notify();
    },
    seek(target) {
      seekInternal(target);
      notify();
    },
    stepForward() {
      const next = timeline.beats.filter((b) => b.endT > t).reduce<number | null>((m, b) => (m === null || b.endT < m ? b.endT : m), null);
      if (next === null) return;
      playing = false;
      seekInternal(next);
      notify();
    },
    stepBack() {
      const prev = timeline.beats
        .filter((b) => b.endT < t)
        .reduce<number | null>((m, b) => (m === null || b.endT > m ? b.endT : m), null);
      playing = false;
      seekInternal(prev ?? 0);
      notify();
    },
    jumpToAct(n) {
      for (let guard = 0; guard < 8; guard++) {
        const mark = timeline.acts.find((a) => !a.overlay && a.n === n);
        if (mark) {
          seekInternal(mark.t);
          notify();
          return true;
        }
        if (timeline.end.kind !== 'gate') return false;
        // Act is past an undecided gate: take the approve path (runbook recovery).
        const gateId = timeline.end.gateId;
        const before = timeline.acts.some((a) => !a.overlay && a.n > n);
        if (before) return false;
        seekInternal(timeline.endT);
        recompile([...decisions, { type: 'gate', gateId, decision: 'approved', by: defaultApprover }]);
      }
      return false;
    },
    decide(gateId, decision, by, waitedMs) {
      if (!(t >= timeline.endT && timeline.end.kind === 'gate' && timeline.end.gateId === gateId)) return false;
      const waited = waitedMs !== undefined && waitedMs > 0 ? { waitedMs: Math.round(waitedMs) } : {};
      recompile([...decisions, { type: 'gate', gateId, decision, by: by ?? defaultApprover, ...waited }]);
      // The prefix is unchanged, so cursor and state stay valid.
      const emitted = catchUp();
      notify(emitted);
      return true;
    },
    holdClock(ms) {
      if (!(ms > 0)) return;
      recompile([...decisions, { type: 'hold', at: t, ms: Math.round(ms) }]);
      notify();
    },
    triggerChaos() {
      if (!canChaos()) return false;
      recompile([...decisions, { type: 'chaos', at: t }]);
      const emitted = catchUp();
      playing = true;
      notify(emitted);
      return true;
    },
    reset() {
      playing = false;
      pauseAt = null;
      recompile([]);
      seekInternal(0);
      notify();
    },
    setPauseAt(beatId) {
      pauseAt = beatId;
    },
    setOverride(beatId, override) {
      const mark = timeline.beats.find((b) => b.id === beatId);
      if (mark && mark.t <= t) return false;
      overrides = { ...overrides, [beatId]: override };
      // Events before the beat are unchanged, so the cursor and state stay valid.
      recompile(decisions);
      notify();
      return true;
    },
    clearOverrides() {
      overrides = {};
      recompile(decisions);
      seekInternal(t, false);
      notify();
    },
    hold(beatIds) {
      for (const id of beatIds) holds.add(id);
      notify();
    },
    release(beatId) {
      holds.delete(beatId);
      notify();
    },
    releaseAll() {
      holds.clear();
      notify();
    },
    getSnapshot() {
      return snapshot;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return player;
}
