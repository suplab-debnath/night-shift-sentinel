import { describe, expect, it } from 'vitest';
import { parseUrlOptions } from '../config';
import { formatLatency, formatPercent } from './format';
import { controlPoint, edgePoints, nodeCenter, quadPath, quadPoint } from './geometry';
import { axisMs, buildHeartbeat, metricNoise, MIN_AXIS_MS, noisyErrorRate, noisyP99, yFor } from './heartbeat';
import { burstSchedule, typingDurationMs, visibleChars } from './typing';

describe('format', () => {
  it('formats latency with units', () => {
    expect(formatLatency(4800)).toBe('4.8 s');
    expect(formatLatency(190.4)).toBe('190 ms');
    expect(formatPercent(11.4)).toBe('11.4');
  });
});

describe('typing', () => {
  const base = { length: 90, speed: 1, reducedMotion: false, typed: true };
  it('types at 45 chars/s at 1x and caps wall speed at 90 chars/s within UI speeds', () => {
    expect(visibleChars({ ...base, elapsedMs: 1000 })).toBe(45);
    expect(visibleChars({ ...base, elapsedMs: 1000, speed: 2 })).toBe(45);
    // At 1.5x the wall rate is 67.5 chars/s: under the cap, so unchanged.
    expect(visibleChars({ ...base, elapsedMs: 1000, speed: 1.5 })).toBe(45);
    expect(typingDurationMs(90, 1)).toBe(2000);
  });
  it('shows whole text under reduced motion or when not streamed, and nothing before start', () => {
    expect(visibleChars({ ...base, elapsedMs: 10, reducedMotion: true })).toBe(90);
    expect(visibleChars({ ...base, elapsedMs: 10, typed: false })).toBe(90);
    expect(visibleChars({ ...base, elapsedMs: -5 })).toBe(0);
  });
  it('does not cap capture speeds and uses the artifact rate', () => {
    expect(visibleChars({ ...base, elapsedMs: 1000, speed: 8 })).toBe(45);
    expect(visibleChars({ ...base, length: 500, elapsedMs: 1000, cps: 120 })).toBe(120);
  });
});

describe('streaming rhythm', () => {
  const base = { length: 90, speed: 1, reducedMotion: false, typed: true, key: '7:a3.b04.e1' };
  it('thinks first, then lands in uneven chunks and finishes on time', () => {
    const b = burstSchedule('7:a3.b04.e1', 90);
    expect(b.at[0]).toBeGreaterThanOrEqual(220);
    expect(b.chars.at(-1)).toBe(90);
    expect(b.at.at(-1)).toBeCloseTo(2000, 6);
    const gaps = b.at.slice(1).map((t, i) => t - b.at[i]!);
    expect(new Set(gaps.map((g) => Math.round(g))).size).toBeGreaterThan(3);
    expect(visibleChars({ ...base, elapsedMs: 100 })).toBe(0);
    expect(visibleChars({ ...base, elapsedMs: 2000 })).toBe(90);
    // Chunked: several characters appear at once.
    const seen = new Set<number>();
    for (let t = 0; t <= 2000; t += 5) seen.add(visibleChars({ ...base, elapsedMs: t }));
    expect(seen.size).toBeLessThan(40);
  });
  it('is deterministic per key and differs across keys', () => {
    expect(burstSchedule('a', 120)).toEqual(burstSchedule('a', 120));
    expect(burstSchedule('a', 120).at).not.toEqual(burstSchedule('b', 120).at);
    expect(visibleChars({ ...base, elapsedMs: 10, reducedMotion: true })).toBe(90);
    expect(visibleChars({ ...base, length: 400, cps: 120, elapsedMs: (400 / 120) * 1000 })).toBe(400);
  });
});

