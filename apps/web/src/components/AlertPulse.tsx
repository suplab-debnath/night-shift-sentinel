import { useApp } from '../state/store';
import styles from './AlertPulse.module.css';

const PULSE = 600;

/** Red edge pulse ×2 at the SEV-2 alert: the only unprompted big motion in Act 1. */
export function AlertPulse() {
  const opacity = useApp((s) => {
    const alert = s.snap.state.alert;
    if (!alert || s.ui.reducedMotion) return 0;
    const age = s.snap.t - alert.t;
    if (age < 0 || age > PULSE * 2) return 0;
    const phase = (age % PULSE) / PULSE;
    return Math.round(Math.sin(phase * Math.PI) * 100) / 100;
  });
  if (opacity <= 0) return null;
  return <div className={styles.pulse} style={{ opacity }} aria-hidden />;
}
