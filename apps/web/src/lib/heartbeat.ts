// Heartbeat line geometry (DESIGN §2, §6): p99 latency over the whole run,
// log-scaled so the SLO sits mid-band; colour runs by status.
import { hashString, metricValueAt, mulberry32, type MetricTrack } from '@night-shift/engine';

export type RunTone = 'neutral' | 'alert' | 'ok';

export interface HeartbeatRun {
  tone: RunTone;
  d: string;
}

export interface HeartbeatGeometry {
  runs: HeartbeatRun[];
  head: { x: number; y: number; value: number };
  sloY: number;
  xAt: (t: number) => number;
}

const MIN_V = 100;
const MAX_V = 6000;
/** Share of the width used for the pre-incident baseline. */
export const PREROLL = 0.08;
export const MIN_AXIS_MS = 150_000;

/** Vertical scale of the line (D-081): log for latency, linear for a clock time. */
export interface LineScale {
  min: number;
  max: number;
  log: boolean;
}

export const LATENCY_SCALE: LineScale = { min: MIN_V, max: MAX_V, log: true };

export function yFor(value: number, height: number, pad = 14, scale: LineScale = LATENCY_SCALE): number {
  const v = Math.min(scale.max, Math.max(scale.min, value));
  const k = scale.log ? Math.log(v / scale.min) / Math.log(scale.max / scale.min) : (v - scale.min) / (scale.max - scale.min);
  return height - pad - k * (height - pad * 2);
}

/** Knot spacing of the metric noise, in ms. */
const NOISE_KNOT_MS = 1400;

/**
 * Smooth seeded noise in [-1, 1] over time (value noise with cosine easing), so readouts
 * breathe like a live metric instead of sitting on round numbers (DECISIONS D-071).
 */
export function metricNoise(key: string, t: number): number {
  const k = Math.max(0, t) / NOISE_KNOT_MS;
  const i = Math.floor(k);
  const knot = (n: number) => mulberry32(hashString(`${key}:${n}`))() * 2 - 1;
  const f = (1 - Math.cos((k - i) * Math.PI)) / 2;
  return knot(i) * (1 - f) + knot(i + 1) * f;
}

/** p99 with ±4% noise; `extraMs` lets the head keep drifting while playback waits on a gate. */
export function noisyP99(value: number, t: number, extraMs = 0): number {
  return value * (1 + 0.04 * metricNoise('p99', t + extraMs));
}

export function noisyErrorRate(value: number, t: number, extraMs = 0): number {
  return value * (1 + 0.03 * metricNoise('errors', t + extraMs));
}

export function axisMs(t: number, endT: number, ended: boolean): number {
  return Math.max(MIN_AXIS_MS, ended ? endT : t + 20_000);
}

export function buildHeartbeat(opts: {
  track: MetricTrack;
  t: number;
  axis: number;
  width: number;
  height: number;
  sloMs: number;
  stepMs?: number;
  /** Extra noise time for the head (ambient drift while waiting on a gate). */
  headDriftMs?: number;
  scale?: LineScale;
}): HeartbeatGeometry {
  const { track, t, axis, width, height, sloMs } = opts;
  const step = opts.stepMs ?? 250;
  const x0 = width * PREROLL;
  const xAt = (tt: number) => x0 + (Math.min(tt, axis) / axis) * (width - x0 - 8);
  const scale = opts.scale ?? LATENCY_SCALE;
  const sloY = yFor(sloMs, height, 14, scale);

  const pts: { x: number; y: number; v: number; tone: RunTone }[] = [];
  // Pre-incident baseline with a little seeded jitter.
  const rng = mulberry32(hashString('heartbeat-baseline'));
  const baseline = track.initial;
  for (let x = 0; x < x0; x += 12) {
    const v = baseline + (rng() * 2 - 1) * 10;
    pts.push({ x, y: yFor(v, height, 14, scale), v, tone: 'neutral' });
  }
  let breached = false;
  for (let tt = 0; ; tt += step) {
    const at = Math.min(tt, t);
    const raw = metricValueAt(track, at);
    const v = noisyP99(raw, at, at >= t ? (opts.headDriftMs ?? 0) : 0);
    if (raw > sloMs) breached = true;
    const tone: RunTone = raw > sloMs ? 'alert' : breached ? 'ok' : 'neutral';
    pts.push({ x: xAt(at), y: yFor(v, height, 14, scale), v, tone });
    if (at >= t) break;
  }

  const runs: HeartbeatRun[] = [];
  let current: { tone: RunTone; parts: string[] } | null = null;
  pts.forEach((p, i) => {
    const seg = `${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    if (!current || current.tone !== p.tone) {
      if (current) runs.push({ tone: current.tone, d: `M ${current.parts.join(' L ')}` });
      const prev = pts[i - 1];
      current = { tone: p.tone, parts: prev ? [`${prev.x.toFixed(1)} ${prev.y.toFixed(1)}`, seg] : [seg] };
    } else {
      current.parts.push(seg);
    }
  });
  if (current) {
    const c = current as { tone: RunTone; parts: string[] };
    runs.push({ tone: c.tone, d: `M ${c.parts.join(' L ')}` });
  }
  const last = pts[pts.length - 1]!;
  return { runs, head: { x: last.x, y: last.y, value: last.v }, sloY, xAt };
}
