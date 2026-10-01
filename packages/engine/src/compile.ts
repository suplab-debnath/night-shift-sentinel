// compile(scenario, decisions) → a flat, time-ordered timeline (ARCHITECTURE §6).
// Gate decisions append the chosen continuation segment; chaos decisions splice
// the overlay segment in at the trigger time and shift everything after it.
import { clockAt, formatClock, parseClock, type ClockAnchor } from './clock';
import type { EngineEvent, EventBody, EventSourceKind, EventTemplate, GateDecision } from './events';
import { hashString, mulberry32 } from './prng';
import { resolveTokens, runClockAnchors, type TokenContext } from './runclock';
import type { BeatLive, Scenario, Segment } from './schema';

export type Decision =
  /** waitedMs: story time the person took to decide; the run clock counts it (D-074). */
  | { type: 'gate'; gateId: string; decision: GateDecision; by: string; waitedMs?: number }
  | { type: 'chaos'; at: number }
  /** The squad was paused at playback time `at` for `ms` of story time (D-074). */
  | { type: 'hold'; at: number; ms: number };

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
  /** Squad pauses on this path (D-074). */
  holds: { at: number; ms: number }[];
  /** Story ms a person took at each gate on this path. */
  gateWaits: Record<string, number>;
  /** What run-time tokens resolve against (story seconds per beat, gate waits). */
  tokens: { beatSec: Record<string, number>; waitSec: Record<string, number> };
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
  /**
   * Playback pacing (DECISIONS D-072): every scripted duration (beat starts, event offsets,
   * act lengths, metric tweens, the gate gap) is multiplied by this factor, so agents pause
   * and think the way they do live. Story clocks are unchanged. Default 1.
   */
  pace?: number;
}

/** Characters per second a streamed line types at; the UI uses the same rate (DESIGN §6). */
export const STREAM_CPS = 30;
/** Reading time a finished line keeps before the next stream item may land (paced runs). */
const READ_HOLD_MS = 600;
/** Minimum gap between other stream items (tool calls, results, messages) in paced runs. */
const STREAM_GAP_MS = 400;

const STREAM_KINDS = new Set(['thought', 'tool.call', 'tool.result', 'message.send']);

/** Thinking pause before an agent speaks in a paced run: fixed on take 0, seeded otherwise. */
export function thinkMs(take: number, key: string): number {
  return take === 0 ? 1000 : 700 + takeRng(take, `think:${key}`)() * 900;
}

/** How long a stream item holds the reader's attention once it lands (paced runs). */
function busyFor(body: EventBody): number {
  switch (body.kind) {
    case 'thought':
      return (body.text.length / STREAM_CPS) * 1000 + READ_HOLD_MS;
    case 'tool.result':
      return body.payload ? 1400 : 600;
    default:
      return 300;
  }
}

