// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { incidentCheckout } from '@night-shift/scenarios';
import { compile } from '@night-shift/engine';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { presenterNote } from '../presenterNotes';
import { ScriptedSource } from '../sources/ScriptedSource';
import { createAppStore, StoreProvider, type UiState } from '../state/store';
import { run } from '../hooks/useShortcuts';
import { GateSheet } from './GateSheet';
import { PacketLayer } from './PacketLayer';
import { StreamItem } from './StreamItem';

beforeAll(() => {
  // jsdom lacks these browser APIs.
  globalThis.ResizeObserver ??= class {
    observe() {}
    disconnect() {}
    unobserve() {}
  } as unknown as typeof ResizeObserver;
});

afterEach(cleanup);

const UI: UiState = {
  tab: 'stream',
  reducedMotion: false,
  presenter: false,
  notes: true,
  inspector: null,
  splitOpen: false,
  shortcutsOpen: false,
  panelOpen: false,
};

function setup(opts: { seek?: number; ui?: Partial<UiState>; decisions?: [] } = {}) {
  const source = new ScriptedSource(incidentCheckout.scenario, { approver: 'Asha', seek: opts.seek ?? 0, raf: () => 1, caf: () => {} });
  const store = createAppStore(source, incidentCheckout, { ...UI, ...opts.ui });
  return { source, store };
}

// When the first gate opens on the canonical take.
const GATE_T = compile(incidentCheckout.scenario).endT;

describe('GateSheet', () => {
  it('focuses the primary action, traps Tab, and ignores Esc', () => {
    const { store } = setup({ seek: GATE_T });
    const gate = store.getState().snap.state.gate!;
    render(
      <StoreProvider store={store}>
        <GateSheet gate={gate} />
      </StoreProvider>,
    );
    const approve = screen.getByTestId('gate-approve');
    const reject = screen.getByTestId('gate-reject');
    expect(document.activeElement).toBe(approve);
    const sheet = screen.getByTestId('gate-sheet');
    reject.focus();
    fireEvent.keyDown(sheet, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /show evidence/i }));
    screen.getByRole('button', { name: /show evidence/i }).focus();
    fireEvent.keyDown(sheet, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(reject);
    fireEvent.keyDown(sheet, { key: 'Escape' });
    expect(store.getState().snap.state.gate?.status).toBe('open');
    expect(screen.getByRole('dialog')).toHaveProperty('ariaModal', 'true');
  });

  it('shows evidence on demand and records the decision', () => {
    const { store } = setup({ seek: GATE_T });
    render(
      <StoreProvider store={store}>
        <GateSheet gate={store.getState().snap.state.gate!} />
      </StoreProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /show evidence/i }));
    expect(screen.getByTestId('checklist').textContent).toContain('P-05');
    act(() => {
      fireEvent.click(screen.getByTestId('gate-reject'));
    });
    expect(store.getState().snap.decisions[0]).toMatchObject({ gateId: 'g1', decision: 'rejected', by: 'Asha' });
  });
});

describe('reduced motion', () => {
  it('renders thought lines whole and packets without trails', () => {
    const { store } = setup({ seek: 2000, ui: { reducedMotion: true } });
    const entry = store.getState().snap.state.stream.find((e) => e.type === 'thought')!;
    const { container } = render(
      <StoreProvider store={store}>
        <ul>
          <StreamItem entry={entry} />
        </ul>
        <PacketLayer size={{ width: 1000, height: 600 }} />
      </StoreProvider>,
    );
    expect(container.textContent).toContain('p99 latency on checkout-api is 4.8 seconds. The SLO is 800 milliseconds.');
    act(() => store.getState().source.seek(7300));
    expect(container.querySelectorAll('[data-testid="packet"]').length).toBe(1);
    expect(container.querySelectorAll('[data-testid="packet-trails"] path').length).toBe(0);
  });

  it('types thoughts in and draws trails with motion on', () => {
    const { store } = setup({ seek: 2000 });
    const entry = store.getState().snap.state.stream.find((e) => e.type === 'thought')!;
    const { container } = render(
      <StoreProvider store={store}>
        <ul>
          <StreamItem entry={entry} />
        </ul>
        <PacketLayer size={{ width: 1000, height: 600 }} />
      </StoreProvider>,
    );
    expect(container.textContent).not.toContain('800 milliseconds.');
    act(() => store.getState().source.seek(7300));
    expect(container.querySelectorAll('[data-testid="packet-trails"] path').length).toBe(1);
  });
});

describe('shortcut dispatch', () => {
  it('approves only at an open gate and toggles UI state', () => {
    const { store } = setup({ seek: 1000 });
    expect(run({ type: 'approve' }, store.getState())).toBe(false);
    run({ type: 'toggleSplit' }, store.getState());
    expect(store.getState().ui.splitOpen).toBe(true);
    expect(run({ type: 'close' }, store.getState())).toBe(true);
    expect(store.getState().ui.splitOpen).toBe(false);
    expect(run({ type: 'close' }, store.getState())).toBe(false);
    run({ type: 'togglePresenter' }, store.getState());
    run({ type: 'toggleNotes' }, store.getState());
    expect(store.getState().ui).toMatchObject({ presenter: true, notes: false });
    run({ type: 'toggleInspector' }, store.getState(), store.getState);
    expect(store.getState().ui.inspector).toBe('sentinel');
    run({ type: 'setSpeed', speed: 1.5 }, store.getState());
    expect(store.getState().snap.speed).toBe(1.5);
    expect(run({ type: 'switchMode' }, store.getState())).toBe(false);
    run({ type: 'jumpToAct', act: 3 }, store.getState());
    expect(store.getState().snap.currentAct).toBe(3);
    run({ type: 'stepForward' }, store.getState());
    run({ type: 'stepBack' }, store.getState());
    run({ type: 'togglePlay' }, store.getState());
    expect(store.getState().snap.playing).toBe(true);
    run({ type: 'toggleHelp' }, store.getState());
    expect(store.getState().ui.shortcutsOpen).toBe(true);
    run({ type: 'reset' }, store.getState());
    expect(store.getState().snap.t).toBe(0);
    expect(store.getState().ui.shortcutsOpen).toBe(false);

    const gate = setup({ seek: GATE_T });
    expect(run({ type: 'approve' }, gate.store.getState())).toBe(true);
    expect(gate.store.getState().snap.decisions[0]).toMatchObject({ decision: 'approved' });
    const gate2 = setup({ seek: GATE_T });
    expect(run({ type: 'reject' }, gate2.store.getState())).toBe(true);
    // Chaos stays available after a rejection (from Act 4 onward).
    expect(run({ type: 'chaos' }, gate2.store.getState())).toBe(true);
  });
});

describe('presenter notes', () => {
  it('follows the RUNBOOK script through the run', () => {
    const { source } = setup();
    expect(presenterNote(source.getSnapshot(), false)).toMatch(/2:07 in the morning/);
    source.seek(5000);
    expect(presenterNote(source.getSnapshot(), false)).toMatch(/Sentinel watches the numbers/);
    source.seek(GATE_T);
    expect(presenterNote(source.getSnapshot(), false)).toMatch(/Your call/);
    expect(presenterNote(source.getSnapshot(), true)).toMatch(/done by hand/);
    source.triggerChaos();
    expect(presenterNote(source.getSnapshot(), false)).toMatch(/What if an agent gets it wrong/);
  });
});
