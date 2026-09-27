import { useEffect, useState } from 'react';
import { copy } from '../copy';
import { useApp } from '../state/store';
import styles from './IncidentClock.module.css';

/** Story clock (SCENARIO §3). Pauses during gates with a small waiting counter. */
export function IncidentClock() {
  const clock = useApp((s) => s.snap.clock);
  const awaiting = useApp((s) => s.snap.status === 'awaitingGate');
  const [waited, setWaited] = useState(0);

  useEffect(() => {
    if (!awaiting) {
      setWaited(0);
      return;
    }
    const started = performance.now();
    const id = window.setInterval(() => setWaited(Math.floor((performance.now() - started) / 1000)), 250);
    return () => window.clearInterval(id);
  }, [awaiting]);

  return (
    <div className={styles.wrap}>
      <time className={`${styles.clock} mono`} data-testid="clock" aria-label={`Incident clock ${clock}`}>
        {clock}
      </time>
      {awaiting && (
        <span className={styles.awaiting}>
          {copy.clock.awaiting}
          <span className={`${styles.counter} mono`}>{copy.clock.waitingFor(waited)}</span>
        </span>
      )}
    </div>
  );
}
