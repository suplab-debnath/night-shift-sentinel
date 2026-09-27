import { copy } from '../copy';
import { useApp } from '../state/store';
import { AgentChip } from './AgentChip';
import styles from './PanelList.module.css';

const SEVERITY = { info: '', warn: styles.warn, high: styles.high } as const;

/** Every tool call, policy check, gate, and denial, derived from events. */
export function AuditTab() {
  const audit = useApp((s) => s.snap.state.audit);
  if (audit.length === 0) return <p className={styles.empty}>{copy.panel.emptyAudit}</p>;
  return (
    <ol className={styles.list} data-testid="audit">
      {[...audit].reverse().map((row) => (
        <li key={row.id} className={`${styles.row} ${SEVERITY[row.severity]}`}>
          <div className={styles.rowHead}>
            <time className={`${styles.meta} mono`}>{row.clock}</time>
            {row.agent && <AgentChip agent={row.agent} compact />}
            <span className={styles.category}>{row.category}</span>
          </div>
          <p className={`${styles.text} ${row.category === 'tool' ? 'mono' : ''}`}>{row.text}</p>
        </li>
      ))}
    </ol>
  );
}
