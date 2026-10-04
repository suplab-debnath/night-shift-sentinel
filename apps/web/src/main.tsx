import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import { useStore } from 'zustand';
import { premiumRun } from '@night-shift/scenarios';
import { App } from './App';
import { approverName, brand, freshTake, parseUrlOptions } from './config';
import { LiveSource } from './sources/LiveSource';
import { ScriptedSource } from './sources/ScriptedSource';
import { createAppStore, StoreProvider } from './state/store';
import './styles/global.css';

const url = parseUrlOptions(window.location.search);
const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

const sourceOptions = {
  speed: url.speed ?? brand.defaultSpeed,
  decisions: url.decisions,
  approver: approverName,
  pauseAt: url.pauseAt,
  autoDecide: url.autoDecide,
  autoplay: url.autoplay,
  seek: url.seek,
  take: url.take ?? freshTake(),
  pace: url.pace ?? brand.pace,
};

// Live mode only when served with an /api (dev:live, dev:live-mock, or the AWS build);
// the offline single file is always scripted (its CSP forbids network access anyway).
const wantsLive = import.meta.env.MODE !== 'offline' && (import.meta.env.MODE === 'live' || url.mode === 'live');
const source = wantsLive
  ? new LiveSource(premiumRun.scenario, sourceOptions, {
      apiBase: './api',
      scenarioId: premiumRun.id,
      ...(url.passcode ? { passcode: url.passcode } : {}),
      ...(url.mockFail ? { mockFail: url.mockFail } : {}),
    })
  : new ScriptedSource(premiumRun.scenario, sourceOptions);
if (source instanceof LiveSource) void source.connect();

const store = createAppStore(source, premiumRun, {
  tab: 'stream',
  reducedMotion: url.reducedMotion ?? prefersReduced,
  presenter: url.presenter,
  notes: url.notes ?? brand.showNotesStrip,
  inspector: null,
  splitOpen: false,
  shortcutsOpen: false,
  panelOpen: false,
  summaryHidden: false,
});

const root = document.getElementById('root');
if (!root) throw new Error('Root element missing');

function Root() {
  const reduced = useStore(store, (s) => s.ui.reducedMotion);
  return (
    <MotionConfig reducedMotion={reduced ? 'always' : 'never'}>
      <StoreProvider store={store}>
        <App />
      </StoreProvider>
    </MotionConfig>
  );
}

createRoot(root).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);

// Test and capture hook (Playwright, deck screenshots). Read-only snapshot plus controls.
declare global {
  interface Window {
    __nightShift?: { source: ScriptedSource | LiveSource; store: typeof store };
  }
}
window.__nightShift = { source, store };
