import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import styles from './Dialog.module.css';

/** Modal overlay with focus handling; Esc is handled by the global shortcut map. */
export function Dialog({
  label,
  onClose,
  children,
  wide = false,
  testId,
}: {
  label: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  testId?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus({ preventScroll: true });
    return () => previous?.focus?.();
  }, []);
  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div
        ref={ref}
        className={`${styles.dialog} ${wide ? styles.wide : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        data-testid={testId}
      >
        <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
          <X size={20} />
        </button>
        {children}
      </div>
    </div>
  );
}
