import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { ManualClock } from '../core/clock';
import { openSaveDb } from '../save/db';
import { createGameStore } from './gameStore';
import midgame from '../save/__fixtures__/v2-midgame.json';
import midgameV3 from '../save/__fixtures__/v3-midgame.json';

let n = 0;
function setup(writer = true, name = `lot3-${++n}`) {
  const clock = new ManualClock(midgame.maxSeenAt + 1000);
  const store = createGameStore({
    clock,
    openDb: () => openSaveDb(name),
    newSeed: () => 1,
    acquireWriterLock: async () => writer,
    debounceMs: 5,
  });
  return { store, name, clock };
}
const seed = async (name: string, slots: Record<string, unknown>) => {
  const db = await openSaveDb(name);
  for (const [k, v] of Object.entries(slots)) await db.put('saves', v as never, k as never);
  db.close();
};

describe('lot 3 store: migration v2 → v4 (chain)', () => {
  it('writer tab keeps the raw v2 record and writes v4', async () => {
    const { store, name } = setup();
    await seed(name, { current: midgame });
    await store.getState().init();
    expect(store.getState().game?.schemaVersion).toBe(4);
    const db = await openSaveDb(name);
    expect(await db.get('saves', 'backup-before-migration')).toEqual(midgame);
    expect(((await db.get('saves', 'current')) as { schemaVersion: number }).schemaVersion).toBe(4);
  });
  it('read-only tab migrates in memory only and writes nothing', async () => {
    const { store, name } = setup(false);
    await seed(name, { current: midgame });
    await store.getState().init();
    expect(store.getState().game?.schemaVersion).toBe(4);
    const db = await openSaveDb(name);
    expect(await db.get('saves', 'current')).toEqual(midgame);
    expect(await db.get('saves', 'backup-before-migration')).toBeUndefined();
  });
  it('a future version shows the recovery screen and writes nothing', async () => {
    const { store, name } = setup();
    const future = { ...midgame, schemaVersion: 5 };
    await seed(name, { current: future });
    await store.getState().init();
    expect(store.getState().status).toBe('recovery');
    expect(store.getState().recoveryKind).toBe('future');
    const db = await openSaveDb(name);
    expect(await db.get('saves', 'current')).toEqual(future);
  });
  it('announces the fallback to a backup copy', async () => {
    const { store, name } = setup();
    await seed(name, { current: { bad: 1 }, 'backup-before-migration': midgame });
    await store.getState().init();
    expect(store.getState().announcement).toBe(
      'Une copie de secours de ta sauvegarde a été restaurée.',
    );
  });
  it('manual rollback keeps the current state in backup-before-restore (R12)', async () => {
    const { store, name } = setup();
    await seed(name, { current: midgame });
    await store.getState().init();
    store.getState().click();
    const db = await openSaveDb(name);
    const importBackup = await db.get('saves', 'backup-before-import');
    expect(await store.getState().restoreMigrationBackup()).toBe(true);
    expect(store.getState().game?.tickets).toBe(midgame.tickets);
    expect(store.getState().game?.totalClicks).toBe(midgame.totalClicks);
    const kept = (await db.get('saves', 'backup-before-restore')) as { totalClicks: number };
    expect(kept.totalClicks).toBe(midgame.totalClicks + 1);
    expect(await db.get('saves', 'backup-before-import')).toEqual(importBackup);
  });
});

describe('lot 4 store: migration v3 → v4 (R-L4-1, §4.3)', () => {
  it('writer tab keeps the raw v3 in -v3, leaves the lot 3 slot and writes v4 once', async () => {
    const { store, name } = setup();
    await seed(name, { current: midgameV3, 'backup-before-migration': midgame });
    await store.getState().init();
    expect(store.getState().game?.work).toEqual({
      mode: 'roman',
      points: 0,
      pointsTotal: 0,
      cursor: 0,
      taps: 0,
    });
    const db = await openSaveDb(name);
    expect(await db.get('saves', 'backup-before-migration-v3')).toEqual(midgameV3);
    expect(await db.get('saves', 'backup-before-migration')).toEqual(midgame);
    expect(await db.get('saves', 'previous')).toEqual(midgameV3);
  });
  it('read-only tab migrates in memory only and writes nothing', async () => {
    const { store, name } = setup(false);
    await seed(name, { current: midgameV3 });
    await store.getState().init();
    expect(store.getState().game?.schemaVersion).toBe(4);
    const db = await openSaveDb(name);
    expect(await db.getAllKeys('saves')).toEqual(['current']);
  });
  it('manual rollback takes -v3 first, then backup-before-migration', async () => {
    const { store, name } = setup();
    await seed(name, { current: midgameV3, 'backup-before-migration': midgame });
    await store.getState().init();
    const b = await store.getState().migrationBackup();
    expect(b.kind === 'ok' && b.save.yenCents).toBe(midgameV3.yenCents);
    expect(await store.getState().restoreMigrationBackup()).toBe(true);
    expect(store.getState().game?.totalClicks).toBe(midgameV3.totalClicks);
  });
});
