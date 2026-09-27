import { copy } from '../copy';
import { AGENT_HUE } from '../lib/agents';
import { clamp } from '../lib/format';
import { useShallow } from 'zustand/react/shallow';
import { useApp } from '../state/store';
import styles from './EvidenceBoard.module.css';

const MERGE = 500;
/** Playback ms a ruled-out suspect stays full size before shrinking into the ruled-out line. */
const LINGER = 2500;

/** Clue cards pin in Act 3 and merge into the root-cause card (DESIGN §6). */
export function EvidenceBoard() {
  const evidence = useApp((s) => s.snap.state.evidence);
  const act = useApp((s) => s.snap.state.act);
  const t = useApp((s) => {
    const c = s.snap.state.evidence.conclusion;
    // Only subscribe to time while the merge animation runs.
    return c && s.snap.t - c.t < MERGE + 50 ? s.snap.t : c ? c.t + MERGE : 0;
  });
  const reduced = useApp((s) => s.ui.reducedMotion);
  const collapsed = useApp(
    useShallow((s) =>
      s.snap.state.evidence.cards.filter((c) => c.ruledOut && s.snap.t - c.ruledOut.t >= LINGER).map((c) => c.cardId),
    ),
  );
  const names = useApp((s) => s.bundle.agents.agents);
  if (evidence.cards.length === 0 || act < 3 || act > 5) return null;

  const conclusion = evidence.conclusion;
  const k = conclusion ? (reduced ? 1 : clamp((t - conclusion.t) / MERGE, 0, 1)) : 0;
  const nameOf = (id: string) => names.find((a) => a.id === id)?.name ?? id;
  const shown = evidence.cards.filter((c) => !collapsed.includes(c.cardId));
  const dismissed = evidence.cards.filter((c) => collapsed.includes(c.cardId));

  return (
    <div className={styles.board} data-testid="evidence-board">
      {k < 1 && dismissed.length > 0 && (
        <p className={styles.dismissed} style={{ opacity: 1 - k }} data-testid="ruled-out">
          {copy.panel.ruledOut}:{' '}
          {dismissed.map((c) => (
            <s key={c.cardId} className={styles.dismissedItem}>
              {c.text.replace(/^Suspect:\s*/, '')}
            </s>
          ))}
        </p>
      )}
      {k < 1 && (
        <div className={styles.clues} style={{ opacity: 1 - k, gap: `${16 * (1 - k)}px` }}>
          {shown.map((c, i) => (
            <article
              key={c.cardId}
              className={`${styles.card} ${c.kind === 'hypothesis' ? styles.suspect : ''} ${c.ruledOut ? styles.ruled : ''}`}
              style={{ transform: `translateX(${-i * 240 * k * 0.6}px)` }}
              data-testid={c.kind === 'hypothesis' ? 'suspect-card' : 'clue-card'}
            >
              <header className={styles.who}>
                <span className={styles.dot} style={{ background: AGENT_HUE[c.agent] }} aria-hidden />
                <span className={styles.name}>{nameOf(c.agent)}</span>
                {c.kind === 'hypothesis' && (
                  <span className={styles.tag}>{c.ruledOut ? copy.panel.ruledOut : copy.panel.suspect}</span>
                )}
              </header>
              <p className={styles.text}>{c.kind === 'hypothesis' ? c.text.replace(/^Suspect:\s*/, '') : c.text}</p>
              {c.ruledOut && <p className={styles.reason}>{c.ruledOut.reason}</p>}
            </article>
          ))}
        </div>
      )}
      {conclusion && (
        <article className={`${styles.card} ${styles.root}`} style={{ opacity: k }} data-testid="root-cause">
          <header className={styles.who}>{copy.panel.rootCause}</header>
          <p className={styles.rootText}>{conclusion.text}</p>
          <div className={styles.meter}>
            <span className={styles.meterLabel}>{copy.panel.confidence}</span>
            <span className={styles.track} aria-hidden>
              <span className={styles.fill} style={{ width: `${conclusion.confidence * 100}%` }} />
            </span>
            <span className="mono">{conclusion.confidence.toFixed(2)}</span>
          </div>
        </article>
      )}
    </div>
  );
}
