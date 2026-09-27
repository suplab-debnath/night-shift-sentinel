// Typing reveal driven by playback time, so it is seekable and deterministic.
// ThoughtLine types at ~45 chars/s of playback; at the UI speeds (1×–2×) that is at most
// 90 chars/s of wall time, the DESIGN §7 cap. Faster URL speeds (tests, deck capture) are
// not capped so frames at a beat end show complete lines (DECISIONS D-031).
//
// With a key, text arrives the way a model streams it (DECISIONS D-069): a short think
// before the first token, then chunks of a few tokens at uneven gaps with the odd pause.
// The schedule is seeded by the key, so a given line always streams the same way, and it
// finishes in the same time as the even reveal, so beat timing is unchanged.
import { hashString, mulberry32 } from '@night-shift/engine';

export const THOUGHT_CPS = 45;
export const ARTIFACT_CPS = 120;
export const MAX_WALL_CPS = 90;

export interface Burst {
  /** Base ms (at the nominal rate) when each chunk lands. */
  at: number[];
  /** Characters visible once each chunk has landed. */
  chars: number[];
}

const cache = new Map<string, Burst>();

/** Seeded chunk schedule for a string of `length` characters, ending at length / cps. */
export function burstSchedule(key: string, length: number, cps = THOUGHT_CPS): Burst {
  const id = `${key}|${length}|${cps}`;
  const hit = cache.get(id);
  if (hit) return hit;
  const rng = mulberry32(hashString(id));
  const total = (length / cps) * 1000;
  const think = Math.min(total * 0.4, 220 + rng() * 480);
  const scale = cps / THOUGHT_CPS;
  const sizes: number[] = [];
  const weights: number[] = [];
  for (let n = 0; n < length; ) {
    const size = Math.max(1, Math.round((3 + rng() * 9) * scale));
    sizes.push(Math.min(size, length - n));
    n += size;
    weights.push(rng() < 0.07 ? 3 + rng() * 2 : 0.6 + rng() * 0.9);
  }
  const sum = weights.slice(1).reduce((a, b) => a + b, 0) || 1;
  const budget = total - think;
  const burst: Burst = { at: [], chars: [] };
  let t = think;
  let n = 0;
  sizes.forEach((size, i) => {
    if (i > 0) t += (weights[i]! / sum) * budget;
    n += size;
    burst.at.push(t);
    burst.chars.push(n);
  });
  burst.at[burst.at.length - 1] = Math.max(think, total);
  if (cache.size > 500) cache.clear();
  cache.set(id, burst);
  return burst;
}

function charsAt(burst: Burst, baseMs: number): number {
  let lo = 0;
  let hi = burst.at.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (burst.at[mid]! <= baseMs) lo = mid + 1;
    else hi = mid;
  }
  return lo === 0 ? 0 : burst.chars[lo - 1]!;
}

export function visibleChars(opts: {
  length: number;
  elapsedMs: number;
  speed: number;
  reducedMotion: boolean;
  typed: boolean;
  cps?: number;
  /** Seeds the streaming rhythm; without it the reveal is even. */
  key?: string;
}): number {
  const { length, elapsedMs, speed, reducedMotion, typed } = opts;
  if (!typed || reducedMotion) return length;
  if (elapsedMs <= 0) return 0;
  const cps = opts.cps ?? THOUGHT_CPS;
  const perPlaybackSec = perPlaybackCps(cps, speed);
  if (opts.key === undefined) return Math.min(length, Math.floor((elapsedMs / 1000) * perPlaybackSec));
  return charsAt(burstSchedule(opts.key, length, cps), elapsedMs * (perPlaybackSec / cps));
}

/** Ms of playback needed to fully type a string. */
export function typingDurationMs(length: number, speed: number, cps = THOUGHT_CPS): number {
  return (length / perPlaybackCps(cps, speed)) * 1000;
}

/** Playback chars/s; the wall-time cap applies within the UI speed range only. */
function perPlaybackCps(cps: number, speed: number): number {
  if (cps !== THOUGHT_CPS || speed > 2) return cps;
  return Math.min(cps, MAX_WALL_CPS / Math.max(speed, 0.0001));
}
