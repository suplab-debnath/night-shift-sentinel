import { useShallow } from 'zustand/react/shallow';
import { copy } from '../copy';
import { useApp } from '../state/store';
import type { PanelTab } from '../state/store';
import { ArtifactsTab } from './ArtifactsTab';
import { AuditTab } from './AuditTab';
import { ChannelTab } from './ChannelTab';
import { EvidenceTab } from './EvidenceTab';
import styles from './SidePanel.module.css';
import { ThoughtStream } from './ThoughtStream';

const TABS: PanelTab[] = ['stream', 'evidence', 'channel', 'audit', 'artifacts'];

export function SidePanel() {
  const tab = useApp((s) => s.ui.tab);
  const setUi = useApp((s) => s.setUi);
  const open = useApp((s) => s.ui.panelOpen);
  const counts = useApp(
    useShallow((s) => ({
      evidence: s.snap.state.evidence.cards.length,
      channel: s.snap.state.channel.length,
      artifacts: s.snap.state.artifacts.length,
    })),
  );
  return (
    <aside className={styles.panel} aria-label={copy.details} id="details-panel" data-open={open || undefined}>
      <div className={styles.tabs} role="tablist">
        {TABS.map((id) => (
          <button
            key={id}
            role="tab"
            id={`tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            className={styles.tab}
            onClick={() => setUi({ tab: id })}
            data-testid={`tab-${id}`}
          >
            {copy.panel.tabs[id]}
            {/* Counts where they mean something; the audit trail is long by design. */}
            {id !== 'stream' && id !== 'audit' && counts[id] > 0 && <span className={styles.count}>{counts[id]}</span>}
          </button>
        ))}
      </div>
      <div className={styles.body} role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'stream' && <ThoughtStream />}
        {tab === 'evidence' && <EvidenceTab />}
        {tab === 'channel' && <ChannelTab />}
        {tab === 'audit' && <AuditTab />}
        {tab === 'artifacts' && <ArtifactsTab />}
      </div>
    </aside>
  );
}
