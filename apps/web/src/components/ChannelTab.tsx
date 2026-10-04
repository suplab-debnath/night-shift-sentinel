import { useEffect, useRef } from 'react';
import { copy } from '../copy';
import { AGENT_HUE, AGENT_ICON, AGENT_WASH } from '../lib/agents';
import { useApp } from '../state/store';
import styles from './PanelList.module.css';

/** The incident channel: status posts, the pager, and people around the incident. */
export function ChannelTab() {
  const posts = useApp((s) => s.snap.state.channel);
  const channel = useApp((s) => s.bundle.scenario.display.channel);
  const end = useRef<HTMLLIElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'end' });
  }, [posts.length]);
  if (posts.length === 0) return <p className={styles.empty}>{copy.panel.emptyChannel}</p>;
  return (
    <>
      <p className={styles.channelName}>{channel}</p>
      <ol className={styles.list} aria-label={channel} data-testid="channel">
        {posts.map((p, i) => {
          const Icon = p.agent ? AGENT_ICON[p.agent] : null;
          return (
            <li key={p.id} className={styles.post} ref={i === posts.length - 1 ? end : undefined} data-testid="channel-post">
              <span
                className={styles.avatar}
                style={p.agent ? { background: AGENT_WASH[p.agent], color: AGENT_HUE[p.agent] } : undefined}
                aria-hidden
              >
                {Icon ? <Icon size={16} /> : p.author.slice(0, 1)}
              </span>
              <span className={styles.postHead}>
                {p.author}
                {p.clock && <time className={`${styles.meta} mono`}>{p.clock}</time>}
              </span>
              <p className={styles.text}>{p.text}</p>
            </li>
          );
        })}
      </ol>
    </>
  );
}
