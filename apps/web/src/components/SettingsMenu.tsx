import { Keyboard, Settings } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { copy } from '../copy';
import { useApp } from '../state/store';
import type { StageSnapshot } from '../sources/types';
import { SPEEDS } from '../lib/speeds';
import styles from './SettingsMenu.module.css';

function sourceLabel(mode: StageSnapshot['mode'], provider: StageSnapshot['provider']): string {
  return mode === 'live' && provider === 'mock' ? copy.mode.liveMock : copy.mode[mode];
}

/** Hidden in presenter mode (DESIGN §11). Also the only place the source (scripted, live) shows. */
export function SettingsMenu() {
  const ui = useApp((s) => s.ui);
  const speed = useApp((s) => s.snap.speed);
  const stage = useApp((s) => s.source);
  const setUi = useApp((s) => s.setUi);
  const source = useApp(
    useShallow((s) => ({
      mode: s.snap.mode,
      provider: s.snap.provider,
      take: s.snap.take,
      pace: s.snap.pace,
      fallbacks: s.snap.state.fallbackCount,
    })),
  );
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [open]);

  if (ui.presenter) return null;
  const toggles: { key: 'reducedMotion' | 'presenter' | 'notes'; label: string }[] = [
    { key: 'reducedMotion', label: copy.settings.reduceMotion },
    { key: 'presenter', label: copy.settings.presenter },
    { key: 'notes', label: copy.settings.notes },
  ];
  return (
    <div className={styles.wrap} ref={ref}>
      <button type="button" className={styles.trigger} aria-expanded={open} aria-haspopup="menu" aria-label={copy.settings.title} onClick={() => setOpen((o) => !o)} data-testid="settings">
        <Settings size={18} />
      </button>
      {open && (
        <div className={styles.menu} role="menu">
          <p className={styles.source} data-testid="mode">
            {sourceLabel(source.mode, source.provider)}
            <span className={styles.sourceDetail}>
              {source.mode === 'scripted' ? copy.mode.take(source.take) : copy.mode.fallbacks(source.fallbacks)} · {copy.mode.pace(source.pace)}
            </span>
          </p>
          {toggles.map((t) => (
            <button
              key={t.key}
              type="button"
              role="menuitemcheckbox"
              aria-checked={ui[t.key]}
              className={styles.item}
              onClick={() => setUi({ [t.key]: !ui[t.key] })}
              data-testid={`setting-${t.key}`}
            >
              <span className={styles.box} aria-hidden>
                {ui[t.key] ? '✓' : ''}
              </span>
              {t.label}
            </button>
          ))}
          <div className={styles.speeds} role="radiogroup" aria-label={copy.ops.speed}>
            {SPEEDS.map((sp) => (
              <button key={sp} type="button" role="radio" aria-checked={speed === sp} className={styles.speed} onClick={() => stage.setSpeed(sp)}>
                {sp}×
              </button>
            ))}
          </div>
          <button
            type="button"
            role="menuitem"
            className={styles.item}
            onClick={() => {
              setOpen(false);
              setUi({ shortcutsOpen: true });
            }}
          >
            <Keyboard size={16} aria-hidden /> {copy.settings.shortcuts}
          </button>
        </div>
      )}
    </div>
  );
}
