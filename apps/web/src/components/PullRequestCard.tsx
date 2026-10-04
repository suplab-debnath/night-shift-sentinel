import type { Checklist } from '@night-shift/engine';
import { Check, GitPullRequestDraft } from 'lucide-react';
import { copy } from '../copy';
import styles from './PullRequestCard.module.css';

const CHECK_LABEL: Record<string, string> = {
  build: 'Build',
  'unit-tests': 'Unit tests',
  'new-tests': 'New tests',
  lint: 'Coding guidelines',
  'secret-scan': 'Secret scan',
  sast: 'Security scan',
};

/** The morning-after pull request on stage (Act 7, D-079): draft, checks, waiting for a person. */
export function PullRequestCard({ list }: { list: Checklist }) {
  const checks = Array.isArray(list.args.checks) ? (list.args.checks as string[]) : [];
  return (
    <div className={styles.card} data-testid="pr-card">
      <div className={styles.head}>
        <GitPullRequestDraft size={20} aria-hidden className={styles.icon} />
        <div>
          <div className={styles.title}>{copy.pr.title(`#${String(list.args.pr ?? '')}`)}</div>
          <div className={styles.status}>{copy.pr.draft}</div>
        </div>
      </div>
      <div className={styles.label}>{copy.pr.checks}</div>
      <ul className={styles.checks}>
        {checks.map((c) => (
          <li key={c} className={styles.check}>
            <Check size={14} aria-hidden /> {CHECK_LABEL[c] ?? c}
          </li>
        ))}
      </ul>
    </div>
  );
}
