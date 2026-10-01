import { copy } from '../copy';
import { approverName } from '../config';
import { useWallNow } from '../hooks/useWallNow';
import { mmss } from '../lib/runclock';
import { useApp } from '../state/store';
import styles from './ChaosBanner.module.css';

/** The squad is paused by a person: agents hold, the incident clock keeps running (D-075). */
export function SquadBanner() {
  const hold = useApp((s) => (s.snap.clockHold?.kind === 'squad' ? s.snap.clockHold : null));
  const speed = useApp((s) => s.snap.speed);
  const now = useWallNow(hold !== null, 500);
  if (!hold) return null;
  return (
    <div className={`${styles.banner} ${styles.paused}`} role="status" data-testid="squad-paused">
      {copy.ops.paused(approverName)} <span className="mono">{mmss(((now - hold.since) * speed) / 1000)}</span>
    </div>
  );
}
