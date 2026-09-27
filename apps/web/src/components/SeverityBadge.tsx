import { copy } from '../copy';
import { useApp } from '../state/store';
import styles from './SeverityBadge.module.css';

export function SeverityBadge() {
  const severity = useApp((s) => s.snap.state.severity);
  const tone =
    severity === 'Mitigated' ? styles.ok : severity === 'Handed to humans' ? styles.caution : severity === 'none' ? styles.quiet : styles.alert;
  return (
    <span className={`${styles.badge} ${tone}`} data-testid="severity" aria-live="polite">
      {severity === 'none' ? copy.severity.none : severity}
    </span>
  );
}
