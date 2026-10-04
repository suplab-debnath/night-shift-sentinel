import { Download, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useMemo } from 'react';
import { auditChain, verifyAuditChain, type ActMark, type ChainedAuditRow } from '@night-shift/engine';
import { copy } from '../copy';
import { useApp } from '../state/store';
import { AgentChip } from './AgentChip';
import styles from './PanelList.module.css';

const SEVERITY = { info: '', warn: styles.warn, high: styles.high } as const;

interface Stage {
  key: string;
  label: string;
  whatIf: boolean;
  links: ChainedAuditRow[];
}

function stageName(acts: readonly ActMark[], n: number): string {
  return copy.audit.stageNames[n] ?? acts.find((a) => !a.overlay && a.n === n)?.name ?? '';
}

/** Rows grouped by act; each what-if test run is its own group. Groups in order of first record. */
export function groupByStage(chain: readonly ChainedAuditRow[], acts: readonly ActMark[]): Stage[] {
  const stages: Stage[] = [];
  const byAct = new Map<number, Stage>();
  let overlayRun: Stage | null = null;
  for (const link of chain) {
    const { row } = link;
    if (row.overlayName) {
      // A run of consecutive rows from the same test is one group; a later run is a new group.
      if (!overlayRun || !overlayRun.key.startsWith(`o:${row.overlayName}:`)) {
        overlayRun = { key: `o:${row.overlayName}:${stages.length}`, label: copy.audit.overlay[row.overlayName] ?? copy.audit.whatIf, whatIf: true, links: [] };
        stages.push(overlayRun);
      }
      overlayRun.links.push(link);
      continue;
    }
    overlayRun = null;
    let stage = byAct.get(row.act);
    if (!stage) {
      stage = { key: `a:${row.act}`, label: copy.audit.stage(row.act, stageName(acts, row.act)), whatIf: false, links: [] };
      byAct.set(row.act, stage);
      stages.push(stage);
    }
    stage.links.push(link);
  }
  return stages;
}

function count(links: readonly ChainedAuditRow[]): string {
  const c = (cat: string) => links.filter((l) => l.row.category === cat).length;
  return copy.audit.counts(c('tool'), c('policy'), c('evidence'), c('decision') + c('gate'));
}

/** Every tool call, policy check, piece of evidence, decision, and record, by stage, hash-chained (D-079). */
export function AuditTab() {
  const audit = useApp((s) => s.snap.state.audit);
  const acts = useApp((s) => s.snap.timeline.acts);
  const take = useApp((s) => s.snap.take);
  const scenarioId = useApp((s) => s.bundle.scenario.id);
  const chain = useMemo(() => auditChain(audit), [audit]);
  const verified = useMemo(() => verifyAuditChain(chain), [chain]);
  const stages = useMemo(() => groupByStage(chain, acts), [chain, acts]);

  if (audit.length === 0) return <p className={styles.empty}>{copy.panel.emptyAudit}</p>;

  const exportEvidence = () => {
    const doc = {
      kind: 'night-shift-audit',
      version: 1,
      scenario: scenarioId,
      take,
      chain: { algorithm: 'fnv1a-64, chained (illustrative; production anchors it in an append-only store)', verified },
      stages: stages.map((st) => ({
        stage: st.label,
        whatIf: st.whatIf,
        records: st.links.map(({ row, prev, hash }) => ({
          id: row.id,
          clock: row.clock,
          act: row.act,
          beat: row.beat,
          category: row.category,
          severity: row.severity,
          agent: row.agent,
          text: row.text,
          ...(row.result ? { result: row.result } : {}),
          source: row.source,
          prev,
          hash,
        })),
      })),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `night-shift-audit-${scenarioId}-take${take}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className={styles.auditWrap}>
      <div className={styles.auditBar} data-testid="audit-chain" data-verified={verified || undefined}>
        <span className={verified ? styles.chainOk : styles.chainBad}>
          {verified ? <ShieldCheck size={16} aria-hidden /> : <ShieldAlert size={16} aria-hidden />}
          {verified ? copy.audit.verified(chain.length) : copy.audit.broken}
        </span>
        <button type="button" className={styles.exportButton} onClick={exportEvidence} title={copy.audit.exportHint} data-testid="audit-export">
          <Download size={14} aria-hidden /> {copy.audit.export}
        </button>
      </div>
      <div className={styles.list} data-testid="audit">
        {[...stages].reverse().map((st) => (
          <section key={st.key} className={`${styles.stage} ${st.whatIf ? styles.whatIf : ''}`} data-testid="audit-stage">
            <header className={styles.stageHead}>
              <h3 className={styles.stageTitle}>{st.label}</h3>
              <span className={styles.meta}>{count(st.links)}</span>
            </header>
            <ol className={styles.stageRows}>
              {st.links.map(({ row, hash }) => (
                <li key={row.id} className={`${styles.row} ${SEVERITY[row.severity]}`}>
                  <div className={styles.rowHead}>
                    <time className={`${styles.meta} mono`}>{row.clock}</time>
                    {row.agent && <AgentChip agent={row.agent} compact />}
                    <span className={styles.category}>{row.category}</span>
                  </div>
                  <p className={`${styles.text} ${row.category === 'tool' ? 'mono' : ''}`}>{row.text}</p>
                  {row.result && (
                    <p className={`${styles.result} ${row.result.status === 'error' ? styles.resultError : ''}`}>
                      <span className={styles.resultLabel}>{copy.audit.result}</span> {row.result.summary}
                    </p>
                  )}
                  <span className={`${styles.hash} mono`} title={copy.audit.hash}>
                    #{hash.slice(0, 12)}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}
