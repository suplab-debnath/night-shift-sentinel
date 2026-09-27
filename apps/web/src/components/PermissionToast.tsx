import { copy } from '../copy';
import { useApp } from '../state/store';
import styles from './PermissionToast.module.css';

/** Anchored to the agent that was denied: the second layer of defence. */
export function PermissionToast() {
  const denied = useApp((s) => (s.snap.state.overlay.active ? s.snap.state.permissionDenied : null));
  const agent = useApp((s) => (denied ? s.bundle.agentById(denied.agent) : undefined));
  if (!denied || !agent) return null;
  return (
    <div
      className={styles.toast}
      role="alert"
      style={{ left: `${agent.position.x}%`, top: `calc(${agent.position.y}% - var(--node) / 2 - 16px)` }}
      data-testid="permission-toast"
    >
      <span className="mono">{copy.chaos.notGranted(denied.tool, agent.name)}</span>
    </div>
  );
}
