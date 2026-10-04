import { ChevronDown, ChevronUp } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { GateView } from '@night-shift/engine';
import { copy } from '../copy';
import { useAmbientMs } from '../hooks/useAmbientMs';
import { useApp } from '../state/store';
import { GuardrailChecklist } from './GuardrailChecklist';
import styles from './GateSheet.module.css';

export function GateSheet({ gate }: { gate: GateView }) {
  const source = useApp((s) => s.source);
  const changeRefs = useApp((s) => s.bundle.scenario.display.changeRefs);
  const conclusion = useApp((s) => s.snap.state.evidence.conclusion);
  const checklists = useApp((s) => s.snap.state.checklists);
  const [open, setOpen] = useState(false);
  const waited = Math.floor(useAmbientMs(gate.status === 'open', 1000) / 1000);
  const ref = useRef<HTMLDivElement>(null);
  const approveRef = useRef<HTMLButtonElement>(null);

  const checklistId = gate.evidenceRefs.find((r) => r.startsWith('checklist:'))?.slice('checklist:'.length);
  const checklist = checklists.find((c) => c.id === checklistId);

  useEffect(() => {
    approveRef.current?.focus();
  }, [gate.gateId]);

  // Focus trap; Esc does nothing because a decision is required (DESIGN §6).
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (e.key !== 'Tab' || !ref.current) return;
    const focusable = [...ref.current.querySelectorAll<HTMLElement>('button:not([disabled])')];
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      ref={ref}
      className={styles.sheet}
      role="dialog"
      aria-modal="true"
      aria-labelledby="gate-title"
      aria-describedby="gate-summary"
      onKeyDown={onKeyDown}
      data-testid="gate-sheet"
    >
      <p className={styles.eyebrow}>
        <span className="mono">{changeRefs[gate.gateId] ?? copy.gate.reference(gate.gateId)}</span>
        <span>{copy.gate.kind}</span>
        <span>{copy.gate.paged}</span>
        <span className="mono" data-testid="gate-waiting">
          {copy.gate.waiting(waited)}
        </span>
      </p>
      <h2 id="gate-title" className={styles.title}>
        {gate.title}
      </h2>
      <p id="gate-summary" className={styles.summary}>
        {gate.summary}
      </p>
      <button type="button" className={styles.toggle} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {open ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
        {open ? copy.gate.hideEvidence : copy.gate.showEvidence}
      </button>
      {open && (
        <div className={styles.evidence}>
          {conclusion && gate.evidenceRefs.includes('root-cause') && (
            <div className={styles.root}>
              <span className={styles.rootLabel}>{copy.panel.rootCause}</span>
              <span>{conclusion.text}</span>
              <span className="mono">
                {copy.panel.confidence} {conclusion.confidence.toFixed(2)}
              </span>
            </div>
          )}
          {checklist && <GuardrailChecklist list={checklist} />}
        </div>
      )}
      <div className={styles.actions}>
        <button
          ref={approveRef}
          type="button"
          className={styles.primary}
          onClick={() => source.decide(gate.gateId, 'approved')}
          data-testid="gate-approve"
        >
          {gate.approveLabel}
        </button>
        <button type="button" className={styles.secondary} onClick={() => source.decide(gate.gateId, 'rejected')} data-testid="gate-reject">
          {gate.rejectLabel}
        </button>
      </div>
      {gate.footer.length > 0 && (
        <footer className={styles.footer}>
          {gate.footer.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </footer>
      )}
    </div>
  );
}
