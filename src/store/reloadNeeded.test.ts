import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { ManualClock } from '../core/clock';
import { createInitialState } from '../core/state';
import { openSaveDb, writeSave } from '../save/db';
import { createGameStore } from './gameStore';

describe('reloadNeeded banner (R-MV5-01 / versionchange)', () => {
  it('future schema on load sets reloadNeeded and announces FR reload text', async () => {
    const name = 'reload-future';
    const T0 = Date.UTC(2026, 10, 9, 12);
    const clock = new ManualClock(T0);
    const db = await openSaveDb(name);
    const base = await writeSave(db, createInitialState(T0, 1), -1);
    await db.put('saves', { ...base, schemaVersion: 6, revision: base.revision + 1 }, 'current');
    db.close();
    const store = createGameStore({
      clock,
      openDb: () => openSaveDb(name),
      newSeed: () => 1,
      acquireWriterLock: async () => true,
      debounceMs: 5,
    });
    await store.getState().init();
    expect(store.getState().status).toBe('recovery');
    expect(store.getState().reloadNeeded).toBe(true);
    expect(store.getState().announcement).toMatch(/Recharge la page/);
  });

  it('versionchange on the open connection sets reloadNeeded (mutant: close-only)', async () => {
    const name = 'reload-vc';
    const T0 = Date.UTC(2026, 10, 9, 13);
    const clock = new ManualClock(T0);
    const store = createGameStore({
      clock,
      openDb: () => openSaveDb(name),
      newSeed: () => 1,
      acquireWriterLock: async () => true,
      debounceMs: 5,
    });
    await store.getState().init();
    expect(store.getState().status).toBe('ready');
    expect(store.getState().reloadNeeded).toBe(false);
    // The store registered a versionchange listener on its db; open a higher version to fire it.
    // DB_VERSION is 2 — bumping via a parallel open with version 3 triggers versionchange.
    const bump = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open(name, 3);
      r.onupgradeneeded = () => undefined;
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.onblocked = () => undefined;
    });
    // Allow the versionchange handler to run.
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 20));
    expect(store.getState().reloadNeeded).toBe(true);
    expect(store.getState().status).toBe('readonly');
    expect(store.getState().announcement).toMatch(/Recharge la page/);
    expect(store.getState().game).not.toBeNull();
    bump.close();
  });
});