/** Valid pacing factor: finite, 1 to 3. */
export function clampPace(pace: number | undefined): number {
  if (pace === undefined || !Number.isFinite(pace)) return 1;
  return Math.min(3, Math.max(1, pace));
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
    pace?: number;
  },
): BuiltSegment {
  const events: EngineEvent[] = [];
  const beats: BeatMark[] = [];
  const acts: ActMark[] = [];
  const pace = clampPace(opts.pace);
  // Paced runs (pace > 1) are also elastic: a stream item never lands while the previous line
  // is still being read, and an agent pauses to think before it speaks (DECISIONS D-072).
  const elastic = pace > 1;
  let busyUntil = start;
  let cursor = start;
  let lastEventT = start;
  for (const act of segment.acts) {
    const actStart = cursor;
    let actLastT = actStart;
    let actShift = 0;
    act.beats.forEach((beat, beatIndex) => {
      const take = opts.take ?? 0;
      const beatT = Math.max(actStart, actStart + (beat.t + beatShift(take, beat.id, beat.jitterMs)) * pace + actShift);
      let beatStart = Number.POSITIVE_INFINITY;
      let beatEnd = beatT;
      let delay = 0;
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
        // Authored clocks are reference only: the run clock sets every event's clock (D-074).
        const { offsetMs, clock: _clock, source: tplSource, alt: _alt, ...body } = tpl as typeof tpl & {
          source?: EventSourceKind;
          alt?: string[];
        };
        let t = beatT + (offsetMs ?? 0) * pace + delay;
        if (elastic && STREAM_KINDS.has(body.kind)) {
          const lead = body.kind === 'thought' ? thinkMs(take, `${beat.id}.${i}`) : STREAM_GAP_MS;
          const earliest = busyUntil + lead;
          if (t < earliest) {
            delay += earliest - t;
            t = earliest;
          }
          busyUntil = Math.max(busyUntil, t + busyFor(body as EventBody));
        }
        if (i === 0) beatStart = beatT + delay;
        let resolved = body as EventBody;
        if (resolved.kind === 'metric.update' && pace !== 1) resolved = { ...resolved, durationMs: resolved.durationMs * pace };
        if (resolved.kind === 'gate.resolve' && opts.gateResolve && resolved.gateId === opts.gateResolve.gateId) {
          resolved = { ...resolved, decision: opts.gateResolve.decision, by: opts.gateResolve.by };
        }
        const id = opts.idSuffix ? `${beat.id}.${opts.idSuffix}.e${i}` : `${beat.id}.e${i}`;
        const event = { ...resolved, id, t, source: tplSource ?? 'script', beat: beat.id } as EngineEvent;
        events.push(event);
        beatEnd = Math.max(beatEnd, t);
      });
      actShift += delay;
      beats.push({
        id: beat.id,
        t: Number.isFinite(beatStart) ? beatStart : beatT,
        endT: beatEnd,
        act: act.n,
        segment: key,
        overlay: opts.overlay ?? false,
        ...(beat.live ? { live: beat.live } : {}),
      });
      actLastT = Math.max(actLastT, beatEnd);
      lastEventT = Math.max(lastEventT, beatEnd);
    });
    cursor = Math.max(actStart + act.durationMs * pace + actShift, elastic ? actLastT : 0);
    acts.push({ n: act.n, name: act.name, t: actStart, endT: Math.max(cursor, actLastT), segment: key, overlay: opts.overlay ?? false });
  }
  // Stable sort by time (offsets may interleave beats).
  const order = events.map((e, i) => ({ e, i }));
  order.sort((a, b) => a.e.t - b.e.t || a.i - b.i);
  const endT = 'gate' in segment.endsWith ? lastEventT : Math.max(cursor, lastEventT);
  for (const a of acts) a.endT = Math.min(a.endT, endT);
  return { events: order.map((o) => o.e), beats, acts, endT, lastEventT };
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
  const pace = clampPace(options.pace);
  const main = segmentOrThrow(scenario, 'main');
  const built = buildSegment(main, 'main', 0, { overrides, take, pace });
  const mainEnd = endOf(main);
  if (!mainEnd) throw new InvalidDecisionError('The main segment cannot return to a trigger');

  const tl: Timeline = {
    events: built.events,
    beats: built.beats,
    acts: built.acts,
    anchors: [],
    endT: built.endT,
    end: mainEnd,
    decisions: [],
    decisionPoints: [],
    chaosWindows: [],
    gatePoints: [],
    holds: [],
    gateWaits: {},
    tokens: { beatSec: {}, waitSec: {} },
  };
  if (mainEnd.kind === 'gate') tl.gatePoints.push({ gateId: mainEnd.gateId, requestT: built.lastEventT, resolveT: null });

  let chaosCount = 0;
  for (const d of decisions) {
    if (d.type === 'hold') {
      if (!(d.at >= 0 && d.at <= tl.endT) || !(d.ms >= 0)) throw new InvalidDecisionError(`Hold is not valid at ${d.at}`);
      tl.holds = [...tl.holds, { at: d.at, ms: d.ms }];
      tl.decisions.push(d);
      tl.decisionPoints.push(d.at);
    } else if (d.type === 'gate') {
      if (tl.end.kind !== 'gate' || tl.end.gateId !== d.gateId) {
        throw new InvalidDecisionError(`Gate "${d.gateId}" is not awaiting a decision`);
      }
      const gate = scenario.gates[d.gateId];
      if (!gate) throw new InvalidDecisionError(`Unknown gate "${d.gateId}"`);
      const key = d.decision === 'approved' ? gate.onApprove : gate.onReject;
      const seg = segmentOrThrow(scenario, key);
      const start = tl.endT + scenario.gateGapMs * pace;
      const next = buildSegment(seg, key, start, { gateResolve: d, overrides, take, pace });
      const end = endOf(seg);
      if (!end) throw new InvalidDecisionError(`Segment "${key}" cannot follow a gate`);
      const gp = tl.gatePoints[tl.gatePoints.length - 1];
      const requestT = tl.endT;
      if (gp) gp.resolveT = start;
      tl.events = [...tl.events, ...next.events];
      tl.beats = [...tl.beats, ...next.beats];
      tl.acts = [...tl.acts, ...next.acts];
      tl.gateWaits = { ...tl.gateWaits, [d.gateId]: Math.max(0, d.waitedMs ?? 0) };
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
      const chaos = buildSegment(seg, key, at, { idSuffix: `r${chaosCount}`, overlay: true, overrides, take, pace });
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
      tl.holds = tl.holds.map((h) => (h.at > at ? { ...h, at: h.at + dur } : h));
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

  // The run clock (D-074): real time from the start, plus fast-forwards, time-lapses, the time
  // people took at gates, and squad pauses; it stands still while a chaos test runs.
  const jumps = [
    ...tl.gatePoints.flatMap((g) => (tl.gateWaits[g.gateId] ? [{ t: g.requestT, sec: tl.gateWaits[g.gateId]! / 1000 }] : [])),
    ...tl.holds.map((h) => ({ t: h.at, sec: h.ms / 1000 })),
  ];
  tl.anchors = runClockAnchors({
    startSec: parseClock(scenario.clockStart),
    events: tl.events,
    jumps,
    stops: tl.chaosWindows,
    endT: tl.endT,
  });
  const beatSec = new Map<string, number>();
  for (const b of tl.beats) if (!b.overlay || !beatSec.has(b.id)) beatSec.set(b.id, clockAt(tl.anchors, b.t));
  const waitSec = Object.fromEntries(Object.entries(tl.gateWaits).map(([k, v]) => [k, v / 1000]));
  tl.tokens = { beatSec: Object.fromEntries(beatSec), waitSec };
  tl.events = tl.events.map((e) => {
    const nowSec = clockAt(tl.anchors, e.t);
    const withClock = { ...e, clock: formatClock(nowSec) };
    return fillEventTokens(withClock, { beatSec: (id) => beatSec.get(id), nowSec, waitSec });
  });
  return tl;
}

/** Fill run-time tokens in every text field of an event (SCENARIO §11.2). */
function fillEventTokens(e: EngineEvent, ctx: TokenContext): EngineEvent {
  switch (e.kind) {
    case 'thought':
    case 'channel.post':
    case 'audit':
      return { ...e, text: resolveTokens(e.text, ctx) };
    case 'artifact.create':
      return { ...e, markdown: resolveTokens(e.markdown, ctx) };
    case 'message.send':
      return { ...e, label: resolveTokens(e.label, ctx) };
    case 'tool.result':
      return { ...e, summary: resolveTokens(e.summary, ctx) };
    case 'gate.request':
      return { ...e, summary: resolveTokens(e.summary, ctx) };
    default:
      return e;
  }
}

/** Resolve run-time tokens in scenario-level text (end card, scorecard) against a timeline at t. */
export function resolveRunText(text: string, timeline: Timeline, t: number): string {
  return resolveTokens(text, {
    beatSec: (id) => timeline.tokens.beatSec[id],
    nowSec: clockAt(timeline.anchors, t),
    waitSec: timeline.tokens.waitSec,
  });
}

/** Story clock string at playback time t. */
export function storyClock(timeline: Timeline, t: number): string {
  return formatClock(clockAt(timeline.anchors, t));
}
