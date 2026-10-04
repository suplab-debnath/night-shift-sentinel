import { AnimatePresence, motion } from 'motion/react';
import { CircleCheck, Hand, Radar, Search, ShieldX } from 'lucide-react';
import { useMemo } from 'react';
import { activeMoment } from '../lib/moments';
import { useApp } from '../state/store';
import styles from './MomentBanner.module.css';

const ICON = { radar: Radar, search: Search, check: CircleCheck, shield: ShieldX, hand: Hand } as const;

/** The big moments of the night, briefly, in the stage's bottom-right lane (D-080). */
export function MomentBanner() {
  const scenario = useApp((s) => s.bundle.scenario);
  const timeline = useApp((s) => s.snap.timeline);
  const state = useApp((s) => s.snap.state);
  const t = useApp((s) => s.snap.t);
  // Select stable inputs and derive here: a selector that builds a new object loops (zustand v5).
  const active = useMemo(() => activeMoment(scenario.moments, scenario.milestones, timeline, state, t), [scenario, timeline, state, t]);
  const reduced = useApp((s) => s.ui.reducedMotion);
  const speed = useApp((s) => s.snap.speed);
  const Icon = active ? ICON[active.moment.icon] : null;
  return (
    <AnimatePresence>
      {active && Icon && (
        <motion.div
          key={active.key}
          className={styles.banner}
          data-tone={active.moment.tone}
          role="status"
          data-testid="moment-banner"
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.36 / speed, ease: [0.2, 0.7, 0.2, 1] }}
        >
          <span className={styles.icon} aria-hidden>
            <Icon size={22} strokeWidth={2.2} />
          </span>
          <span className={styles.body}>
            <span className={styles.title}>{active.title}</span>
            {active.sub && <span className={styles.sub}>{active.sub}</span>}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
