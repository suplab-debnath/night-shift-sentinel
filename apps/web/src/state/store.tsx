// Zustand store: the current stage snapshot plus UI-only preferences.
import { createContext, useContext, type ReactNode } from 'react';
import { createStore, useStore, type StoreApi } from 'zustand';
import type { AgentId } from '@night-shift/engine';
import type { ScenarioBundle } from '@night-shift/scenarios';
import type { StageSnapshot, StageSource } from '../sources/types';

export type PanelTab = 'stream' | 'evidence' | 'channel' | 'audit' | 'artifacts';

export interface UiState {
  tab: PanelTab;
  reducedMotion: boolean;
  presenter: boolean;
  notes: boolean;
  inspector: AgentId | null;
  splitOpen: boolean;
  shortcutsOpen: boolean;
  panelOpen: boolean;
}

export interface AppState {
  snap: StageSnapshot;
  ui: UiState;
  source: StageSource;
  bundle: ScenarioBundle;
  setUi: (patch: Partial<UiState>) => void;
}

export type AppStore = StoreApi<AppState>;

export function createAppStore(source: StageSource, bundle: ScenarioBundle, ui: UiState): AppStore {
  const store = createStore<AppState>()((set) => ({
    snap: source.getSnapshot(),
    ui,
    source,
    bundle,
    setUi: (patch) => set((s) => ({ ui: { ...s.ui, ...patch } })),
  }));
  source.subscribe((snap) => store.setState({ snap }));
  return store;
}

const StoreContext = createContext<AppStore | null>(null);

export function StoreProvider({ store, children }: { store: AppStore; children: ReactNode }) {
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useAppStore(): AppStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error('StoreProvider missing');
  return store;
}

export function useApp<T>(selector: (s: AppState) => T): T {
  return useStore(useAppStore(), selector);
}
