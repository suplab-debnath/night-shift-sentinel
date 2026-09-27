import { ArrowRight } from 'lucide-react';
import { formatArgs, type StreamEntry } from '@night-shift/engine';
import { visibleChars } from '../lib/typing';
import { useApp } from '../state/store';
import { AgentChip } from './AgentChip';
import { CodeBlock } from './CodeBlock';
import styles from './StreamItem.module.css';

function Meta({ entry, children }: { entry: StreamEntry; children: React.ReactNode }) {
  return (
    <div className={styles.meta}>
      {children}
      {entry.clock && <time className={`${styles.time} mono`}>{entry.clock}</time>}
    </div>
  );
}

function TypedText({ id, text, t0, typed }: { id: string; text: string; t0: number; typed: boolean }) {
  const shown = useApp((s) =>
    visibleChars({
      length: text.length,
      elapsedMs: s.snap.t - t0,
      speed: s.snap.speed,
      reducedMotion: s.ui.reducedMotion,
      typed,
      key: `${s.snap.take}:${id}`,
    }),
  );
  return (
    <p className={styles.thought}>
      <span aria-hidden={shown < text.length}>{text.slice(0, shown)}</span>
      {shown < text.length && <span className={styles.caret} aria-hidden />}
    </p>
  );
}

export function StreamItem({ entry }: { entry: StreamEntry }) {
  switch (entry.type) {
    case 'thought':
      return (
        <li className={styles.item} data-testid="thought">
          <Meta entry={entry}>
            <AgentChip agent={entry.agent} />
          </Meta>
          <TypedText id={entry.id} text={entry.text} t0={entry.t} typed={entry.typed} />
        </li>
      );
    case 'tool.call':
      return (
        <li className={styles.item} data-testid="tool-call">
          <Meta entry={entry}>
            <AgentChip agent={entry.agent} compact />
          </Meta>
          <CodeBlock>
            <span className={styles.prompt}>▸</span> {entry.tool} {formatArgs(entry.args)}
          </CodeBlock>
        </li>
      );
    case 'tool.result':
      return (
        <li className={styles.item} data-testid="tool-result">
          <Meta entry={entry}>
            <AgentChip agent={entry.agent} compact />
          </Meta>
          {entry.status === 'error' ? (
            <CodeBlock error>
              <span className={styles.failed}>✕</span> {entry.summary}
            </CodeBlock>
          ) : entry.payload ? (
            <CodeBlock kind={entry.payload.type} content={entry.payload.content} />
          ) : (
            <CodeBlock>
              <span className={styles.prompt}>◂</span> {entry.summary}
            </CodeBlock>
          )}
        </li>
      );
    case 'message':
      return (
        <li className={`${styles.item} ${styles.message}`} data-testid="message">
          <Meta entry={entry}>
            <AgentChip agent={entry.from} compact />
            <ArrowRight size={14} aria-hidden className={styles.arrow} />
            <AgentChip agent={entry.to} compact />
          </Meta>
          <p className={styles.label}>{entry.label}</p>
        </li>
      );
  }
}
