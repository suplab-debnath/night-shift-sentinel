import { copy } from '../copy';
import { useApp } from '../state/store';
import { IllustrativeTag } from './IllustrativeTag';
import styles from './ScorecardSheet.module.css';

/** Five rows, Manual vs Squad, labelled Illustrative (SCENARIO §8, DESIGN §6). */
export function ScorecardSheet({ inline = false }: { inline?: boolean }) {
  // Once the end card shows, the scorecard renders inside it (inline) so they never overlap.
  const visible = useApp(
    (s) => s.snap.state.scorecard !== null && (inline || s.snap.state.endCard === null || s.snap.state.overlay.active),
  );
  const rows = useApp((s) => s.bundle.scenario.scorecard);
  const footnote = useApp((s) => s.bundle.scenario.scorecardFootnote);
  if (!visible) return null;
  const max = Math.max(...rows.map((r) => r.manualMinutes ?? 0));
  return (
    <section className={inline ? styles.inline : styles.sheet} aria-label={copy.scorecard.title} data-testid="scorecard">
      <header className={styles.head}>
        <h2 className={styles.title}>{copy.scorecard.title}</h2>
        <IllustrativeTag />
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
