import { useEffect } from 'react';
import { LiveAnnouncer } from './components/LiveAnnouncer';
import { PresenterNotes } from './components/PresenterNotes';
import { ShortcutsHelp } from './components/ShortcutsHelp';
import { SplitView } from './components/SplitView';
import { useCursorAutoHide } from './hooks/useCursorAutoHide';
import { useShortcuts } from './hooks/useShortcuts';
import { SidePanel } from './components/SidePanel';
import { Stage } from './components/Stage';
import { TopBar } from './components/TopBar';
import { TransportBar } from './components/TransportBar';
import { useApp } from './state/store';
import styles from './App.module.css';

export function App() {
  const source = useApp((s) => s.source);
  const reduced = useApp((s) => s.ui.reducedMotion);
  const presenter = useApp((s) => s.ui.presenter);
  useShortcuts();
  useCursorAutoHide(presenter);

  useEffect(() => {
    source.start();
    return () => source.stop();
  }, [source]);

  useEffect(() => {
    document.documentElement.dataset.reducedMotion = String(reduced);
    document.documentElement.dataset.presenter = String(presenter);
  }, [reduced, presenter]);

  return (
    <div className={styles.app}>
      <TopBar />
      <main className={styles.main}>
        <Stage />
        <SidePanel />
      </main>
      <TransportBar />
      <PresenterNotes />
      <SplitView />
      <ShortcutsHelp />
      <LiveAnnouncer />
    </div>
  );
}
