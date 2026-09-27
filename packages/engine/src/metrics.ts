// Metric tracks: a series of tweens; the value at any time is a pure function.
import type { MetricSeries } from './events';

export interface Tween {
  from: number;
  to: number;
  startT: number;
  durationMs: number;
}

export interface MetricTrack {
  initial: number;
  tweens: Tween[];
}

export type MetricTracks = Record<MetricSeries, MetricTrack>;

export function easeInOut(k: number): number {
  const x = Math.min(1, Math.max(0, k));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

export function metricValueAt(track: MetricTrack, t: number): number {
  let value = track.initial;
  for (const tw of track.tweens) {
    if (t < tw.startT) break;
    if (tw.durationMs <= 0 || t >= tw.startT + tw.durationMs) {
      value = tw.to;
    } else {
      value = tw.from + (tw.to - tw.from) * easeInOut((t - tw.startT) / tw.durationMs);
    }
  }
  return value;
}
