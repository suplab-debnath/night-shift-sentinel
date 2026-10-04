import { Fragment, type ReactNode } from 'react';
import styles from './Markdown.module.css';

/** Tiny renderer for the artifact texts: **bold**, "- [ ]" checklists, headings, paragraphs. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>,
  );
}

const HEADING = /^(Summary|Timeline|What went well|What we will change.*|Why|Changes|Checks.*|Guidelines applied|Review)$/;
const FIELD = /^(Title|Status|Severity|Duration|Impact[^:]*|Branch|Author):\s/;

export function Markdown({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <div className={styles.md}>
      {lines.map((line, i) => {
        const check = /^- \[( |x)\] (.*)$/.exec(line);
        if (check) {
          return (
            <div key={i} className={styles.check} data-done={check[1] === 'x' || undefined}>
              <span className={styles.box} aria-hidden>
                {check[1] === 'x' ? '✓' : ''}
              </span>
              {inline(check[2]!)}
            </div>
          );
        }
        if (line.trim() === '') return <div key={i} className={styles.gap} />;
        if (HEADING.test(line)) return <h4 key={i} className={styles.heading}>{line}</h4>;
        const field = FIELD.exec(line);
        if (field) {
          return (
            <p key={i} className={styles.line}>
              <span className={styles.field}>{field[0]}</span>
              {line.slice(field[0].length)}
            </p>
          );
        }
        return (
          <p key={i} className={styles.line}>
            {inline(line)}
          </p>
        );
      })}
    </div>
  );
}
