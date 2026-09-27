import { copy } from '../copy';
import { useApp } from '../state/store';
import { IncidentClock } from './IncidentClock';
import { PanelRight } from 'lucide-react';
import { SettingsMenu } from './SettingsMenu';
import { SeverityBadge } from './SeverityBadge';
import styles from './TopBar.module.css';

export function TopBar() {
  const world = useApp((s) => s.bundle.scenario.world);
  const panelOpen = useApp((s) => s.ui.panelOpen);
  const setUi = useApp((s) => s.setUi);
  return (
    <header className={styles.bar}>
      <div className={styles.left}>
        <span className={styles.product}>{copy.product}</span>
        <span className={styles.scenario}>
          {world.company} <span className="mono">{world.service}</span>
        </span>
      </div>
      <div className={styles.centre}>
        <SeverityBadge />
        <IncidentClock />
      </div>
      <div className={styles.right}>
        <button
          type="button"
          className={styles.details}
          aria-expanded={panelOpen}
          aria-controls="details-panel"
          onClick={() => setUi({ panelOpen: !panelOpen })}
        >
          <PanelRight size={18} aria-hidden /> {copy.details}
        </button>
        <SettingsMenu />
      </div>
    </header>
  );
}