describe('geometry', () => {
  it('maps percentages and builds curves', () => {
    const a = nodeCenter({ x: 50, y: 50 }, { width: 200, height: 100 });
    expect(a).toEqual({ x: 100, y: 50 });
    const b = { x: 300, y: 50 };
    const c = controlPoint(a, b);
    expect(c.x).toBeCloseTo(200);
    expect(c.y).not.toBe(50);
    expect(quadPoint(a, c, b, 0)).toEqual(a);
    expect(quadPoint(a, c, b, 1)).toEqual(b);
    expect(quadPath(a, c, b)).toMatch(/^M 100\.0 50\.0 Q/);
  });
  it('pulls endpoints to the disc edge', () => {
    const [p, q] = edgePoints({ x: 0, y: 0 }, { x: 100, y: 0 }, 10, 20);
    expect(p).toEqual({ x: 10, y: 0 });
    expect(q).toEqual({ x: 80, y: 0 });
    expect(edgePoints({ x: 0, y: 0 }, { x: 5, y: 0 }, 10, 20)[0]).toEqual({ x: 0, y: 0 });
  });
});

describe('heartbeat', () => {
  const track = {
    initial: 180,
    tweens: [
      { from: 180, to: 4800, startT: 1000, durationMs: 4000 },
      { from: 4800, to: 190, startT: 20000, durationMs: 5000 },
    ],
  };
  it('places the SLO between the baseline and the peak', () => {
    const h = 140;
    expect(yFor(180, h)).toBeGreaterThan(yFor(800, h));
    expect(yFor(800, h)).toBeGreaterThan(yFor(4800, h));
  });
  it('colours runs neutral, then alert, then ok after recovery', () => {
    const g = buildHeartbeat({ track, t: 30000, axis: 60000, width: 1000, height: 140, sloMs: 800 });
    expect(g.runs.map((r) => r.tone)).toEqual(['neutral', 'alert', 'ok']);
    // Live-like noise: within ±4% of the tweened value.
    expect(Math.abs(g.head.value - 190)).toBeLessThanOrEqual(190 * 0.04);
    expect(g.xAt(60000)).toBeCloseTo(992);
  });
  it('breathes with seeded noise, and drifts at the head while waiting', () => {
    for (let t = 0; t < 20000; t += 700) {
      expect(Math.abs(metricNoise('p99', t))).toBeLessThanOrEqual(1);
      expect(metricNoise('p99', t)).toBe(metricNoise('p99', t));
    }
    expect(noisyP99(1000, 5000)).not.toBe(1000);
    expect(noisyErrorRate(10, 5000)).toBeCloseTo(10, 0);
    const still = buildHeartbeat({ track, t: 30000, axis: 60000, width: 1000, height: 140, sloMs: 800 });
    const drift = buildHeartbeat({ track, t: 30000, axis: 60000, width: 1000, height: 140, sloMs: 800, headDriftMs: 2100 });
    expect(drift.head.value).not.toBe(still.head.value);
    expect(drift.runs.slice(0, -1)).toEqual(still.runs.slice(0, -1));
  });
  it('is deterministic', () => {
    const a = buildHeartbeat({ track, t: 12345, axis: 60000, width: 800, height: 120, sloMs: 800 });
    const b = buildHeartbeat({ track, t: 12345, axis: 60000, width: 800, height: 120, sloMs: 800 });
    expect(a.runs).toEqual(b.runs);
  });
  it('grows the axis with time, then fits the ending', () => {
    expect(axisMs(1000, 5000, false)).toBe(MIN_AXIS_MS);
    expect(axisMs(200000, 210000, false)).toBe(220000);
    expect(axisMs(210000, 210000, true)).toBe(210000);
  });
});

describe('url options', () => {
  it('parses capture and test parameters', () => {
    const o = parseUrlOptions('?speed=8&pauseAt=a3.b20&presenter=1&reducedMotion=0&autoplay&autoDecide=g1:approved,g2:nope&decisions=g1:rejected');
    expect(o.speed).toBe(8);
    expect(o.pauseAt).toBe('a3.b20');
    expect(o.presenter).toBe(true);
    expect(o.reducedMotion).toBe(false);
    expect(o.autoplay).toBe(true);
    expect(o.autoDecide).toEqual({ g1: 'approved' });
    expect(o.decisions).toEqual([{ type: 'gate', gateId: 'g1', decision: 'rejected', by: 'On-call engineer' }]);
  });
  it('has safe defaults', () => {
    const o = parseUrlOptions('');
    expect(o).toMatchObject({ speed: null, pauseAt: null, presenter: false, reducedMotion: null, autoplay: false, seek: null });
    expect(parseUrlOptions('?speed=abc').speed).toBeNull();
  });
});
