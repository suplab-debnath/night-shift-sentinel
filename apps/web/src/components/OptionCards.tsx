import type { OptionSet } from '@night-shift/engine';
import { copy } from '../copy';
import styles from './OptionCards.module.css';

export function OptionCards({ set }: { set: OptionSet }) {
  return (
    <div className={styles.row} role="list" aria-label={copy.stage.options}>
      {set.options.map((o) => {
        const recommended = o.id === set.recommended;
        return (
          <article key={o.id} role="listitem" className={`${styles.card} ${recommended ? styles.recommended : ''}`} data-testid="option-card">
            <header className={styles.head}>
              <span className={`${styles.id} mono`}>{o.id}</span>
              {recommended && <span className={styles.chip}>{copy.stage.recommended}</span>}
            </header>
            <h3 className={styles.action}>{o.action}</h3>
            <dl className={styles.facts}>
              <div>
                <dt>{copy.stage.time}</dt>
                <dd className="mono">{o.time}</dd>
              </div>
              <div>
                <dt>{copy.stage.risk}</dt>
                <dd>{o.risk}</dd>
              </div>
              <div>
                <dt>{copy.stage.reversible}</dt>
                <dd>{o.reversible ? 'Yes' : 'No'}</dd>
              </div>
            </dl>
            <p className={styles.note}>{o.note}</p>
          </article>
        );
      })}
    </div>
  );
}
