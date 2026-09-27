import { copy } from '../copy';
import { useApp } from '../state/store';
import { AgentChip } from './AgentChip';
import styles from './PanelList.module.css';

export function EvidenceTab() {
  const evidence = useApp((s) => s.snap.state.evidence);
  if (evidence.cards.length === 0) return <p className={styles.empty}>{copy.panel.emptyEvidence}</p>;
  return (
    <div className={styles.list}>
      {evidence.conclusion && (
        <article className={`${styles.card} ${styles.strong}`} data-testid="panel-root-cause">
          <div className={styles.label}>{copy.panel.rootCause}</div>
          <p className={styles.title}>{evidence.conclusion.text}</p>
          <div className={`${styles.meta} mono`}>
            {copy.panel.confidence} {evidence.conclusion.confidence.toFixed(2)}
          </div>
        </article>
      )}
      {evidence.cards.map((c) => (
        <article key={c.cardId} className={`${styles.card} ${c.ruledOut ? styles.dismissed : ''}`} data-testid={c.kind === 'hypothesis' ? 'suspect-card' : undefined}>
          <AgentChip agent={c.agent} compact />
          <p className={`${styles.text} ${c.ruledOut ? styles.struck : ''}`}>{c.text}</p>
          {c.ruledOut && (
            <p className={styles.meta}>
              {copy.panel.ruledOut}: {c.ruledOut.reason}
            </p>
          )}
        </article>
      ))}
    </div>
  );
}
