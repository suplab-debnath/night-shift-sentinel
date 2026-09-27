// compile(scenario, decisions) → a flat, time-ordered timeline (ARCHITECTURE §6).
// Gate decisions append the chosen continuation segment; chaos decisions splice
// the overlay segment in at the trigger time and shift everything after it.
import { clockAt, formatClock, parseClock, type ClockAnchor } from './clock';
import type { EngineEvent, EventBody, EventSourceKind, EventTemplate, GateDecision } from './events';
import { hashString, mulberry32 } from './prng';
import type { BeatLive, Scenario, Segment } from './schema';

export type Decision =
  | { type: 'gate'; gateId: string; decision: GateDecision; by: string }
  | { type: 'chaos'; at: number };

export interface BeatMark {
  id: string;
  t: number;
  /** Time of the beat's last event. */
  endT: number;
  act: number;
  segment: string;
  overlay: boolean;
  live?: BeatLive;
}

export interface ActMark {
  n: number;
  name: string;
  t: number;
  endT: number;
  segment: string;
  overlay: boolean;
}

export type TimelineEnd = { kind: 'gate'; gateId: string } | { kind: 'end'; ending: 'A' | 'B' };

export interface Timeline {
  events: EngineEvent[];
  beats: BeatMark[];
  acts: ActMark[];
  anchors: ClockAnchor[];
  endT: number;
  end: TimelineEnd;
  decisions: Decision[];
  /**
   * Timeline position of each decision (gate: when the gate opened; chaos: trigger time).
   * Seeking to or before a gate's position, or before a chaos position, clears it.
   */
  decisionPoints: number[];
  chaosWindows: { start: number; end: number }[];
  gatePoints: { gateId: string; requestT: number; resolveT: number | null }[];
}

/** Replacement content for one beat (live mode). Times stay inside the beat's slot. */
export interface BeatOverride {
  events: (EventTemplate & { source: EventSourceKind; offsetMs?: number })[];
}

export type BeatOverrides = Readonly<Record<string, BeatOverride>>;

export interface CompileOptions {
  overrides?: BeatOverrides;
  /**
   * Which take to play (DECISIONS D-068). Take 0 is the canonical script with no timing
   * spread; any other take picks alternate wordings and spreads beat starts, seeded, so
   * the same take always compiles to the same timeline.
   */
  take?: number;
}

function takeRng(take: number, key: string): () => number {
  return mulberry32(hashString(`${take}:${key}`));
}

/** Index into [canonical, ...alt] for an event under a take. */
export function pickTake(take: number, key: string, alternates: number): number {
  if (take === 0 || alternates <= 0) return 0;
  return Math.floor(takeRng(take, key)() * (alternates + 1));
}

/** Start-time shift for a beat under a take, within ±jitterMs. */
export function beatShift(take: number, beatId: string, jitterMs: number | undefined): number {
  if (take === 0 || !jitterMs) return 0;
  return Math.round((takeRng(take, `shift:${beatId}`)() * 2 - 1) * jitterMs);
}

/** Default spacing between override events that carry no offset. */
const OVERRIDE_STEP_MS = 250;

export class InvalidDecisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidDecisionError';
  }
}

interface BuiltSegment {
  events: EngineEvent[];
  beats: BeatMark[];
  acts: ActMark[];
  /** Explicit clock anchors (from beat/event clocks and timelapses), unresolved timelapses marked. */
  clockMarks: { t: number; clock?: string; advanceSec?: number }[];
  endT: number;
  lastEventT: number;
}

