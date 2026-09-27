import type { Checklist } from '@night-shift/engine';
import { motion } from 'motion/react';
import { copy } from '../copy';
import styles from './GuardrailChecklist.module.css';

const TONE = { pass: styles.pass, fail: styles.fail, required: styles.required } as const;

export function GuardrailChecklist({ list, speed = 1 }: { list: Checklist; speed?: number }) {
  return (
    <div className={styles.list} aria-label={copy.stage.checklist} data-testid="checklist">
      <div className={styles.title}>
        {copy.stage.checklist} <span className="mono">{String(list.args.action ?? '')}</span>
      </div>
      <ul className={styles.rows}>
        {list.rows.map((r) => (
          <motion.li
            key={r.policyId}
            className={styles.row}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28 / speed }}
          >
            <span className={`${styles.id} mono`}>{r.policyId}</span>
            <span className={styles.desc}>
              {r.description}
              {r.reason && <span className={styles.reason}>{r.reason}</span>}
            </span>
            <span className={`${styles.result} ${TONE[r.result]}`}>{copy.stage.result[r.result]}</span>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}
