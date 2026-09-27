import type { AgentId } from '@night-shift/engine';
import { AGENT_HUE, AGENT_ICON, AGENT_WASH } from '../lib/agents';
import { useApp } from '../state/store';
import styles from './AgentChip.module.css';

/** Hue wash + icon + name: agents are never identified by colour alone. */
export function AgentChip({ agent, compact = false }: { agent: AgentId; compact?: boolean }) {
  const name = useApp((s) => s.bundle.agentById(agent)?.name ?? agent);
  const Icon = AGENT_ICON[agent];
  return (
    <span className={`${styles.chip} ${compact ? styles.compact : ''}`} style={{ background: AGENT_WASH[agent], color: AGENT_HUE[agent] }}>
      <Icon size={14} strokeWidth={2} aria-hidden />
      <span className={styles.name}>{name}</span>
    </span>
  );
}
