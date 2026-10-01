// The run clock (DECISIONS D-074): the incident clock runs one second per second of playback
// from the scenario start. On top of that: labelled fast-forwards (clock.rate), time-lapses,
// the time a person took at each gate, and the time the squad was paused (holds). Chaos is a
// what-if, so the clock stands still while it runs. Pure functions; no wall-clock reads.
import { clockAt, formatClock, type ClockAnchor } from './clock';
import type { EngineEvent } from './events';

export interface ClockJump {
  /** Playback ms where the clock jumps forward. */
  t: number;
  /** Story seconds added. */
  sec: number;
}

/** Anchors for the run clock: piecewise-linear at the current rate, with forward jumps. */
export function runClockAnchors(opts: {
  startSec: number;
  events: readonly EngineEvent[];
  jumps: readonly ClockJump[];
  stops: readonly { start: number; end: number }[];
  endT: number;
}): ClockAnchor[] {
  type Mark = { t: number; order: number; apply: (st: { rate: number; saved: number; sec: number }) => boolean };
  const marks: Mark[] = [];
  for (const e of opts.events) {
    if (e.kind === 'clock.rate') marks.push({ t: e.t, order: 2, apply: (st) => ((st.rate = e.rate), false) });
    if (e.kind === 'timelapse') marks.push({ t: e.t, order: 1, apply: (st) => ((st.sec += e.advanceClockSec), true) });
  }
  for (const j of opts.jumps) marks.push({ t: j.t, order: 1, apply: (st) => ((st.sec += j.sec), true) });
  for (const w of opts.stops) {
    marks.push({ t: w.start, order: 0, apply: (st) => ((st.saved = st.rate), (st.rate = 0), false) });
    marks.push({ t: w.end, order: 3, apply: (st) => ((st.rate = st.saved), false) });
  }
  marks.sort((a, b) => a.t - b.t || a.order - b.order);
  const st = { rate: 1, saved: 1, sec: opts.startSec };
  let now = 0;
  const anchors: ClockAnchor[] = [{ t: 0, sec: st.sec, jump: false }];
  for (const m of marks) {
    st.sec += ((m.t - now) * st.rate) / 1000;
    now = m.t;
    anchors.push({ t: now, sec: st.sec, jump: false });
    if (m.apply(st)) anchors.push({ t: now, sec: st.sec, jump: true });
  }
  // Extrapolate past the end at a fixed far point, so the anchors (and their rounding) do not
  // depend on where the timeline currently ends.
  const tail = Math.max(opts.endT, now, 1e9);
  anchors.push({ t: tail, sec: st.sec + ((tail - now) * st.rate) / 1000, jump: false });
  return anchors;
}

/** "45 s", "2 min 18 s", "5 min". */
export function formatSpan(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r === 0 ? `${m} min` : `${m} min ${r} s`;
}

export interface TokenContext {
  /** Story seconds at the first event of a beat on this path, if it played. */
  beatSec: (beatId: string) => number | undefined;
  /** Story seconds of the text being resolved. */
  nowSec: number;
  /** Story seconds a person took at each gate on this path. */
  waitSec: Record<string, number>;
}

const TOKEN = /\{\{(clock|hm|since|span|wait)(?::([^}]*))?\}\}/g;

/** First beat of an "a|b" list that played on this path. */
function firstBeat(ctx: TokenContext, list: string | undefined): number | undefined {
  for (const id of (list ?? '').split('|')) {
    const sec = ctx.beatSec(id.trim());
    if (sec !== undefined) return sec;
  }
  return undefined;
}

/**
 * Fill run-time tokens in scripted text (SCENARIO §11.2):
 * {{clock}} / {{hm}} this moment; {{clock:beat}} / {{hm:beat}} when a beat played;
 * {{since:beat}} time from a beat to now; {{span:a:b}} time between two beats;
 * {{wait}} / {{wait:gate}} time a person took to decide. "a|b" picks the beat that played.
 */
export function resolveTokens(text: string, ctx: TokenContext): string {
  if (!text.includes('{{')) return text;
  return text.replace(TOKEN, (whole, kind: string, arg: string | undefined) => {
    switch (kind) {
      case 'clock':
      case 'hm': {
        const sec = arg === undefined ? ctx.nowSec : firstBeat(ctx, arg);
        if (sec === undefined) return whole;
        const c = formatClock(sec);
        return kind === 'hm' ? c.slice(0, 5) : c;
      }
      case 'since': {
        const from = firstBeat(ctx, arg);
        return from === undefined ? whole : formatSpan(ctx.nowSec - from);
      }
      case 'span': {
        const [a, b] = (arg ?? '').split(':');
        const from = firstBeat(ctx, a);
        const to = firstBeat(ctx, b);
        return from === undefined || to === undefined ? whole : formatSpan(to - from);
      }
      case 'wait': {
        const secs = arg === undefined ? Object.values(ctx.waitSec) : [ctx.waitSec[arg] ?? 0];
        return formatSpan(secs.reduce((a, b) => a + b, 0));
      }
      default:
        return whole;
    }
  });
}

/** Seconds the run clock shows at t. */
export function runClockSec(anchors: readonly ClockAnchor[], t: number): number {
  return clockAt(anchors, t);
}
