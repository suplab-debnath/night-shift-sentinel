import { copy } from '../copy';
import { useApp } from '../state/store';
import styles from './ChaosBanner.module.css';

export function ChaosBanner() {
  const active = useApp((s) => s.snap.state.overlay.active);
  if (!active) return null;
  return (
    <div className={styles.banner} role="status" data-testid="chaos-banner">
      {copy.chaos.banner}
    </div>
  );
}
