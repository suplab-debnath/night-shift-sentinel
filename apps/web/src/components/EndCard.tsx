import { Columns2, RotateCcw, Zap } from 'lucide-react';
import { copy } from '../copy';
import { useApp } from '../state/store';
import styles from './EndCard.module.css';
import { ScorecardSheet } from './ScorecardSheet';

export function EndCard() {
  const visible = useApp((s) => s.snap.state.endCard !== null && !s.snap.state.overlay.active);
  const handed = useApp((s) => s.snap.state.severity === 'Handed to humans');
  const endings = useApp((s) => s.bundle.scenario.endings);
  const source = useApp((s) => s.source);
  const setUi = useApp((s) => s.setUi);
  const canChaos = useApp((s) => s.snap.canChaos);
  if (!visible) return null;
  const headline = handed ? endings.B.headline : endings.A.headline;
  return (
    <>
    <div className={styles.scrim} aria-hidden />
    <div className={styles.card} role="region" aria-label={headline} data-testid="end-card" data-ending={handed ? 'B' : 'A'}>
      <h2 className={styles.headline}>{headline}</h2>
      <div className={styles.actions}>
        <button type="button" className={styles.button} onClick={() => setUi({ splitOpen: true })}>
          <Columns2 size={18} aria-hidden /> {copy.end.showSplit}
        </button>
        <button type="button" className={styles.button} onClick={() => source.triggerChaos()} disabled={!canChaos}>
          <Zap size={18} aria-hidden /> {copy.end.tryChaos}
        </button>
        <button type="button" className={styles.button} onClick={() => source.reset()}>
          <RotateCcw size={18} aria-hidden /> {copy.end.replay}
        </button>
      </div>
      <ScorecardSheet inline />
    </div>
    </>
  );
}
