import { AnimatePresence, motion } from 'motion/react';
import { useApp } from '../state/store';
import { GateSheet } from './GateSheet';
import styles from './GateLayer.module.css';

/** Dims the stage (except the human seat) and raises the gate sheet (SCENARIO §4 Act 5). */
export function GateLayer() {
  const gate = useApp((s) => (s.snap.state.gate?.status === 'open' && !s.snap.state.overlay.active ? s.snap.state.gate : null));
  const speed = useApp((s) => s.snap.speed);
  const reduced = useApp((s) => s.ui.reducedMotion);
  const d = 0.32 / speed;
  return (
    <AnimatePresence>
      {gate && (
        <motion.div key={`dim-${gate.gateId}`} className={styles.dim} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: d }} />
      )}
      {gate && (
        <motion.div
          key={`sheet-${gate.gateId}`}
          className={styles.sheetWrap}
          initial={reduced ? { opacity: 0 } : { y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={reduced ? { opacity: 0 } : { y: '100%', opacity: 0 }}
          transition={{ duration: d, ease: [0.2, 0.7, 0.2, 1] }}
        >
          <GateSheet gate={gate} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
