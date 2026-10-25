// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ManualClock } from '../core/clock';
import { openSaveDb } from '../save/db';
import { createGameStore } from '../store/gameStore';
import { App } from './App';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false;
  };
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function app(name: string) {
  const store = createGameStore({
    clock: new ManualClock(Date.UTC(2026, 9, 25)),
    openDb: () => openSaveDb(name),
    newSeed: () => 7,
    acquireWriterLock: async () => true,
    debounceMs: 5,
  });
  render(<App store={store} />);
  await act(() => store.getState().init());
  fireEvent.click(screen.getByRole('button', { name: 'Associés' }));
  return store;
}

describe('draw screen', () => {
  it('reveals only after the draw is written, then a long press skips the animation', async () => {
    const store = await app('ui-draw-1');
    let resolve!: () => void;
    const gate = new Promise<void>((r) => (resolve = r));
    const real = store.getState().pull;
    store.setState({ pull: async () => (await gate, real()) });
    fireEvent.click(screen.getByRole('button', { name: 'Tirer · 1 ticket' }));
    await act(async () => {});
    expect(screen.queryByText('Tirage en cours…')).toBeNull(); // not saved yet: no reveal
    await act(async () => {
      resolve();
      await gate;
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(screen.getByText('Tirage en cours…')).toBeTruthy();
    expect(store.getState().game!.gacha.pulls).toBe(1);
    vi.useFakeTimers();
    fireEvent.pointerDown(screen.getByTestId('reveal'));
    act(() => vi.advanceTimersByTime(400));
    expect(screen.getByRole('button', { name: 'Continuer' })).toBeTruthy();
  });

  it('shows the rates, the pity rule and the no-purchase sentence', async () => {
    await app('ui-draw-2');
    expect(screen.getByText('3 ★ garanti dans 50 tirages')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Taux de tirage' }));
    const d = screen.getByRole('dialog', { name: 'Taux de tirage' });
    expect(d.textContent).toContain(
      'Les tickets se gagnent uniquement en jouant. Aucun achat possible.',
    );
    expect(d.textContent).toMatch(/environ 5,4 %/);
  });
});
