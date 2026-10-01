import { X } from 'lucide-react';
import { resolveRunText } from '@night-shift/engine';
import { useMemo } from 'react';
import { copy } from '../copy';
import { spanSec } from '../lib/runclock';
import { useApp } from '../state/store';
import { IllustrativeTag } from './IllustrativeTag';
import styles from './ScorecardSheet.module.css';

/** Five rows, Manual vs Squad, labelled Illustrative (SCENARIO §8, DESIGN §6). */
export function ScorecardSheet({ inline = false }: { inline?: boolean }) {
  // Once the end card shows, the scorecard renders inside it (inline) so they never overlap.
  const visible = useApp(
    (s) => s.snap.state.scorecard !== null && (inline || s.snap.state.endCard === null || s.snap.state.overlay.active),
  );
  const hidden = useApp((s) => s.ui.summaryHidden);
  const setUi = useApp((s) => s.setUi);
  const scenarioRows = useApp((s) => s.bundle.scenario.scorecard);
  // The squad column is measured from this run (D-074); the static values stay for the decks.
  const timeline = useApp((s) => s.snap.timeline);
  const t = useApp((s) => s.snap.t);
  const rows = useMemo(
    () =>
      scenarioRows.map((r) => {
        const live = r.squadLive ? resolveRunText(r.squadLive, timeline, t) : null;
        const span = r.squadSpan ? spanSec(timeline, r.squadSpan[0], r.squadSpan[1]) : null;
        const squad = live && !live.includes('{{') ? live : r.squad;
        return { ...r, squad, squadMinutes: span !== null ? span / 60 : r.squadMinutes };
      }),
    [scenarioRows, timeline, t],
  );
  const footnote = useApp((s) => s.bundle.scenario.scorecardFootnote);
  if (!visible || (!inline && hidden)) return null;
  const max = Math.max(...rows.map((r) => r.manualMinutes ?? 0));
  return (
    <section className={inline ? styles.inline : styles.sheet} aria-label={copy.scorecard.title} data-testid="scorecard">
      <header className={styles.head}>
        <h2 className={styles.title}>{copy.scorecard.title}</h2>
        <span className={styles.headEnd}>
          <IllustrativeTag />
          {!inline && (
            <button type="button" className={styles.close} onClick={() => setUi({ summaryHidden: true })} aria-label={copy.end.close} data-testid="scorecard-close">
              <X size={18} aria-hidden />
            </button>
          )}
        </span>
      </header>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col" />
            <th scope="col">{copy.scorecard.manual}</th>
            <th scope="col">{copy.scorecard.squad}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.measure}>
              <th scope="row">{r.measure}</th>
              <td>
                <span className={styles.value}>{r.manual}</span>
                {r.manualMinutes !== undefined && max > 0 && (
                  <span className={`${styles.bar} ${styles.manual}`} style={{ width: `${(r.manualMinutes / max) * 100}%` }} aria-hidden />
                )}
              </td>
              <td>
                <span className={`${styles.value} ${styles.squadValue}`}>{r.squad}</span>
                {r.squadMinutes !== undefined && max > 0 && (
                  <span
                    className={`${styles.bar} ${styles.squad}`}
                    style={{ width: `max(2px, ${(r.squadMinutes / max) * 100}%)` }}
                    aria-hidden
                  />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className={styles.foot}>{footnote}</p>
    </section>
  );
}
