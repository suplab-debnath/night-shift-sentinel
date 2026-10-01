import { useShallow } from 'zustand/react/shallow';
import { copy } from '../copy';
import { pendingThought } from '../lib/pending';
import { useApp } from '../state/store';
import { AgentChip } from './AgentChip';
import styles from './StreamItem.module.css';

/** "<Agent> thinking…" at the end of the stream while an agent works out what to say. */
export function PendingThought() {
  const pending = useApp(useShallow((s) => pendingThought(s.snap.timeline, s.snap.state.stream, s.snap.t, s.snap.speed)));
  if (!pending) return null;
  return (
    <li className={`${styles.item} ${styles.pending}`} data-testid="thinking" aria-hidden>
      <div className={styles.meta}>
        <AgentChip agent={pending.agent} />
        <span className={styles.thinking}>
          {copy.panel.thinking}
          <span className={styles.dots}>
            <span />
            <span />
            <span />
          </span>
        </span>
      </div>
    </li>
  );
}
