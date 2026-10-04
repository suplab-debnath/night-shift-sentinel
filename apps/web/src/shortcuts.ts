// Keyboard map (RUNBOOK §5). Pure: resolves a key event to an action so it can be unit-tested.
import { SPEEDS } from './lib/speeds';

export type ShortcutAction =
  | { type: 'togglePlay' }
  | { type: 'toggleSquad' }
  | { type: 'stepForward' }
  | { type: 'stepBack' }
  | { type: 'jumpToAct'; act: number }
  | { type: 'approve' }
  | { type: 'reject' }
  | { type: 'chaos' }
  | { type: 'inject' }
  | { type: 'toggleSplit' }
  | { type: 'toggleInspector' }
  | { type: 'togglePresenter' }
  | { type: 'toggleNotes' }
  | { type: 'switchMode' }
  | { type: 'setSpeed'; speed: number }
  | { type: 'reset' }
  | { type: 'toggleHelp' }
  | { type: 'close' };

export interface KeyLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  /** Tag name and type of the event target, to leave native controls alone. */
  targetTag?: string;
  targetType?: string;
}

export interface ShortcutContext {
  speed: number;
}

/** The rows shown in the shortcuts overlay, in RUNBOOK order. */
export const SHORTCUT_HELP: { keys: string; action: string }[] = [
  { keys: 'Space', action: 'Start, pause the squad, or resume' },
  { keys: 'F', action: 'Freeze everything, clock included (presenter)' },
  { keys: '→ / ←', action: 'Next or previous beat' },
  { keys: '1–7', action: 'Jump to act' },
  { keys: 'A / X', action: 'Approve or reject at an open gate' },
  { keys: 'C', action: 'Chaos test (from Act 4 onward)' },
  { keys: 'L', action: 'Poisoned log test (from Act 3 onward)' },
  { keys: 'S', action: 'Human vs agent split view' },
  { keys: 'I', action: 'Inspector for the focused agent' },
  { keys: 'P', action: 'Presenter mode' },
  { keys: 'N', action: 'Presenter notes strip' },
  { keys: 'M', action: 'Switch mode (scripted or live, if available)' },
  { keys: '+ / -', action: 'Speed up or down (1×, 1.5×, 2×)' },
  { keys: 'R', action: 'Reset to title' },
  { keys: 'Esc', action: 'Close the open overlay or the end summary' },
  { keys: '?', action: 'Show shortcuts' },
];

/** Up: smallest preset above the current speed; down: largest preset below it. */
function nextSpeed(current: number, dir: 1 | -1): number {
  const list = [...SPEEDS];
  if (dir === 1) return list.find((s) => s > current + 1e-9) ?? list[list.length - 1]!;
  return [...list].reverse().find((s) => s < current - 1e-9) ?? list[0]!;
}

export function resolveShortcut(e: KeyLike, ctx: ShortcutContext): ShortcutAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  const tag = (e.targetTag ?? '').toUpperCase();
  const onButton = tag === 'BUTTON' || tag === 'A';
  const onRange = tag === 'INPUT' && e.targetType === 'range';
  const onText = tag === 'TEXTAREA' || (tag === 'INPUT' && !onRange) || tag === 'SELECT';
  if (onText) return null;

  const key = e.key;
  // Space is the operations control (start, pause squad, resume); F freezes everything for questions.
  if (key === ' ' || key === 'Spacebar') return onButton || onRange ? null : { type: 'toggleSquad' };
  if (key === 'ArrowRight') return onRange ? null : { type: 'stepForward' };
  if (key === 'ArrowLeft') return onRange ? null : { type: 'stepBack' };
  if (key === 'Escape') return { type: 'close' };
  if (/^[1-7]$/.test(key)) return { type: 'jumpToAct', act: Number(key) };
  if (key === '+' || key === '=') return { type: 'setSpeed', speed: nextSpeed(ctx.speed, 1) };
  if (key === '-' || key === '_') return { type: 'setSpeed', speed: nextSpeed(ctx.speed, -1) };
  if (key === '?') return { type: 'toggleHelp' };

  switch (key.toLowerCase()) {
    case 'f':
      return { type: 'togglePlay' };
    case 'a':
      return { type: 'approve' };
    case 'x':
      return { type: 'reject' };
    case 'c':
      return { type: 'chaos' };
    case 'l':
      return { type: 'inject' };
    case 's':
      return { type: 'toggleSplit' };
    case 'i':
      return { type: 'toggleInspector' };
    case 'p':
      return { type: 'togglePresenter' };
    case 'n':
      return { type: 'toggleNotes' };
    case 'm':
      return { type: 'switchMode' };
    case 'r':
      return { type: 'reset' };
    default:
      return null;
  }
}
