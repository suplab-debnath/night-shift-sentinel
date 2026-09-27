// Story clock (SCENARIO §3). Anchors come from beat clocks; between anchors
// the clock is interpolated unless the later anchor is a jump (gate, timelapse,
// chaos). Pure functions; no wall-clock reads.

export interface ClockAnchor {
  /** Playback ms. */
  t: number;
  /** Story seconds since midnight. */
  sec: number;
  /** When true the clock holds the previous value until t, then jumps. */
  jump: boolean;
}

export function parseClock(clock: string): number {
  const m = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(clock);
  if (!m) throw new Error(`Invalid clock "${clock}"`);
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] ?? 0);
}

export function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec)) % 86400;
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return [hh, mm, ss].map((n) => String(n).padStart(2, '0')).join(':');
}

/** Index of the last anchor with anchor.t <= t, or -1. Anchors are sorted by t. */
function lastAnchorAtOrBefore(anchors: readonly ClockAnchor[], t: number): number {
  let lo = 0;
  let hi = anchors.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (anchors[mid]!.t <= t) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/** Story seconds at playback time t. */
export function clockAt(anchors: readonly ClockAnchor[], t: number, fallbackSec = 0): number {
  if (anchors.length === 0) return fallbackSec;
  const i = lastAnchorAtOrBefore(anchors, t);
  if (i < 0) return anchors[0]!.sec;
  const a = anchors[i]!;
  const b = anchors[i + 1];
  if (!b || b.jump || b.t <= a.t || b.sec < a.sec) return a.sec;
  const k = (t - a.t) / (b.t - a.t);
  return a.sec + (b.sec - a.sec) * k;
}
