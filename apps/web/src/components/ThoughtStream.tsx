import { ArrowDown } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { copy } from '../copy';
import { useApp } from '../state/store';
import { StreamItem } from './StreamItem';
import styles from './ThoughtStream.module.css';

/** One stream for all agents; auto-scrolls unless the user scrolls up (DESIGN §6 SidePanel). */
export function ThoughtStream() {
  const stream = useApp((s) => s.snap.state.stream);
  const ref = useRef<HTMLOListElement>(null);
  const [pinned, setPinned] = useState(true);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < 24);
  };

  const scrollToEnd = () => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  useLayoutEffect(() => {
    if (pinned) scrollToEnd();
  }, [stream, pinned]);

  // Keep following while the latest line types in.
  useEffect(() => {
    if (!pinned) return;
    const id = window.setInterval(scrollToEnd, 200);
    return () => window.clearInterval(id);
  }, [pinned]);

  return (
    <>
      <ol ref={ref} className={styles.list} onScroll={onScroll} data-testid="stream">
        {stream.length === 0 && <li className={styles.empty}>{copy.panel.emptyStream}</li>}
        {stream.map((entry) => (
          <StreamItem key={entry.id} entry={entry} />
        ))}
      </ol>
      {!pinned && (
        <button
          type="button"
          className={styles.jump}
          onClick={() => {
            setPinned(true);
            scrollToEnd();
          }}
        >
          <ArrowDown size={14} aria-hidden /> {copy.panel.jumpToLatest}
        </button>
      )}
    </>
  );
}
