/** 4800 → "4.8 s", 190 → "190 ms" (DESIGN §8: numbers carry units). */
export function formatLatency(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.round(ms)} ms`;
}

export function formatPercent(v: number): string {
  return v.toFixed(1);
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
