/** 4800 → "4.8 s", 190 → "190 ms" (DESIGN §8: numbers carry units). */
export function formatLatency(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.round(ms)} ms`;
}

/** Minutes after midnight as a clock time: 412 → "06:52" (D-081). */
export function formatClockMinutes(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** The heartbeat's primary value in the scenario's format. */
export function formatPrimary(value: number, format: 'latency' | 'clock'): string {
  return format === 'clock' ? formatClockMinutes(value) : formatLatency(value);
}

export function formatPercent(v: number): string {
  return v.toFixed(1);
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