function buildSegment(
  segment: Segment,
  key: string,
  start: number,
  opts: {
    idSuffix?: string;
    overlay?: boolean;
    gateResolve?: Extract<Decision, { type: 'gate' }>;
    overrides?: BeatOverrides;
    take?: number;
  },
): BuiltSegment {
  const events: EngineEvent[] = [];
  const beats: BeatMark[] = [];
  const acts: ActMark[] = [];
  const clockMarks: BuiltSegment['clockMarks'] = [];
  let cursor = start;
  let lastEventT = start;
  for (const act of segment.acts) {
    const actStart = cursor;
    let actLastT = actStart;
    act.beats.forEach((beat, beatIndex) => {
      const take = opts.take ?? 0;
      const beatT = Math.max(actStart, actStart + beat.t + beatShift(take, beat.id, beat.jitterMs));
      let beatEnd = beatT;
      const override = opts.overrides?.[beat.id];
      const slot = (act.beats[beatIndex + 1]?.t ?? act.durationMs) - beat.t;
      const templates: (EventTemplate & { offsetMs?: number; source?: EventSourceKind })[] = override
        ? override.events.map((e, i) => ({
            ...e,
            offsetMs: e.offsetMs ?? Math.min(i * OVERRIDE_STEP_MS, (slot * i) / (override.events.length + 1)),
          }))
        : beat.events.map((e, i) => {
            const { alt, ...rest } = e as typeof e & { alt?: string[] };
            if (!alt || !('text' in rest)) return rest;
            const pick = pickTake(take, `${beat.id}.${i}`, alt.length);
            return pick === 0 ? rest : ({ ...rest, text: alt[pick - 1]! } as typeof rest);
          });
      templates.forEach((tpl, i) => {
        // `alt` (take wordings) is authoring data; it never reaches an event, even via a fallback override.
        const { offsetMs, clock: tplClock, source: tplSource, alt: _alt, ...body } = tpl as typeof tpl & {
          source?: EventSourceKind;
          alt?: string[];
        };
        const t = beatT + (offsetMs ?? 0);
        const clock = tplClock ?? (i === 0 || offsetMs === undefined ? beat.clock : undefined);
        let resolved = body as EventBody;
        if (resolved.kind === 'gate.resolve' && opts.gateResolve && resolved.gateId === opts.gateResolve.gateId) {
          resolved = { ...resolved, decision: opts.gateResolve.decision, by: opts.gateResolve.by };
        }
        const id = opts.idSuffix ? `${beat.id}.${opts.idSuffix}.e${i}` : `${beat.id}.e${i}`;
        const event = { ...resolved, id, t, source: tplSource ?? 'script', beat: beat.id } as EngineEvent;
        if (clock) clockMarks.push({ t, clock });
        if (resolved.kind === 'clock.set') clockMarks.push({ t, clock: resolved.clock });
        if (resolved.kind === 'timelapse') clockMarks.push({ t, advanceSec: resolved.advanceClockSec });
        events.push(event);
        beatEnd = Math.max(beatEnd, t);
      });
      beats.push({
        id: beat.id,
        t: beatT,
        endT: beatEnd,
        act: act.n,
        segment: key,
        overlay: opts.overlay ?? false,
        ...(beat.live ? { live: beat.live } : {}),
      });
      actLastT = Math.max(actLastT, beatEnd);
      lastEventT = Math.max(lastEventT, beatEnd);
    });
    cursor = actStart + act.durationMs;
    acts.push({ n: act.n, name: act.name, t: actStart, endT: Math.max(cursor, actLastT), segment: key, overlay: opts.overlay ?? false });
  }
  // Stable sort by time (offsets may interleave beats).
  const order = events.map((e, i) => ({ e, i }));
  order.sort((a, b) => a.e.t - b.e.t || a.i - b.i);
  clockMarks.sort((a, b) => a.t - b.t);
  const endT = 'gate' in segment.endsWith ? lastEventT : Math.max(cursor, lastEventT);
  for (const a of acts) a.endT = Math.min(a.endT, endT);
  return { events: order.map((o) => o.e), beats, acts, clockMarks, endT, lastEventT };
}

function resolveAnchors(
  marks: BuiltSegment['clockMarks'],
  existing: ClockAnchor[],
  firstIsJump: boolean,
): ClockAnchor[] {
  const anchors = [...existing];
  let first = true;
  for (const m of marks) {
    if (m.clock !== undefined) {
      anchors.push({ t: m.t, sec: parseClock(m.clock), jump: first && firstIsJump });
    } else if (m.advanceSec !== undefined) {
      const now = clockAt(anchors, m.t);
      anchors.push({ t: m.t, sec: now + m.advanceSec, jump: true });
    }
    first = false;
  }
  return anchors;
}

function segmentOrThrow(scenario: Scenario, key: string): Segment {
  const seg = scenario.segments[key];
  if (!seg) throw new InvalidDecisionError(`Unknown segment "${key}"`);
  return seg;
}

function endOf(segment: Segment): TimelineEnd | null {
  if ('gate' in segment.endsWith) return { kind: 'gate', gateId: segment.endsWith.gate };
  if ('end' in segment.endsWith) return { kind: 'end', ending: segment.endsWith.end };
  return null;
}

/** First act start (non-overlay) with n >= the given act number. */
export function chaosAvailableFrom(timeline: Timeline, scenario: Scenario): number | null {
  const act = timeline.acts.find((a) => !a.overlay && a.n >= scenario.overlays.chaos.availableFrom.act);
  return act ? act.t : null;
}

