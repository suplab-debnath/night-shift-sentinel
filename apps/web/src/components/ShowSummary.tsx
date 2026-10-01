import { ClipboardList } from 'lucide-react';
import { copy } from '../copy';
import { useApp } from '../state/store';
import styles from './ShowSummary.module.css';

/** Brings the closed scorecard / end card back. */
export function ShowSummary() {
  const show = useApp((s) => s.ui.summaryHidden && s.snap.state.scorecard !== null && !s.snap.state.overlay.active);
  const setUi = useApp((s) => s.setUi);
  if (!show) return null;
  return (
    <button type="button" className={styles.chip} onClick={() => setUi({ summaryHidden: false })} data-testid="show-summary">
      <ClipboardList size={16} aria-hidden /> {copy.end.showSummary}
    </button>
  );
}
