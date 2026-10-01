import { Check, ShieldAlert } from 'lucide-react';
import type { AgentDef } from '@night-shift/engine';
import { isUnfilled } from '@night-shift/engine';
import { brand } from '../config';
import { copy } from '../copy';
import { AGENT_HUE, AGENT_ICON, AGENT_WASH } from '../lib/agents';
import { useApp } from '../state/store';
import { pendingThought } from '../lib/pending';
import styles from './AgentNode.module.css';

export function AgentNode({ agent }: { agent: AgentDef }) {
  const state = useApp((s) => s.snap.state.agents[agent.id]);
  const thinking = useApp((s) => pendingThought(s.snap.timeline, s.snap.state.stream, s.snap.t, s.snap.speed)?.agent === agent.id);
  const changedAt = useApp((s) => s.snap.state.agentChangedAt[agent.id]);
  const presenter = useApp((s) => s.ui.presenter);
  const setUi = useApp((s) => s.setUi);
  const inspected = useApp((s) => s.ui.inspector === agent.id);
  const Icon = AGENT_ICON[agent.id];
  const isHuman = agent.id === 'human';
  const label = isHuman
    ? presenter
      ? isUnfilled(brand.presenterName)
        ? brand.humanSeatLabel || copy.stage.you
        : brand.presenterName
      : agent.name
    : agent.name;

  return (
    <button
      type="button"
      className={styles.node}
      data-state={state}
      data-agent={agent.id}
      data-size={agent.size}
      data-human={isHuman || undefined}
      aria-pressed={inspected}
      aria-label={`${label}, ${state}`}
      style={
        {
          left: `${agent.position.x}%`,
          top: `${agent.position.y}%`,
          '--hue': AGENT_HUE[agent.id],
          '--wash': AGENT_WASH[agent.id],
        } as React.CSSProperties
      }
      onClick={() => setUi({ inspector: inspected ? null : agent.id })}
    >
      <span className={styles.disc} key={state === 'blocked' ? `b${changedAt}` : 'disc'}>
        <span className={styles.ring} aria-hidden />
        {state === 'working' && <span className={styles.orbit} aria-hidden />}
        {state === 'watching' && <span className={styles.sweep} aria-hidden />}
        <Icon className={styles.icon} aria-hidden strokeWidth={1.75} />
        {state === 'done' && (
          <span className={`${styles.badge} ${styles.done}`} aria-hidden>
            <Check size={14} strokeWidth={3} />
          </span>
        )}
        {state === 'blocked' && (
          <span className={`${styles.badge} ${styles.blocked}`} aria-hidden>
            <ShieldAlert size={14} strokeWidth={2.5} />
          </span>
        )}
      </span>
      {thinking && (
        <span className={styles.thought} aria-hidden data-testid="thinking-bubble">
          <span />
          <span />
          <span />
        </span>
      )}
      <span className={styles.name}>{label}</span>
    </button>
  );
}
