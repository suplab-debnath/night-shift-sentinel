import { presenterNote } from '../presenterNotes';
import { useApp } from '../state/store';
import styles from './PresenterNotes.module.css';

/** Small notes strip for the presenter (DESIGN §11); toggle with N. */
export function PresenterNotes() {
  const visible = useApp((s) => s.ui.presenter && s.ui.notes);
  const note = useApp((s) => presenterNote(s.snap, s.ui.splitOpen));
  if (!visible || !note) return null;
  return (
    <aside className={styles.strip} aria-label="Presenter notes" data-testid="presenter-notes">
      <span className={styles.say}>Say</span>
      <span>{note}</span>
    </aside>
  );
}
