// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ManualClock } from '../core/clock';
import { openSaveDb } from '../save/db';
import { createGameStore } from '../store/gameStore';
import { App } from './App';
import { fnv1a, parseImport } from '../save/exportImport';
import * as helpers from './helpers';

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
    expect(document.querySelector('label[for="import-file"]')).toBeTruthy(); // DEF-GS-53 / M12
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

async function futureRecoveryApp(name: string) {
  const db = await openSaveDb(name);
  // Valid-looking shell with a future schemaVersion so loadSave returns `future`.
  await db.put(
    'saves',
    {
      schemaVersion: 6,
      revision: 1,
      createdAt: 1,
      lastSeenAt: 1,
      maxSeenAt: 1,
    },
    'current',
  );
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

describe('DEF-GS-30 reload banner on Recovery (future schema at load)', () => {
  it('shows a visible .banner and a reload button (mutant: Recovery-only early return)', async () => {
    const { store } = await futureRecoveryApp('ui-recovery-future');
    expect(store.getState().status).toBe('recovery');
    expect(store.getState().recoveryKind).toBe('future');
    expect(store.getState().reloadNeeded).toBe(true);
    const banner = document.querySelector('.banner');
    expect(banner).toBeTruthy();
    expect(banner?.textContent ?? '').toMatch(/Recharge la page/);
    expect(banner?.getAttribute('role')).toBe('status');
    expect(banner?.getAttribute('aria-live')).toBe('polite');
    // Mutant kill: a Recovery early return that only keeps the visually-hidden live region fails here.
    expect(banner?.classList.contains('visually-hidden')).toBe(false);
    expect(screen.getByRole('button', { name: 'Recharger la page' })).toBeTruthy();
  });
});

describe('DEF-GS-48 future schema does not offer Nouvelle partie or Importer', () => {
  it('hides those actions, keeps Recharger, and does not touch backup-before-reset', async () => {
    const name = 'ui-recovery-future-gs48';
    const db = await openSaveDb(name);
    const future = {
      schemaVersion: 6,
      revision: 1,
      createdAt: 1,
      lastSeenAt: 1,
      maxSeenAt: 1,
      yenCents: 42424,
    };
    const previousReset = { schemaVersion: 5, revision: 2, yenCents: 7777, tag: 'partie-A' };
    await db.put('saves', future, 'current');
    await db.put('saves', previousReset, 'backup-before-reset');
    const store = createGameStore({
      clock: new ManualClock(Date.UTC(2026, 9, 25)),
      openDb: () => openSaveDb(name),
      newSeed: () => 1,
      acquireWriterLock: async () => true,
      debounceMs: 5,
    });
    render(<App store={store} />);
    await act(() => store.getState().init());
    expect(store.getState().recoveryKind).toBe('future');
    expect(
      screen.getByText(
        "Cette sauvegarde vient d'une version plus récente du jeu. Recharge la page pour obtenir la dernière version.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Recharger la page' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Exporter la sauvegarde' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Commencer une nouvelle partie' })).toBeNull();
    expect(screen.queryByText('Importer une sauvegarde')).toBeNull();

    const beforeReset = await db.get('saves', 'backup-before-reset');
    const beforeImport = await db.get('saves', 'backup-before-import');
    await act(async () => {
      await store.getState().newGame();
    });
    expect(store.getState().status).toBe('recovery');
    expect(store.getState().recoveryKind).toBe('future');
    expect(store.getState().game).toBeNull();
    expect(await db.get('saves', 'backup-before-reset')).toEqual(beforeReset);
    expect(await db.get('saves', 'current')).toEqual(future);

    const imported = await act(async () => store.getState().importSave('{"bad":1}'));
    expect(imported.ok).toBe(false);
    expect(await db.get('saves', 'backup-before-import')).toEqual(beforeImport);
    expect(await db.get('saves', 'current')).toEqual(future);
  });
});

describe('DEF-GS-52 / DEF-GS-53 future export envelope and announcements', () => {
  it('exports a standard envelope and announces « Sauvegarde exportée. » (M09)', async () => {
    const captured: string[] = [];
    const spy = vi.spyOn(helpers, 'download').mockImplementation((text) => {
      captured.push(text);
    });
    const { store, db } = await futureRecoveryApp('ui-recovery-export-env');
    const current = await db.get('saves', 'current');
    fireEvent.click(screen.getByRole('button', { name: 'Exporter la sauvegarde' }));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(captured).toHaveLength(1);
    const text = captured[0]!;
    const env = JSON.parse(text) as { format: string; checksum: string; save: unknown };
    expect(env.format).toBe('thegameshow-save');
    expect(env.save).toEqual(current);
    expect(env.checksum).toBe(fnv1a(JSON.stringify(current)));
    expect(parseImport(text).ok).toBe(false); // v6 is not a 0.5.x save; envelope itself is valid
    expect(store.getState().announcement).toBe('Sauvegarde exportée.');
    spy.mockRestore();
  });
});
