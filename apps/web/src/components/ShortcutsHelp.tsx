import { copy } from '../copy';
import { SHORTCUT_HELP } from '../shortcuts';
import { useApp } from '../state/store';
import { Dialog } from './Dialog';
import styles from './ShortcutsHelp.module.css';

export function ShortcutsHelp() {
  const open = useApp((s) => s.ui.shortcutsOpen);
  const setUi = useApp((s) => s.setUi);
  if (!open) return null;
  return (
    <Dialog label={copy.shortcuts.title} onClose={() => setUi({ shortcutsOpen: false })} testId="shortcuts">
      <h2 className={styles.title}>{copy.shortcuts.title}</h2>
      <dl className={styles.list}>
        {SHORTCUT_HELP.map((r) => (
          <div key={r.keys} className={styles.row}>
            <dt>
              <kbd className="mono">{r.keys}</kbd>
            </dt>
            <dd>{r.action}</dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}
