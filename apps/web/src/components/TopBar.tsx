import { copy } from '../copy';
import { useApp } from '../state/store';
import { IncidentClock } from './IncidentClock';
import { PanelRight } from 'lucide-react';
import { SettingsMenu } from './SettingsMenu';
import { SeverityBadge } from './SeverityBadge';
import styles from './TopBar.module.css';
import { beatOnPath } from '../lib/runclock';

export function TopBar() {
  const world = useApp((s) => s.bundle.scenario.world);
  const panelOpen = useApp((s) => s.ui.panelOpen);
  const setUi = useApp((s) => s.setUi);
  // Night until customer impact ends, then dawn (D-080).
  const dawn = useApp((s) => {
    const until = s.bundle.scenario.impact?.until;
    const end = until ? beatOnPath(s.snap.timeline, until) : null;
    return end !== null && end.t <= s.snap.t;
  });
  return (
    <header className={styles.bar}>
      <span className={styles.sky} data-dawn={dawn || undefined} aria-hidden />
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
