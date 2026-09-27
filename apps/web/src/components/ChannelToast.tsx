import { copy } from '../copy';
import { AGENT_HUE } from '../lib/agents';
import { useApp } from '../state/store';
import styles from './ChannelToast.module.css';

/** Playback ms a new channel post stays on the stage. */
const SHOW_MS = 4500;

/** The latest incident-channel post, briefly, unless the Channel tab is already open. */
export function ChannelToast() {
  const post = useApp((s) => {
    const last = s.snap.state.channel.at(-1);
    const gateOpen = s.snap.state.gate?.status === 'open';
    return last && s.snap.t - last.t < SHOW_MS && s.ui.tab !== 'channel' && !gateOpen ? last : null;
  });
  if (!post) return null;
  return (
    <div className={styles.toast} role="status" data-testid="channel-toast">
      <span className={styles.head}>
        <span className={styles.dot} style={post.agent ? { background: AGENT_HUE[post.agent] } : undefined} aria-hidden />
        {post.author}
        <span className={`${styles.where} mono`}>{copy.panel.channelName}</span>
      </span>
      <span className={styles.text}>{post.text}</span>
    </div>
  );
}