export function compile(scenario: Scenario, decisions: readonly Decision[] = [], options: CompileOptions = {}): Timeline {
  const overrides = options.overrides;
  const take = options.take ?? 0;
  const main = segmentOrThrow(scenario, 'main');
  const built = buildSegment(main, 'main', 0, { overrides, take });
  const mainEnd = endOf(main);
  if (!mainEnd) throw new InvalidDecisionError('The main segment cannot return to a trigger');

  const tl: Timeline = {
    events: built.events,
    beats: built.beats,
    acts: built.acts,
    anchors: resolveAnchors(built.clockMarks, [{ t: 0, sec: parseClock(scenario.clockStart), jump: false }], false),
    endT: built.endT,
    end: mainEnd,
    decisions: [],
    decisionPoints: [],
    chaosWindows: [],
    gatePoints: [],
  };
  if (mainEnd.kind === 'gate') tl.gatePoints.push({ gateId: mainEnd.gateId, requestT: built.lastEventT, resolveT: null });

  let chaosCount = 0;
  for (const d of decisions) {
    if (d.type === 'gate') {
      if (tl.end.kind !== 'gate' || tl.end.gateId !== d.gateId) {
        throw new InvalidDecisionError(`Gate "${d.gateId}" is not awaiting a decision`);
      }
      const gate = scenario.gates[d.gateId];
      if (!gate) throw new InvalidDecisionError(`Unknown gate "${d.gateId}"`);
      const key = d.decision === 'approved' ? gate.onApprove : gate.onReject;
      const seg = segmentOrThrow(scenario, key);
      const start = tl.endT + scenario.gateGapMs;
      const next = buildSegment(seg, key, start, { gateResolve: d, overrides, take });
      const end = endOf(seg);
      if (!end) throw new InvalidDecisionError(`Segment "${key}" cannot follow a gate`);
      const gp = tl.gatePoints[tl.gatePoints.length - 1];
      const requestT = tl.endT;
      if (gp) gp.resolveT = start;
      tl.events = [...tl.events, ...next.events];
      tl.beats = [...tl.beats, ...next.beats];
      tl.acts = [...tl.acts, ...next.acts];
      tl.anchors = resolveAnchors(next.clockMarks, tl.anchors, true);
      tl.endT = next.endT;
      tl.end = end;
      if (end.kind === 'gate') tl.gatePoints.push({ gateId: end.gateId, requestT: next.lastEventT, resolveT: null });
      tl.decisions.push(d);
      tl.decisionPoints.push(requestT);
    } else {
      const at = d.at;
      const from = chaosAvailableFrom(tl, scenario);
      if (from === null || at < from || at > tl.endT) {
        throw new InvalidDecisionError(`Chaos is not available at ${at}`);
      }
      if (tl.chaosWindows.some((w) => at >= w.start && at < w.end)) {
        throw new InvalidDecisionError('Chaos is already running');
      }
      const key = scenario.overlays.chaos.segment;
      const seg = segmentOrThrow(scenario, key);
      chaosCount += 1;
      const chaos = buildSegment(seg, key, at, { idSuffix: `r${chaosCount}`, overlay: true, overrides, take });
      const dur = chaos.endT - at;
      const shift = (t: number) => (t > at ? t + dur : t);
      const idx = tl.events.findIndex((e) => e.t > at);
      const cut = idx === -1 ? tl.events.length : idx;
      const shifted = tl.events.slice(cut).map((e) => ({ ...e, t: e.t + dur }));
      tl.events = [...tl.events.slice(0, cut), ...chaos.events, ...shifted];
      tl.beats = [
        ...tl.beats.filter((b) => b.t <= at).map((b) => ({ ...b, endT: shift(b.endT) })),
        ...chaos.beats,
        ...tl.beats.filter((b) => b.t > at).map((b) => ({ ...b, t: b.t + dur, endT: b.endT + dur })),
      ];
      tl.acts = [
        ...tl.acts.filter((a) => a.t <= at).map((a) => ({ ...a, endT: a.endT >= at ? a.endT + dur : a.endT })),
        ...chaos.acts,
        ...tl.acts.filter((a) => a.t > at).map((a) => ({ ...a, t: a.t + dur, endT: a.endT + dur })),
      ];
      const holdSec = clockAt(tl.anchors, at);
      tl.anchors = [
        ...tl.anchors.filter((a) => a.t <= at),
        { t: at, sec: holdSec, jump: false },
        { t: at + dur, sec: holdSec, jump: false },
        ...tl.anchors.filter((a) => a.t > at).map((a) => ({ ...a, t: a.t + dur })),
      ];
      tl.gatePoints = tl.gatePoints.map((g) => ({
        ...g,
        requestT: shift(g.requestT),
        resolveT: g.resolveT === null ? null : shift(g.resolveT),
      }));
      tl.chaosWindows = [...tl.chaosWindows, { start: at, end: at + dur }];
      tl.endT = tl.endT + dur;
      tl.decisions.push(d);
      tl.decisionPoints.push(at);
    }
  }

  // Every event carries the story clock at its time.
  tl.events = tl.events.map((e) => (e.clock ? e : { ...e, clock: formatClock(clockAt(tl.anchors, e.t)) }));
  return tl;
}

/** Story clock string at playback time t. */
export function storyClock(timeline: Timeline, t: number): string {
  return formatClock(clockAt(timeline.anchors, t));
}
