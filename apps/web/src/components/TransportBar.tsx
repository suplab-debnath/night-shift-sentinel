import { ChevronsLeft, Columns2, Pause, Play, SkipBack, SkipForward, Zap } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { copy } from '../copy';
import { SPEEDS } from '../lib/speeds';
import { useApp } from '../state/store';
import styles from './TransportBar.module.css';


/** Merge consecutive act marks with the same number (e.g. Act 5 spans the gate). */
function actSegments(acts: { n: number; name: string; t: number; endT: number; overlay: boolean }[]) {
  const out: { n: number; name: string; t: number; endT: number }[] = [];
  for (const a of acts) {
    if (a.overlay) continue;
    const last = out[out.length - 1];
    if (last && last.n === a.n) last.endT = Math.max(last.endT, a.endT);
    else out.push({ n: a.n, name: a.name, t: a.t, endT: a.endT });
  }
  return out;
}

export function TransportBar() {
  const { t, playing, speed, endT, status, canChaos, currentAct } = useApp(
    useShallow((s) => ({
      t: s.snap.t,
      playing: s.snap.playing,
      speed: s.snap.speed,
      endT: s.snap.timeline.endT,
      status: s.snap.status,
      canChaos: s.snap.canChaos,
      currentAct: s.snap.currentAct,
    })),
  );
  const acts = useApp((s) => s.snap.timeline.acts);
  const chaosWindows = useApp((s) => s.snap.timeline.chaosWindows);
  const gatePoints = useApp((s) => s.snap.timeline.gatePoints);
  const source = useApp((s) => s.source);
  const setUi = useApp((s) => s.setUi);
  const presenter = useApp((s) => s.ui.presenter);
  const segments = actSegments(acts);
  const total = Math.max(endT, 1);
  const isPlaying = playing && status === 'playing';

  const previousAct = () => {
    const current = [...segments].reverse().find((a) => a.t <= t);
    if (!current) return source.seek(0);
    const idx = segments.indexOf(current);
    const target = t - current.t < 1500 && idx > 0 ? segments[idx - 1]! : current;
    source.seek(target.t);
  };

  return (
    <footer className={styles.bar}>
      <div className={styles.group}>
        <button type="button" className={styles.icon} onClick={previousAct} aria-label={copy.transport.previousAct} title={copy.transport.previousAct}>
          <ChevronsLeft size={20} />
        </button>
        <button type="button" className={styles.icon} onClick={() => source.stepBack()} aria-label={copy.transport.stepBack} title={copy.transport.stepBack}>
          <SkipBack size={18} />
        </button>
        <button
          type="button"
          className={`${styles.icon} ${styles.play}`}
          onClick={() => source.togglePlay()}
          aria-label={isPlaying ? copy.transport.pause : copy.transport.play}
          data-testid="play"
        >
          {isPlaying ? <Pause size={22} /> : <Play size={22} />}
        </button>
        <button type="button" className={styles.icon} onClick={() => source.stepForward()} aria-label={copy.transport.stepForward} title={copy.transport.stepForward}>
          <SkipForward size={18} />
        </button>
      </div>

      <div className={styles.speeds} role="radiogroup" aria-label={copy.transport.speed}>
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={speed === s}
            className={styles.speed}
            onClick={() => source.setSpeed(s)}
          >
            {s}×
          </button>
        ))}
      </div>

      <div className={styles.scrubber}>
        <div className={styles.track} aria-hidden>
          {segments.map((a) => (
            <button
              key={`${a.n}-${a.t}`}
              type="button"
              tabIndex={-1}
              className={styles.segment}
              data-current={a.n === currentAct || undefined}
              data-narrow={(a.endT - a.t) / total < 0.03 || undefined}
              style={{ left: `${(a.t / total) * 100}%`, width: `${((a.endT - a.t) / total) * 100}%` }}
              title={`${a.n} ${a.name}`}
              onClick={() => source.seek(a.t)}
            >
              <span className={styles.segNum}>{a.n}</span>
              <span className={styles.segName} data-show={presenter || undefined}>
                {a.name}
              </span>
            </button>
          ))}
          {chaosWindows.map((w) => (
            <span key={w.start} className={styles.chaosMark} style={{ left: `${(w.start / total) * 100}%`, width: `${((w.end - w.start) / total) * 100}%` }} />
          ))}
          <span className={styles.progress} style={{ width: `${(t / total) * 100}%` }} />
          {gatePoints.map((g) => (
            <span
              key={g.gateId}
              className={styles.gateMark}
              style={{ left: `clamp(10px, ${(g.requestT / total) * 100}%, calc(100% - 10px))` }}
              title={`Gate ${g.gateId}`}
            />
          ))}
        </div>
        <input
          type="range"
          className={styles.range}
          min={0}
          max={total}
          step={100}
          value={Math.min(t, total)}
          onChange={(e) => source.seek(Number(e.target.value))}
          aria-label={copy.transport.scrubber}
          aria-valuetext={`Act ${currentAct}`}
          data-testid="scrubber"
        />
      </div>

      <div className={styles.group}>
        <button type="button" className={styles.text} onClick={() => setUi({ splitOpen: true })} data-testid="split-button">
          <Columns2 size={18} aria-hidden /> {copy.transport.split}
        </button>
        <button type="button" className={styles.text} onClick={() => source.triggerChaos()} disabled={!canChaos} data-testid="chaos-button">
          <Zap size={18} aria-hidden /> {copy.transport.chaos}
        </button>
      </div>
    </footer>
  );
}
