import { useMemo } from 'react';
import type { AgentId } from '@night-shift/engine';
import { controlPoint, easeMove, edgePoints, nodeCenter, quadPath, quadPoint, type Size } from '../lib/geometry';
import { AGENT_HUE } from '../lib/agents';
import { useApp } from '../state/store';
import styles from './PacketLayer.module.css';

const TRAVEL = 700;
const TRAIL = 400;
const HOLD_LABEL = 1400;
const FADE_IN_REDUCED = 120;

/** Messages travel between nodes as pills on a quadratic curve (DESIGN §6 Packet). */
export function PacketLayer({ size }: { size: Size }) {
  const t = useApp((s) => s.snap.t);
  const messages = useApp((s) => s.snap.state.messages);
  const agents = useApp((s) => s.bundle.agents.agents);
  const reduced = useApp((s) => s.ui.reducedMotion);
  // Node radii come from the layout tokens so packets leave from the disc edge.
  const radius = useMemo(() => {
    const css = getComputedStyle(document.documentElement);
    const md = parseFloat(css.getPropertyValue('--node')) || 88;
    const lg = parseFloat(css.getPropertyValue('--node-lg')) || 112;
    return new Map<AgentId, number>(agents.map((a) => [a.id, (a.size === 'lg' ? lg : md) / 2 + 6]));
  }, [agents, size.width]);
  if (size.width === 0) return null;

  const centres = new Map<AgentId, { x: number; y: number }>(agents.map((a) => [a.id, nodeCenter(a.position, size)]));
  const ends = (from: AgentId, to: AgentId) => {
    const a = centres.get(from);
    const b = centres.get(to);
    if (!a || !b) return null;
    return edgePoints(a, b, radius.get(from) ?? 50, radius.get(to) ?? 50);
  };
  const live = messages.filter((m) => {
    const age = t - m.t;
    const life = TRAVEL + (m.showLabel ? HOLD_LABEL : 0) + TRAIL;
    return age >= 0 && age <= life;
  });

  return (
    <>
      <svg className={styles.svg} width={size.width} height={size.height} aria-hidden data-testid="packet-trails">
        {!reduced &&
          live.map((m) => {
            const e = ends(m.from, m.to);
            if (!e) return null;
            const [a, b] = e;
            const c = controlPoint(a, b);
            const age = t - m.t;
            const k = easeMove(age / TRAVEL);
            const hold = m.showLabel ? HOLD_LABEL : 0;
            const fade = age <= TRAVEL + hold ? 1 : 1 - (age - TRAVEL - hold) / TRAIL;
            const d = quadPath(a, c, b);
            return (
              <path
                key={m.id}
                d={d}
                pathLength={1}
                className={styles.trail}
                style={{ stroke: AGENT_HUE[m.from], strokeDasharray: `${k} 1`, opacity: 0.55 * Math.max(0, fade) }}
              />
            );
          })}
      </svg>
      {live.map((m) => {
        const e = ends(m.from, m.to);
        if (!e) return null;
        const [a, b] = e;
        const age = t - m.t;
        const hold = m.showLabel ? HOLD_LABEL : 0;
        let p: { x: number; y: number } = b;
        let opacity = 1;
        if (reduced) {
          opacity = Math.min(1, age / FADE_IN_REDUCED);
        } else {
          p = quadPoint(a, controlPoint(a, b), b, easeMove(age / TRAVEL));
        }
        if (age > TRAVEL + hold) opacity = Math.max(0, 1 - (age - TRAVEL - hold) / TRAIL);
        return (
          <div
            key={m.id}
            className={`${styles.packet} ${m.showLabel ? styles.labelled : ''}`}
            style={{ left: p.x, top: p.y, background: AGENT_HUE[m.from], opacity }}
            data-testid="packet"
          >
            {m.showLabel ? m.label : null}
          </div>
        );
      })}
    </>
  );
}
