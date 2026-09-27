import type { ReactNode } from 'react';
import type { PayloadType } from '@night-shift/engine';
import styles from './CodeBlock.module.css';

/** Machine output in mono (tool calls, log lines, diffs). Diff lines are tinted. */
export function CodeBlock({
  kind,
  content,
  error = false,
  children,
}: {
  kind?: PayloadType;
  content?: string;
  /** A failed tool call. */
  error?: boolean;
  children?: ReactNode;
}) {
  if (kind === 'diff' && content !== undefined) {
    return (
      <pre className={`${styles.block} ${styles.diff}`} data-testid="diff">
        {content.split('\n').map((line, i) => {
          const tone = line.startsWith('+++') || line.startsWith('---') ? styles.fileLine : line.startsWith('+') ? styles.add : line.startsWith('-') ? styles.del : '';
          return (
            <span key={i} className={`${styles.line} ${tone}`}>
              {line || ' '}
            </span>
          );
        })}
      </pre>
    );
  }
  return (
    <pre
      className={`${styles.block} ${kind === 'log' ? styles.log : ''} ${kind === 'table' ? styles.table : ''} ${error ? styles.error : ''}`}
      data-testid={error ? 'tool-error' : kind === 'log' ? 'log-line' : undefined}
    >
      {content ?? children}
    </pre>
  );
}
