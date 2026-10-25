// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ManualClock } from '../core/clock';
import { openSaveDb } from '../save/db';
import { createGameStore } from '../store/gameStore';
import { App } from './App';

beforeAll(() => {
  // jsdom has no <dialog> modal API.
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false;
  };
});
afterEach(cleanup);

async function recoveryApp(name: string) {
  const db = await openSaveDb(name);
  await db.put('saves', { schemaVersion: 1, revision: 2, junk: true }, 'current');
  const store = createGameStore({
    clock: new ManualClock(Date.UTC(2026, 9, 25)),
    openDb: () => openSaveDb(name),
    newSeed: () => 1,
    acquireWriterLock: async () => true,
    debounceMs: 5,
  });
  render(<App store={store} />);
  await act(() => store.getState().init());
  return { store, db };
}

describe('recovery screen (DEF-GS-01)', () => {
  it('asks for a confirmation listing the losses before starting over', async () => {
    const { store, db } = await recoveryApp('ui-recovery-1');
    fireEvent.click(screen.getByRole('button', { name: 'Commencer une nouvelle partie' }));
    expect(store.getState().status).toBe('recovery'); // nothing happened yet
    const dialog = screen.getByRole('dialog', { name: 'Commencer une nouvelle partie ?' });
    for (const loss of ['tes yens', 'tes tickets', 'tes investissements et leurs niveaux']) {
      expect(dialog.textContent).toContain(loss);
    }
    expect(
      screen.getByRole('button', { name: 'Télécharger la sauvegarde illisible' }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(store.getState().status).toBe('recovery');

    fireEvent.click(screen.getByRole('button', { name: 'Commencer une nouvelle partie' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Oui, commencer une nouvelle partie' }));
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(store.getState().status).toBe('ready');
    expect(await db.get('saves', 'backup-before-reset')).toMatchObject({ junk: true });
  });
});
