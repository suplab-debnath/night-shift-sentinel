import { describe, expect, it } from 'vitest';
import { compile } from './compile';
import { createPlayer } from './player';
import { fixture } from './test-fixture';

const override = {
  events: [
    { kind: 'tool.call' as const, agent: 'sentinel' as const, callId: 'live-1', tool: 'metrics.query', args: { window: '15m' }, source: 'live' as const },
    { kind: 'thought' as const, agent: 'sentinel' as const, text: 'Live words.', source: 'live' as const },
  ],
};

describe('beat overrides (live mode)', () => {
  it('replaces a beat without moving any other beat', () => {
    const base = compile(fixture);
    const tl = compile(fixture, [], { overrides: { 'a1.b02': override } });
    const beat = tl.events.filter((e) => e.beat === 'a1.b02');
    expect(beat.map((e) => e.kind)).toEqual(['tool.call', 'thought']);
    expect(beat.every((e) => e.source === 'live')).toBe(true);
    expect(beat[0]!.t).toBe(1000);
    expect(beat[1]!.t).toBeGreaterThan(1000);
    expect(beat[1]!.t).toBeLessThan(2000);
    expect(beat[0]!.clock).toBe('02:07:01');
    const others = (x: typeof tl) => x.events.filter((e) => e.beat !== 'a1.b02').map((e) => [e.id, e.t]);
    expect(others(tl)).toEqual(others(base));
    expect(tl.beats.map((b) => b.t)).toEqual(base.beats.map((b) => b.t));
  });

  it('respects explicit offsets and applies overrides in continuation segments', () => {
    const tl = compile(fixture, [{ type: 'gate', gateId: 'g1', decision: 'approved', by: 'x' }], {
      overrides: { 'a6.b02': { events: [{ kind: 'thought', agent: 'fixer', text: 'Done live.', source: 'fallback', offsetMs: 100 }] } },
    });
    const e = tl.events.find((x) => x.beat === 'a6.b02')!;
    expect(e).toMatchObject({ source: 'fallback', kind: 'thought' });
    expect(e.t).toBe(tl.beats.find((b) => b.id === 'a6.b02')!.t + 100);
  });
});

describe('player holds and overrides', () => {
  it('holds just before a live beat, then plays the override once released', () => {
    const p = createPlayer(fixture);
    p.hold(['a1.b02']);
    p.play();
    p.advance(5000);
    let s = p.getSnapshot();
    expect(s.t).toBe(999);
    expect(s.holding).toBe('a1.b02');
    expect(p.setOverride('a1.b02', override)).toBe(true);
    p.release('a1.b02');
    expect(p.getSnapshot().holding).toBeNull();
    p.advance(1500);
    s = p.getSnapshot();
    expect(s.state.stream.some((e) => e.type === 'thought' && e.text === 'Live words.' && e.source === 'live')).toBe(true);
  });

  it('refuses an override for a beat that already played', () => {
    const p = createPlayer(fixture);
    p.seek(1500);
    expect(p.setOverride('a1.b02', override)).toBe(false);
    expect(p.setOverride('a2.b01', { events: [{ kind: 'thought', agent: 'sentinel', text: 'Later.', source: 'live' }] })).toBe(true);
  });

  it('keeps state consistent when an override lands ahead of playback', () => {
    const p = createPlayer(fixture);
    p.play();
    p.advance(500);
    const before = p.getSnapshot().state;
    p.setOverride('a2.b01', { events: [{ kind: 'thought', agent: 'sentinel', text: 'Ahead.', source: 'live' }] });
    expect(p.getSnapshot().state).toBe(before);
    p.advance(5000);
    const seeked = createPlayer(fixture);
    seeked.setOverride('a2.b01', { events: [{ kind: 'thought', agent: 'sentinel', text: 'Ahead.', source: 'live' }] });
    seeked.seek(p.getSnapshot().t);
    expect(seeked.getSnapshot().state).toEqual(p.getSnapshot().state);
  });

  it('releases all holds and clears overrides', () => {
    const p = createPlayer(fixture);
    p.hold(['a1.b02', 'a2.b01']);
    p.releaseAll();
    p.play();
    p.advance(3000);
    expect(p.getSnapshot().t).toBe(3000);
    p.seek(0);
    p.setOverride('a1.b02', override);
    p.clearOverrides();
    p.seek(2000);
    expect(p.getSnapshot().state.stream.some((e) => e.type === 'thought' && e.text === 'Live words.')).toBe(false);
  });
});
