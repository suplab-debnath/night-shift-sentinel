import { copy } from '../copy';
import { useApp } from '../state/store';
import styles from './ProgressChip.module.css';

/** Rollout progress, anchored under the acting agent (Act 6). */
export function ProgressChip() {
  const progress = useApp((s) => s.snap.state.progress);
  const act = useApp((s) => s.snap.state.act);
  const agent = useApp((s) => (progress ? s.bundle.agentById(progress.agent) : undefined));
  if (!progress || !agent || act !== 6) return null;
  return (
    <div
      className={styles.chip}
      style={{ left: `${agent.position.x}%`, top: `calc(${agent.position.y}% + var(--node) / 2 + 40px)` }}
      role="status"
      aria-label={`${copy.stage.progress}: ${progress.label}`}
    >
      <div className={styles.segments} aria-hidden>
        {Array.from({ length: progress.total }, (_, i) => (
          <span key={i} className={i < progress.current ? styles.filled : ''} />
        ))}
      </div>
      <span className={styles.label}>{progress.label}</span>
    </div>
  );
}
