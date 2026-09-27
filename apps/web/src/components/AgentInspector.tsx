import { useApp } from '../state/store';
import { copy } from '../copy';
import { AGENT_HUE, AGENT_ICON, AGENT_WASH } from '../lib/agents';
import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import styles from './AgentInspector.module.css';

const ACCESS = { read: copy.inspector.read, write: copy.inspector.write, approval: copy.inspector.approval } as const;

/** Role, tools with access level, what needs approval, what is never allowed (SCENARIO §2). */
export function AgentInspector() {
  const id = useApp((s) => s.ui.inspector);
  const agent = useApp((s) => (s.ui.inspector ? s.bundle.agentById(s.ui.inspector) : undefined));
  const state = useApp((s) => (s.ui.inspector ? s.snap.state.agents[s.ui.inspector] : undefined));
  const setUi = useApp((s) => s.setUi);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;
    ref.current?.focus({ preventScroll: true });
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (ref.current?.contains(t) || t.closest('[data-agent]')) return;
      setUi({ inspector: null });
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [id, setUi]);

  if (!id || !agent) return null;
  const Icon = AGENT_ICON[agent.id];
  const right = agent.position.x < 60;
  const style = {
    left: right ? `calc(${agent.position.x}% + var(--node) / 2 + 20px)` : undefined,
    right: right ? undefined : `calc(${100 - agent.position.x}% + var(--node) / 2 + 20px)`,
    // Anchor to the stage edge nearest the agent's row so the popover never leaves the stage.
    top: agent.position.y <= 50 ? '12px' : undefined,
    bottom: agent.position.y > 50 ? '12px' : undefined,
  };
  return (
    <div
      ref={ref}
      className={styles.popover}
      style={style}
      role="dialog"
      aria-label={`${agent.name} ${copy.inspector.suffix}`}
      tabIndex={-1}
      data-testid="inspector"
    >
      <button type="button" className={styles.close} onClick={() => setUi({ inspector: null })} aria-label={copy.inspector.close}>
        <X size={18} />
      </button>
      <header className={styles.head} style={{ '--hue': AGENT_HUE[agent.id], '--wash': AGENT_WASH[agent.id] } as React.CSSProperties}>
        <span className={styles.icon}>
          <Icon size={26} strokeWidth={1.75} aria-hidden />
        </span>
        <div>
          <h2 className={styles.name}>{agent.name}</h2>
          <p className={styles.role}>{agent.role}</p>
        </div>
        {state && <span className={styles.state}>{state}</span>}
      </header>
      {agent.tools.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.heading}>{copy.inspector.tools}</h3>
          <ul className={styles.tools}>
            {agent.tools.map((t) => (
              <li key={t.name}>
                <span className="mono">{t.name}</span>
                <span className={`${styles.chip} ${styles[t.access]}`}>{ACCESS[t.access]}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {agent.needsApprovalFor.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.heading}>{copy.inspector.needsApproval}</h3>
          <ul className={styles.list}>
            {agent.needsApprovalFor.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </section>
      )}
      {agent.neverAllowed.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.heading}>{copy.inspector.neverAllowed}</h3>
          <ul className={styles.list}>
            {agent.neverAllowed.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
