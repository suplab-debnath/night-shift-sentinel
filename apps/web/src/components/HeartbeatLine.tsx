import { useRef } from 'react';
import { useAmbientMs } from '../hooks/useAmbientMs';
import { copy } from '../copy';
import { useElementSize } from '../hooks/useElementSize';
import { formatLatency, formatPercent } from '../lib/format';
import { axisMs, buildHeartbeat, noisyErrorRate } from '../lib/heartbeat';
import { metricValueAt } from '@night-shift/engine';
import { useApp } from '../state/store';
import styles from './HeartbeatLine.module.css';

/** The one bold element: p99 latency across the stage base (DESIGN §2, §6). */
export function HeartbeatLine() {
  const ref = useRef<HTMLDivElement>(null);
  const { width, height } = useElementSize(ref);
  const t = useApp((s) => s.snap.t);
  const endT = useApp((s) => s.snap.timeline.endT);
  const ended = useApp((s) => s.snap.status === 'ended');
  const metrics = useApp((s) => s.snap.state.metrics);
  const timelapse = useApp((s) => s.snap.state.timelapse);
  const slo = useApp((s) => s.bundle.scenario.slo);
  const reduced = useApp((s) => s.ui.reducedMotion);
  const waiting = useApp((s) => s.snap.status === 'awaitingGate');
  // The world keeps moving while a person decides (DECISIONS D-071).
  const drift = useAmbientMs(waiting && !reduced);

  const geo =
    width > 0
      ? buildHeartbeat({ track: metrics.p99, t, axis: axisMs(t, endT, ended), width, height, sloMs: slo.p99Ms, headDriftMs: drift })
      : null;
  const rawErrorRate = metricValueAt(metrics.errorRate, t);
  const errorRate = noisyErrorRate(rawErrorRate, t, drift);
  const errorsHigh = rawErrorRate > slo.errorRatePct;

  let lapse: { x: number; opacity: number } | null = null;
  if (geo && timelapse && t >= timelapse.t) {
    const k = reduced ? 1 : Math.min(1, (t - timelapse.t) / 600);
    lapse = { x: geo.xAt(timelapse.t) - 60 * (1 - k), opacity: k };
  }

  return (
    <div className={styles.band} ref={ref} data-testid="heartbeat">
      {geo && (
        <svg width={width} height={height} className={styles.svg} role="img" aria-label={`p99 latency ${formatLatency(geo.head.value)}`}>
          <line x1={0} x2={width} y1={geo.sloY} y2={geo.sloY} className={styles.slo} />
          {geo.runs.map((r, i) => (
            <path key={i} d={r.d} className={`${styles.path} ${styles[r.tone]}`} />
          ))}
          <circle cx={geo.head.x} cy={geo.head.y} r={4.5} className={`${styles.head} ${styles[geo.runs[geo.runs.length - 1]?.tone ?? 'neutral']}`} />
        </svg>
      )}
      {geo && (
        <>
          <span className={styles.sloLabel} style={{ top: geo.sloY }}>
            {copy.stage.slo(slo.p99Ms)}
          </span>
          <div className={styles.readout} style={{ left: Math.min(geo.head.x + 10, width - 150), top: Math.max(4, geo.head.y - 40) }}>
            <span className={`${styles.errors} ${errorsHigh ? styles.errorsHigh : styles.errorsOk}`} data-testid="error-chip">
              {copy.stage.errors(formatPercent(errorRate))}
            </span>
            <span className={`${styles.value} mono`} data-testid="latency">
              {formatLatency(geo.head.value)}
            </span>
          </div>
          {lapse && (
            <span className={styles.lapse} style={{ left: lapse.x, opacity: lapse.opacity }} data-testid="timelapse">
              {timelapse?.label}
            </span>
          )}
        </>
      )}
    </div>
  );
}
