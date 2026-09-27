import { copy } from '../copy';
import { ARTIFACT_CPS, visibleChars } from '../lib/typing';
import { useApp } from '../state/store';
import type { ArtifactView } from '@night-shift/engine';
import { Markdown } from './Markdown';
import styles from './PanelList.module.css';

function Artifact({ artifact }: { artifact: ArtifactView }) {
  const shown = useApp((s) =>
    visibleChars({
      length: artifact.markdown.length,
      elapsedMs: s.snap.t - artifact.t,
      speed: s.snap.speed,
      reducedMotion: s.ui.reducedMotion,
      typed: artifact.stream,
      cps: ARTIFACT_CPS,
      key: `${s.snap.take}:${artifact.artifactId}:${artifact.t}`,
    }),
  );
  return (
    <article className={styles.card} data-testid={`artifact-${artifact.artifactId}`}>
      <div className={styles.label}>{artifact.title}</div>
      <Markdown text={artifact.markdown.slice(0, shown)} />
    </article>
  );
}

export function ArtifactsTab() {
  const artifacts = useApp((s) => s.snap.state.artifacts);
  if (artifacts.length === 0) return <p className={styles.empty}>{copy.panel.emptyArtifacts}</p>;
  return (
    <div className={styles.list}>
      {[...artifacts].reverse().map((a) => (
        <Artifact key={a.artifactId} artifact={a} />
      ))}
    </div>
  );
}
