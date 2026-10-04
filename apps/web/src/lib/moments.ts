// Stage moments (DECISIONS D-080): a banner for a few seconds when a milestone is reached, and the
// stage tone that follows the incident. Pure functions of the timeline and playback time.
import { resolveRunText, type Moment, type Milestone, type StageState, type Timeline } from '@night-shift/engine';
import { beatOnPath } from './runclock';

/** Playback ms a moment banner stays up. */
export const MOMENT_MS = 5000;

export interface ActiveMoment {
  key: string;
  moment: Moment;
  title: string;
  sub: string | null;
}

/** The most recent moment reached within MOMENT_MS of t, if nothing else owns the stage. */
export function activeMoment(
  moments: readonly Moment[],
  milestones: readonly Milestone[],
  timeline: Timeline,
  state: StageState,
  t: number,
): ActiveMoment | null {
  if (state.overlay.active || state.gate?.status === 'open' || state.endCard !== null) return null;
  let best: { moment: Moment; at: number } | null = null;
  for (const m of moments) {
    const ms = milestones.find((x) => x.id === m.milestone);
    const hit = ms ? beatOnPath(timeline, ms.beats) : null;
    if (!hit || t < hit.t || t - hit.t >= MOMENT_MS) continue;
    if (!best || hit.t > best.at) best = { moment: m, at: hit.t };
  }
  if (!best) return null;
  const fill = (text: string) => resolveRunText(text, timeline, t);
  const title = fill(best.moment.title);
  const sub = best.moment.sub ? fill(best.moment.sub) : null;
  // Never show a raw token: if a time is not known yet on this path, skip the banner.
  if (title.includes('{{') || sub?.includes('{{')) return null;
  return { key: `${best.moment.milestone}:${best.at}`, moment: best.moment, title, sub };
}

export type StageTone = 'none' | 'alert' | 'caution' | 'ok';

/** Red while customers are affected, amber while a person decides, green once impact has ended. */
export function stageTone(impact: { from: string; until: string } | undefined, timeline: Timeline, state: StageState, t: number): StageTone {
  if (state.overlay.active) return 'none';
  const end = impact ? beatOnPath(timeline, impact.until) : null;
  if (end && end.t <= t) return 'ok';
  if (state.gate?.status === 'open') return 'caution';
  return state.alert ? 'alert' : 'none';
}
