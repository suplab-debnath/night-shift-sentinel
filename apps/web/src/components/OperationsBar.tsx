import { Check, Columns2, Hand, Play, Zap } from 'lucide-react';
import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { copy } from '../copy';
import { useWallNow } from '../hooks/useWallNow';
import { impactSec, liveClockSec, milestoneViews, mmss, reachedT } from '../lib/runclock';
import { useApp } from '../state/store';
import styles from './OperationsBar.module.css';

/** Start, pause the squad, resume: what an operator does, not a media player (D-075). */
function PrimaryControl() {
  const s = useApp(
    useShallow((st) => ({
      t: st.snap.t,
      playing: st.snap.playing,
      status: st.snap.status,
      squad: st.snap.clockHold?.kind === 'squad',
      frozen: st.snap.frozen,
      ended: st.snap.state.endCard !== null || st.snap.status === 'ended',
    })),
  );
  const source = useApp((st) => st.source);
  let label: string = copy.ops.pauseSquad;
  let Icon = Hand;
  let onClick = () => source.toggleSquad();
  let disabled = false;
  if (s.ended) {
    label = copy.ops.done;
    Icon = Check;
    disabled = true;
  } else if (s.status === 'awaitingGate') {
    label = copy.ops.waiting;
    disabled = true;
  } else if (s.squad) {
    label = copy.ops.resumeSquad;
    Icon = Play;
  } else if (s.frozen) {
    label = copy.ops.resume;
    Icon = Play;
    onClick = () => source.toggleFreeze();
  } else if (!s.playing) {
    label = copy.ops.start;
    Icon = Play;
  }
  return (
    <button
      type="button"
      className={`${styles.primary} ${s.squad ? styles.resume : ''}`}
      onClick={onClick}
      disabled={disabled}
      data-testid="play"
      data-state={s.ended ? 'done' : s.status === 'awaitingGate' ? 'waiting' : s.squad ? 'squad-paused' : s.playing ? 'running' : 'stopped'}
    >
      <Icon size={18} aria-hidden /> {label}
    </button>
  );
}

/** Detected → Resolved, each with its run-clock time once reached (D-075). */
function MilestoneTrack() {
  const milestones = useApp((s) => s.bundle.scenario.milestones);
  const timeline = useApp((s) => s.snap.timeline);
  // Re-derive only when a milestone is crossed, not on every frame.
  const reached = useApp((s) => milestoneViews(milestones, s.snap.timeline, s.snap.t).filter((v) => v.state === 'done').length);
  const views = useMemo(() => milestoneViews(milestones, timeline, reachedT(milestones, timeline, reached)), [milestones, timeline, reached]);
  const handed = useApp((s) => s.snap.state.severity === 'Handed to humans');
  return (
    <ol className={styles.track} aria-label={copy.ops.milestones} data-testid="milestones">
      {views.map((m) => (
        <li key={m.id} className={styles.milestone} data-state={handed && m.state !== 'done' ? 'stopped' : m.state} data-testid={`milestone-${m.id}`}>
          <span className={styles.dot} aria-hidden />
          <span className={styles.label}>{m.label}</span>
          <time className={`${styles.time} mono`}>{m.clock ?? '—'}</time>
        </li>
      ))}
    </ol>
  );
}

/** Customer impact since the first errors, stopping when errors stop. */
function ImpactCounter() {
  const impact = useApp((s) => s.bundle.scenario.impact);
  const { timeline, t, clock, hold, speed } = useApp(
    useShallow((s) => ({ timeline: s.snap.timeline, t: s.snap.t, clock: s.snap.clock, hold: s.snap.clockHold, speed: s.snap.speed })),
  );
  const now = useWallNow(hold !== null, 500);
  const v = impactSec(impact, timeline, t, liveClockSec(clock, hold, speed, now));
  if (!v) return null;
  return (
    <div className={styles.impact} data-over={v.over || undefined} data-testid="impact">
      <span className={styles.impactLabel}>{copy.ops.impact}</span>
      <span className={`${styles.impactValue} mono`}>{mmss(v.sec)}</span>
    </div>
  );
}

export function OperationsBar() {
  const canChaos = useApp((s) => s.snap.canChaos);
  const source = useApp((s) => s.source);
  const setUi = useApp((s) => s.setUi);
  return (
    <footer className={styles.bar}>
      <PrimaryControl />
      <MilestoneTrack />
      <ImpactCounter />
      <div className={styles.group}>
        <button type="button" className={styles.text} onClick={() => setUi({ splitOpen: true })} data-testid="split-button">
          <Columns2 size={18} aria-hidden /> {copy.ops.compare}
        </button>
        <button type="button" className={styles.text} onClick={() => source.triggerChaos()} disabled={!canChaos} data-testid="chaos-button">
          <Zap size={18} aria-hidden /> {copy.ops.badIdea}
        </button>
      </div>
    </footer>
  );
}
