import { describe, expect, it } from 'vitest';
import { layoutLabels } from './lib/lanes';
import { resolveShortcut, SHORTCUT_HELP } from './shortcuts';

const ctx = { speed: 1 };
const k = (key: string, extra: Record<string, unknown> = {}) => resolveShortcut({ key, ...extra }, ctx);

describe('shortcut map (RUNBOOK §5)', () => {
  it('maps every RUNBOOK key', () => {
    expect(k(' ')).toEqual({ type: 'toggleSquad' });
    expect(k('f')).toEqual({ type: 'togglePlay' });
    expect(k('ArrowRight')).toEqual({ type: 'stepForward' });
    expect(k('ArrowLeft')).toEqual({ type: 'stepBack' });
    for (let n = 1; n <= 7; n++) expect(k(String(n))).toEqual({ type: 'jumpToAct', act: n });
    expect(k('8')).toBeNull();
    expect(k('a')).toEqual({ type: 'approve' });
    expect(k('X')).toEqual({ type: 'reject' });
    expect(k('c')).toEqual({ type: 'chaos' });
    expect(k('s')).toEqual({ type: 'toggleSplit' });
    expect(k('i')).toEqual({ type: 'toggleInspector' });
    expect(k('p')).toEqual({ type: 'togglePresenter' });
    expect(k('n')).toEqual({ type: 'toggleNotes' });
    expect(k('m')).toEqual({ type: 'switchMode' });
    expect(k('r')).toEqual({ type: 'reset' });
    expect(k('?')).toEqual({ type: 'toggleHelp' });
    expect(k('Escape')).toEqual({ type: 'close' });
    expect(k('z')).toBeNull();
    expect(SHORTCUT_HELP).toHaveLength(15);
  });

  it('steps speed through 1×, 1.5×, 2× and clamps', () => {
    expect(resolveShortcut({ key: '+' }, { speed: 1 })).toEqual({ type: 'setSpeed', speed: 1.5 });
    expect(resolveShortcut({ key: '=' }, { speed: 1.5 })).toEqual({ type: 'setSpeed', speed: 2 });
    expect(resolveShortcut({ key: '+' }, { speed: 2 })).toEqual({ type: 'setSpeed', speed: 2 });
    expect(resolveShortcut({ key: '-' }, { speed: 2 })).toEqual({ type: 'setSpeed', speed: 1.5 });
    expect(resolveShortcut({ key: '-' }, { speed: 1 })).toEqual({ type: 'setSpeed', speed: 1 });
    // From a URL speed outside the list.
    expect(resolveShortcut({ key: '-' }, { speed: 8 })).toEqual({ type: 'setSpeed', speed: 2 });
    expect(resolveShortcut({ key: '+' }, { speed: 1.2 })).toEqual({ type: 'setSpeed', speed: 1.5 });
    expect(resolveShortcut({ key: '-' }, { speed: 1.2 })).toEqual({ type: 'setSpeed', speed: 1 });
  });

  it('leaves native controls and modified keys alone', () => {
    expect(k(' ', { targetTag: 'BUTTON' })).toBeNull();
    expect(k('ArrowRight', { targetTag: 'INPUT', targetType: 'range' })).toBeNull();
    expect(k('a', { targetTag: 'INPUT', targetType: 'text' })).toBeNull();
    expect(k('a', { targetTag: 'INPUT', targetType: 'range' })).toEqual({ type: 'approve' });
    expect(k('r', { metaKey: true })).toBeNull();
    expect(k('c', { ctrlKey: true })).toBeNull();
  });
});

describe('label layout', () => {
  it('stacks overlapping labels into rows', () => {
    const placed = layoutLabels(
      [
        { x: 10, text: 'aaaaaaaaaa' },
        { x: 12, text: 'bbbb' },
        { x: 40, text: 'cccc' },
      ],
      { charPct: 1, gapPct: 1 },
    );
    expect(placed.map((p) => p.row)).toEqual([0, 1, 0]);
  });
});
