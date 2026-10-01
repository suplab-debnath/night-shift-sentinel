import { formatClock } from '@night-shift/engine';
import { useShallow } from 'zustand/react/shallow';
import { copy } from '../copy';
import { useWallNow } from '../hooks/useWallNow';
import { liveClockSec } from '../lib/runclock';
import { useApp } from '../state/store';
import styles from './IncidentClock.module.css';

/**
 * The run clock (D-074): real time, kept running while a person decides or the squad is
 * paused; a chip names a waiting gate, a paused squad, or a labelled fast-forward.
 */
export function IncidentClock() {
  const { clock, hold, speed, rate } = useApp(
    useShallow((s) => ({ clock: s.snap.clock, hold: s.snap.clockHold, speed: s.snap.speed, rate: s.snap.state.clockRate })),
  );
  const now = useWallNow(hold !== null);
  const shown = formatClock(liveClockSec(clock, hold, speed, now));
  // A paused squad already has its banner across the stage; the chip would collide with it.
  const chip = hold?.kind === 'gate' ? copy.clock.awaiting : hold?.kind === 'squad' ? null : (rate?.label ?? null);
  return (
    <div className={styles.wrap}>
      <time className={`${styles.clock} mono`} data-testid="clock" aria-label={`Incident clock ${shown}`}>
        {shown}
      </time>
      {chip && (
        <span className={`${styles.awaiting} ${hold ? '' : styles.rate}`} data-testid="clock-chip">
          {chip}
        </span>
      )}
    </div>
  );
}
