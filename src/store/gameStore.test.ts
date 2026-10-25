import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { ManualClock } from '../core/clock';
import { openSaveDb } from '../save/db';
import { createGameStore } from './gameStore';

const T0 = Date.UTC(2026, 9, 25, 12, 0, 0);
let n = 0;

function setup(name = `store-${++n}`, writer = true, clock = new ManualClock(T0)) {
  const store = createGameStore({
    clock,
    openDb: () => openSaveDb(name),
    newSeed: () => 1234,
    acquireWriterLock: async () => writer,
    debounceMs: 5,
  });
  return { store, clock, name };
}

describe('game store', () => {
  it('starts a spec initial game and persists it', async () => {
    const { store, name } = setup();
    await store.getState().init();
    const s = store.getState();
    expect(s.status).toBe('ready');
    expect(s.game?.yenCents).toBe(12000);
    const db = await openSaveDb(name);
    expect(((await db.get('saves', 'current')) as { revision: number }).revision).toBe(1);
  });

  it('buy is written immediately and survives a reload', async () => {
    const { store, name, clock } = setup();
    await store.getState().init();
    expect(await store.getState().buy('save')).toBe(true);
    const reloaded = setup(name, true, clock).store;
    await reloaded.getState().init();
    expect(reloaded.getState().game?.investments.save).toBe(1);
  });

  it('a tab without the writer lock is read-only', async () => {
    const { store } = setup(undefined, false);
    await store.getState().init();
    expect(store.getState().status).toBe('readonly');
    store.getState().click();
    expect(store.getState().game?.totalClicks).toBe(0);
  });

  it('without Web Locks, a stale second tab goes read-only on conflict (GS-CA15)', async () => {
    const a = setup();
    await a.store.getState().init();
    const b = setup(a.name, true, a.clock);
    await b.store.getState().init(); // loads rev 1, writes rev 2
    await a.store.getState().buy('save'); // tab A still expects rev 1
    expect(a.store.getState().status).toBe('readonly');
    expect(b.store.getState().status).toBe('ready');
  });

  it('long absence goes to the welcome-back amount, collected once', async () => {
    const { store, clock } = setup();
    await store.getState().init();
    await store.getState().buy('save');
    clock.advance(10 * 60_000);
    store.getState().tick();
    expect(store.getState().game?.pendingOfflineCents).toBe(60 * 600);
    await store.getState().collectOffline();
    await store.getState().collectOffline();
    expect(store.getState().game?.yenCents).toBe(7000 + 36000);
  });

  it('import validates, backs up the current save and replaces it', async () => {
    const { store, name } = setup();
    await store.getState().init();
    store.getState().click();
    const text = store.getState().exportSave()!;
    expect((await store.getState().importSave('{"bad":1}')).ok).toBe(false);
    await store.getState().buy('save');
    expect(await store.getState().importSave(text)).toEqual({ ok: true });
    expect(store.getState().game?.investments.save).toBe(0);
    expect(store.getState().game?.totalClicks).toBe(1);
    const db = await openSaveDb(name);
    const backup = (await db.get('saves', 'backup-before-import')) as {
      investments: { save: number };
    };
    expect(backup.investments.save).toBe(1);
  });

  it('a corrupt save opens the recovery state, and a new game recovers', async () => {
    const name = `store-${++n}`;
    const db = await openSaveDb(name);
    await db.put('saves', { schemaVersion: 1, revision: 4, junk: true }, 'current');
    const { store } = setup(name);
    await store.getState().init();
    expect(store.getState().status).toBe('recovery');
    await store.getState().newGame();
    expect(store.getState().status).toBe('ready');
    expect(((await db.get('saves', 'current')) as { revision: number }).revision).toBe(5);
  });
});
