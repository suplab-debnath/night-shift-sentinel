// Visual identity per agent: hue + icon + name, never hue alone (DESIGN §3).
import type { AgentId } from '@night-shift/engine';
import { GitCompare, Network, NotebookPen, Radar, ScanSearch, ShieldCheck, UserRound, Wrench, type LucideIcon } from 'lucide-react';

export const AGENT_ICON: Record<AgentId, LucideIcon> = {
  sentinel: Radar,
  orchestrator: Network,
  'log-detective': ScanSearch,
  'code-archaeologist': GitCompare,
  fixer: Wrench,
  guardian: ShieldCheck,
  scribe: NotebookPen,
  human: UserRound,
};

export const AGENT_HUE: Record<AgentId, string> = {
  sentinel: 'var(--agent-sentinel)',
  orchestrator: 'var(--agent-orchestrator)',
  'log-detective': 'var(--agent-log)',
  'code-archaeologist': 'var(--agent-code)',
  fixer: 'var(--agent-fixer)',
  guardian: 'var(--agent-guardian)',
  scribe: 'var(--agent-scribe)',
  human: 'var(--ink)',
};

export const AGENT_WASH: Record<AgentId, string> = {
  sentinel: 'var(--agent-sentinel-wash)',
  orchestrator: 'var(--agent-orchestrator-wash)',
  'log-detective': 'var(--agent-log-wash)',
  'code-archaeologist': 'var(--agent-code-wash)',
  fixer: 'var(--agent-fixer-wash)',
  guardian: 'var(--agent-guardian-wash)',
  scribe: 'var(--agent-scribe-wash)',
  human: 'var(--ink-wash)',
};
