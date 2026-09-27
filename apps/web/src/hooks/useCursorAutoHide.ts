import { useEffect } from 'react';

const IDLE_MS = 2000;

/** Presenter mode hides the cursor after 2 s without movement (DESIGN §11). */
export function useCursorAutoHide(enabled: boolean) {
  useEffect(() => {
    const root = document.documentElement;
    if (!enabled) {
      delete root.dataset.cursorHidden;
      return;
    }
    let timer = window.setTimeout(() => (root.dataset.cursorHidden = 'true'), IDLE_MS);
    const onMove = () => {
      delete root.dataset.cursorHidden;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => (root.dataset.cursorHidden = 'true'), IDLE_MS);
    };
    window.addEventListener('pointermove', onMove);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointermove', onMove);
      delete root.dataset.cursorHidden;
    };
  }, [enabled]);
}
