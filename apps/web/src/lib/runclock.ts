// The run clock on screen (DECISIONS D-074, D-075): the compiled clock, plus the wall time that
// has passed while playback waits on a person or the squad is paused; milestones and impact.
import { formatClock, formatSpan, parseClock, type Milestone, type Timeline } from '@night-shift/engine';

export interface ClockHold {
  since: number;
}

/** Story seconds on the run clock now: the compiled clock plus any live hold (× speed). */
export function liveClockSec(clock: string, hold: ClockHold | null, speed: number, wallNow: number): number {
  const base = parseClock(clock);
  return hold ? base + Math.floor(((wallNow - hold.since) * speed) / 1000) : base;
}

/** The first beat of an "a|b" list that played on this path, with its playback time and clock. */
export function beatOnPath(timeline: Timeline, list: string): { t: number; sec: number } | null {
  for (const id of list.split('|')) {
    const mark = timeline.beats.find((b) => b.id === id.trim() && !b.overlay);
    const sec = timeline.tokens.beatSec[id.trim()];
    if (mark && sec !== undefined) return { t: mark.t, sec };
  }
  return null;
}

export interface MilestoneView {
  id: string;
  label: string;
  /** Clock when reached, or null. */
  clock: string | null;
  state: 'done' | 'current' | 'upcoming';
}

/** Milestones on this path at playback time t: reached ones carry their clock time. */
export function milestoneViews(milestones: readonly Milestone[], timeline: Timeline, t: number): MilestoneView[] {
  const views: MilestoneView[] = milestones.map((m) => {
    const hit = beatOnPath(timeline, m.beats);
    const reached = hit !== null && hit.t <= t;
    return { id: m.id, label: m.label, clock: reached ? formatClock(hit.sec) : null, state: reached ? 'done' : 'upcoming' };
  });
  const next = views.find((v) => v.state === 'upcoming');
  if (next) next.state = 'current';
  return views;
}

/** Customer impact so far: from a fixed story time until a milestone beat (or now). */
export function impactSec(
  impact: { from: string; until: string } | undefined,
  timeline: Timeline,
  t: number,
  nowSec: number,
): { sec: number; over: boolean } | null {
  if (!impact) return null;
  const from = parseClock(impact.from);
  const end = beatOnPath(timeline, impact.until);
  if (end && end.t <= t) return { sec: end.sec - from, over: true };
  return { sec: Math.max(0, nowSec - from), over: false };
}

/** m:ss for counters. */
export function mmss(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Story seconds between two "a|b" beat lists on this path, if both played. */
export function spanSec(timeline: Timeline, from: string, to: string): number | null {
  const a = beatOnPath(timeline, from);
  const b = beatOnPath(timeline, to);
  return a && b ? b.sec - a.sec : null;
}

export { formatSpan };

/** A playback time at which exactly the first `count` milestones have been reached. */
export function reachedT(milestones: readonly Milestone[], timeline: Timeline, count: number): number {
  const times = milestones
    .map((m) => beatOnPath(timeline, m.beats)?.t)
    .filter((x): x is number => x !== undefined)
    .sort((a, b) => a - b);
  if (count <= 0) return -1;
  return times[Math.min(count, times.length) - 1] ?? -1;
}
