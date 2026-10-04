import { useEffect } from 'react';
import type { AgentId } from '@night-shift/engine';
import { resolveShortcut, type ShortcutAction } from '../shortcuts';
import { useAppStore } from '../state/store';

/** The agent the inspector opens for: the focused node, else the last agent that spoke. */
function focusedAgent(state: ReturnType<ReturnType<typeof useAppStore>['getState']>): AgentId | null {
  const el = document.activeElement?.closest('[data-agent]');
  const attr = el?.getAttribute('data-agent');
  if (attr) return attr as AgentId;
  const last = [...state.snap.state.stream].reverse().find((e) => e.type === 'thought' || e.type === 'tool.call');
  return last && 'agent' in last ? last.agent : 'orchestrator';
}

export function useShortcuts() {
  const store = useAppStore();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const state = store.getState();
      const action = resolveShortcut(
        {
          key: e.key,
          ctrlKey: e.ctrlKey,
          metaKey: e.metaKey,
          altKey: e.altKey,
          targetTag: target?.tagName,
          targetType: (target as HTMLInputElement | null)?.type,
        },
        { speed: state.snap.speed },
      );
      if (!action) return;
      if (run(action, state, store.getState)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [store]);
}

type State = ReturnType<ReturnType<typeof useAppStore>['getState']>;

/** Returns true when the key was handled. */
export function run(action: ShortcutAction, s: State, get: () => State = () => s): boolean {
  const { source, setUi, ui, snap } = s;
  const gateId = snap.pendingGateId;
  switch (action.type) {
    case 'togglePlay':
      source.toggleFreeze();
      return true;
    case 'toggleSquad':
      source.toggleSquad();
      return true;
    case 'stepForward':
      source.stepForward();
      return true;
    case 'stepBack':
      source.stepBack();
      return true;
    case 'jumpToAct':
      source.jumpToAct(action.act);
      return true;
    case 'approve':
      if (!gateId || snap.state.overlay.active) return false;
      source.decide(gateId, 'approved');
      return true;
    case 'reject':
      if (!gateId || snap.state.overlay.active) return false;
      source.decide(gateId, 'rejected');
      return true;
    case 'chaos':
      return source.triggerChaos();
    case 'inject':
      return source.triggerChaos('inject');
    case 'toggleSplit':
      setUi({ splitOpen: !ui.splitOpen });
      return true;
    case 'toggleInspector':
      setUi({ inspector: ui.inspector ? null : focusedAgent(get()) });
      return true;
    case 'togglePresenter':
      setUi({ presenter: !ui.presenter });
      return true;
    case 'toggleNotes':
      setUi({ notes: !ui.notes });
      return true;
    case 'switchMode':
      // Only a live source can switch; the scripted/offline build ignores M.
      return source.switchMode?.() ?? false;
    case 'setSpeed':
      source.setSpeed(action.speed);
      return true;
    case 'reset':
      source.reset();
      setUi({ splitOpen: false, inspector: null, shortcutsOpen: false });
      return true;
    case 'toggleHelp':
      setUi({ shortcutsOpen: !ui.shortcutsOpen });
      return true;
    case 'close':
      if (ui.shortcutsOpen || ui.splitOpen || ui.inspector || ui.panelOpen) {
        setUi({ shortcutsOpen: false, splitOpen: false, inspector: null, panelOpen: false });
        return true;
      }
      // Then the scorecard / end card, so the finished stage can be shown.
      if (snap.state.scorecard !== null && !ui.summaryHidden && !snap.state.overlay.active) {
        setUi({ summaryHidden: true });
        return true;
      }
      return false;
  }
}
