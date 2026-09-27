import { parseClock } from '@night-shift/engine';
import { copy } from '../copy';
import { layoutLabels } from '../lib/lanes';
import { useApp } from '../state/store';
import { Dialog } from './Dialog';
import { IllustrativeTag } from './IllustrativeTag';
import styles from './SplitView.module.css';

/** Human vs agent timeline on a shared axis (SCENARIO §7, DESIGN §6). */
export function SplitView() {
  const open = useApp((s) => s.ui.splitOpen);
  const setUi = useApp((s) => s.setUi);
  const split = useApp((s) => s.bundle.scenario.splitView);
  const mitigate = useApp((s) => s.bundle.scenario.scorecard.find((r) => r.measure === 'Time to mitigate'));
  if (!open) return null;

  const from = parseClock(split.axis.from);
  const to = parseClock(split.axis.to);
  const pct = (clock: string) => ((parseClock(clock) - from) / (to - from)) * 100;
  const ticks = Array.from({ length: 7 }, (_, i) => from + i * 600);
  const lanes = [
    { key: 'manual', title: copy.split.manual, entries: split.manual, tone: styles.manual },
    { key: 'squad', title: copy.split.squad, entries: split.squad, tone: styles.squad },
  ];

  return (
    <Dialog label={copy.split.title} onClose={() => setUi({ splitOpen: false })} wide testId="split-view">
      <header className={styles.head}>
        <h2 className={styles.title}>{copy.split.title}</h2>
        <IllustrativeTag />
      </header>
      {mitigate && (
        <p className={styles.summary}>
          {copy.split.mitigate}: <strong className={styles.manualText}>{mitigate.manual}</strong> {copy.split.versus}{' '}
          <strong className={styles.squadText}>{mitigate.squad}</strong>
        </p>
      )}
      <div className={styles.chart}>
        {lanes.map((lane) => {
          const placed = layoutLabels(
            lane.entries.map((e) => ({ x: pct(e.clock), text: `${e.label} ${e.clock}` })),
            { charPct: 0.52, gapPct: 1 },
          );
          const rows = Math.max(1, ...placed.map((p) => p.row + 1));
          return (
            <section key={lane.key} className={`${styles.lane} ${lane.tone}`} aria-label={lane.title}>
              <h3 className={styles.laneTitle}>{lane.title}</h3>
              <div className={styles.track} style={{ height: rows * 46 + 28 }}>
                <span className={styles.axisLine} />
                {lane.entries.map((e, i) => {
                  const p = placed[i]!;
                  return (
                    <div key={e.label} className={styles.entry} style={{ left: `${p.x}%` }}>
                      <span className={styles.dot} />
                      <span className={styles.leader} style={{ height: 14 + p.row * 46 }} />
                      <span className={styles.label} style={{ top: 22 + p.row * 46 }}>
                        <span className={styles.labelText}>{e.label}</span>
                        <span className={`${styles.labelClock} mono`}>{e.clock}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
        <div className={styles.axis} aria-hidden>
          {ticks.map((t) => (
            <span key={t} className={`${styles.tick} mono`} style={{ left: `${((t - from) / (to - from)) * 100}%` }}>
              {String(Math.floor(t / 3600)).padStart(2, '0')}:{String(Math.floor((t % 3600) / 60)).padStart(2, '0')}
            </span>
          ))}
        </div>
      </div>
      <p className={styles.caption}>{split.caption}</p>
    </Dialog>
  );
}
