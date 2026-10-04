import { copy } from '../copy';
import { useApp } from '../state/store';
import styles from './ChaosBanner.module.css';

export function ChaosBanner() {
  const active = useApp((s) => s.snap.state.overlay.active);
  const name = useApp((s) => s.snap.state.overlay.name);
  if (!active) return null;
  return (
    <div className={styles.banner} role="status" data-testid="chaos-banner" data-overlay={name ?? 'chaos'}>
      {name === 'inject' ? copy.chaos.injectBanner : copy.chaos.banner}
    </div>
  );
}
