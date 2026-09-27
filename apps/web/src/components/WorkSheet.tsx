import { AnimatePresence, motion } from 'motion/react';
import { useApp } from '../state/store';
import { GuardrailChecklist } from './GuardrailChecklist';
import { OptionCards } from './OptionCards';
import styles from './WorkSheet.module.css';

/** Options and policy checks, in a sheet above the stage floor (Acts 4–5, Branch R, chaos). */
export function WorkSheet() {
  const state = useApp((s) => s.snap.state);
  const speed = useApp((s) => s.snap.speed);
  const reduced = useApp((s) => s.ui.reducedMotion);

  let content: React.ReactNode = null;
  let key = 'none';
  let chaos = false;
  if (state.overlay.active) {
    const start = state.overlay.startedAt ?? 0;
    const list = [...state.checklists].reverse().find((c) => c.t >= start);
    if (list) {
      key = `chaos-${list.id}-${start}`;
      chaos = true;
      content = <GuardrailChecklist list={list} speed={speed} />;
    }
  } else {
    const set = state.optionSets[state.optionSets.length - 1];
    const lastResolved = Math.max(-1, ...state.gates.map((g) => g.resolvedT ?? -1));
    if (set && set.t > lastResolved && (state.act === 4 || state.act === 5)) {
      const list = [...state.checklists].reverse().find((c) => c.t >= set.t);
      key = set.id;
      content = (
        <>
          <OptionCards set={set} />
          {list && <GuardrailChecklist list={list} speed={speed} />}
        </>
      );
    }
  }

  return (
    <AnimatePresence>
      {content && (
        <motion.div
          key={key}
          className={`${styles.sheet} ${chaos ? styles.chaos : ''}`}
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.32 / speed, ease: [0.2, 0.7, 0.2, 1] }}
          data-testid="work-sheet"
        >
          {content}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
