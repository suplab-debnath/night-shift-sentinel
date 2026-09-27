import { describe, expect, it } from 'vitest';
import { clockAt, formatClock, parseClock } from './clock';
import { fillPlaceholders, formatArgs, isUnfilled } from './format';
import { easeInOut, metricValueAt } from './metrics';
import { hashString, jitter, mulberry32, randInt } from './prng';
import { ENGINE_VERSION, isAgentId, isKnownEventKind } from './index';

describe('clock', () => {
  it('parses and formats HH:MM:SS', () => {
    expect(parseClock('02:07:00')).toBe(2 * 3600 + 7 * 60);
    expect(parseClock('02:16')).toBe(2 * 3600 + 16 * 60);
    expect(formatClock(parseClock('02:08:31'))).toBe('02:08:31');
    expect(formatClock(-5)).toBe('00:00:00');
    expect(formatClock(86400 + 61)).toBe('00:01:01');
    expect(() => parseClock('2:7')).toThrow();
  });

  it('interpolates between anchors and holds before a jump', () => {
    const anchors = [
      { t: 0, sec: 100, jump: false },
      { t: 1000, sec: 110, jump: false },
      { t: 2000, sec: 400, jump: true },
    ];
    expect(clockAt(anchors, -10)).toBe(100);
    expect(clockAt(anchors, 500)).toBe(105);
    expect(clockAt(anchors, 1500)).toBe(110);
    expect(clockAt(anchors, 2000)).toBe(400);
    expect(clockAt(anchors, 9000)).toBe(400);
    expect(clockAt([], 5, 42)).toBe(42);
  });

  it('never runs backwards between anchors', () => {
    const anchors = [
      { t: 0, sec: 100, jump: false },
      { t: 1000, sec: 90, jump: false },
    ];
    expect(clockAt(anchors, 500)).toBe(100);
  });
});

describe('format', () => {
  it('formats tool args like the script', () => {
    expect(formatArgs({ service: 'checkout-api', window: '15m' })).toBe('{service:"checkout-api", window:"15m"}');
    expect(formatArgs({ depth: 2, ok: true, n: null, list: ['a', 1], nested: { a: 'b' } })).toBe(
      '{depth:2, ok:true, n:null, list:["a", 1], nested:{a:"b"}}',
    );
    expect(formatArgs({ u: undefined })).toBe('{u:undefined}');
  });

  it('fills placeholders with values and fallbacks, leaving unfilled ones visible', () => {
    const values = { PRESENTER_NAME: 'Asha', ORG_NAME: '{{ORG_NAME}}', CLIENT_NAME: '' };
    expect(fillPlaceholders('by {{PRESENTER_NAME|On-call engineer}}', values)).toBe('by Asha');
    expect(fillPlaceholders('by {{PRESENTER_NAME|On-call engineer}}', {})).toBe('by On-call engineer');
    expect(fillPlaceholders('{{ORG_NAME}} for {{CLIENT_NAME}}', values)).toBe('{{ORG_NAME}} for {{CLIENT_NAME}}');
    expect(isUnfilled(undefined)).toBe(true);
    expect(isUnfilled('  ')).toBe(true);
    expect(isUnfilled('{{X}}')).toBe(true);
    expect(isUnfilled('Acme')).toBe(false);
  });
});

describe('metrics', () => {
  it('eases and clamps', () => {
    expect(easeInOut(-1)).toBe(0);
    expect(easeInOut(0.5)).toBeCloseTo(0.5);
    expect(easeInOut(2)).toBe(1);
  });

  it('computes values across tweens', () => {
    const track = {
      initial: 180,
      tweens: [
        { from: 180, to: 4800, startT: 1000, durationMs: 1000 },
        { from: 4800, to: 190, startT: 5000, durationMs: 0 },
      ],
    };
    expect(metricValueAt(track, 0)).toBe(180);
    expect(metricValueAt(track, 1500)).toBeCloseTo(2490);
    expect(metricValueAt(track, 3000)).toBe(4800);
    expect(metricValueAt(track, 5000)).toBe(190);
  });
});

describe('prng', () => {
  it('is deterministic for a seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = Array.from({ length: 5 }, a);
    expect(seqA).toEqual(Array.from({ length: 5 }, b));
    expect(seqA.every((x) => x >= 0 && x < 1)).toBe(true);
  });

  it('provides bounded helpers', () => {
    const rng = mulberry32(hashString('a3.b07'));
    for (let i = 0; i < 100; i++) {
      const n = randInt(rng, 3, 5);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(5);
      const j = jitter(rng, 100, 10);
      expect(Math.abs(j - 100)).toBeLessThanOrEqual(10);
    }
    expect(hashString('x')).toBe(hashString('x'));
    expect(hashString('x')).not.toBe(hashString('y'));
  });
});

describe('guards', () => {
  it('recognises kinds and agents', () => {
    expect(ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(isKnownEventKind('thought')).toBe(true);
    expect(isKnownEventKind('segment.end')).toBe(false);
    expect(isAgentId('guardian')).toBe(true);
    expect(isAgentId('dba')).toBe(false);
  });
});
