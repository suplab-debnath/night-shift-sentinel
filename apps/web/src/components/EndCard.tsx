import { Columns2, RotateCcw, X, Zap } from 'lucide-react';
import { resolveRunText } from '@night-shift/engine';
import { copy } from '../copy';
import { useApp } from '../state/store';
import styles from './EndCard.module.css';
import { ScorecardSheet } from './ScorecardSheet';

export function EndCard() {
  const visible = useApp((s) => s.snap.state.endCard !== null && !s.snap.state.overlay.active && !s.ui.summaryHidden);
  const handed = useApp((s) => s.snap.state.severity === 'Handed to humans');
  const endings = useApp((s) => s.bundle.scenario.endings);
  const timeline = useApp((s) => s.snap.timeline);
  const t = useApp((s) => s.snap.t);
  const source = useApp((s) => s.source);
  const setUi = useApp((s) => s.setUi);
  const canChaos = useApp((s) => s.snap.canChaos);
  if (!visible) return null;
  const ending = handed ? endings.B : endings.A;
  const live = ending.headlineLive ? resolveRunText(ending.headlineLive, timeline, t) : null;
  const headline = live && !live.includes('{{') ? live : ending.headline;
  // First sentence as the headline, the rest as a quieter line under it.
  const [lead, ...more] = headline.split(/(?<=\.)\s+/);
  const rest = more.join(' ');
  return (
    <>
    <div className={styles.scrim} aria-hidden />
    <div className={styles.card} role="region" aria-label={headline} data-testid="end-card" data-ending={handed ? 'B' : 'A'}>
      <button type="button" className={styles.close} onClick={() => setUi({ summaryHidden: true })} aria-label={copy.end.close} data-testid="end-close">
        <X size={20} aria-hidden />
      </button>
      <h2 className={styles.headline}>{lead}</h2>
      {rest && <p className={styles.sub}>{rest}</p>}
      <div className={styles.actions}>
        <button type="button" className={styles.button} onClick={() => setUi({ splitOpen: true })}>
          <Columns2 size={18} aria-hidden /> {copy.end.showSplit}
        </button>
        <button type="button" className={styles.button} onClick={() => source.triggerChaos()} disabled={!canChaos}>
          <Zap size={18} aria-hidden /> {copy.end.tryChaos}
        </button>
        <button type="button" className={styles.button} onClick={() => source.reset()} data-testid="replay">
          <RotateCcw size={18} aria-hidden /> {copy.end.replay}
        </button>
      </div>
      <ScorecardSheet inline />
    </div>
    </>
  );
}
