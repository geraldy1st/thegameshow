import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { ManualClock } from '../core/clock';
import * as saveDb from '../save/db';
import { openSaveDb } from '../save/db';
import { t } from '../i18n/fr';
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

describe('lot 3 store: migration v2 → v5 (chain)', () => {
  it('writer tab keeps the raw v2 record and writes v5', async () => {
    const { store, name } = setup();
    await seed(name, { current: midgame });
    await store.getState().init();
    expect(store.getState().game?.schemaVersion).toBe(5);
    const db = await openSaveDb(name);
    expect(await db.get('saves', 'backup-before-migration')).toEqual(midgame);
    expect(((await db.get('saves', 'current')) as { schemaVersion: number }).schemaVersion).toBe(5);
  });
  it('read-only tab migrates in memory only and writes nothing', async () => {
    const { store, name } = setup(false);
    await seed(name, { current: midgame });
    await store.getState().init();
    expect(store.getState().game?.schemaVersion).toBe(5);
    const db = await openSaveDb(name);
    expect(await db.get('saves', 'current')).toEqual(midgame);
    expect(await db.get('saves', 'backup-before-migration')).toBeUndefined();
  });
  it('a future version shows the recovery screen and writes nothing', async () => {
    const { store, name } = setup();
    const future = { ...midgame, schemaVersion: 6 };
    await seed(name, { current: future });
    await store.getState().init();
    expect(store.getState().status).toBe('recovery');
    expect(store.getState().recoveryKind).toBe('future');
    const db = await openSaveDb(name);
    expect(await db.get('saves', 'current')).toEqual(future);
  });
  it('newGame and importSave are no-ops on a future schema and leave backups alone (DEF-GS-48)', async () => {
    const { store, name } = setup();
    const future = { ...midgame, schemaVersion: 6, yenCents: 42424 };
    const partieA = { ...midgame, yenCents: 7777, tag: 'partie-A' };
    await seed(name, { current: future, 'backup-before-reset': partieA });
    await store.getState().init();
    expect(store.getState().recoveryKind).toBe('future');
    const db = await openSaveDb(name);
    await store.getState().newGame();
    expect(store.getState().status).toBe('recovery');
    expect(store.getState().game).toBeNull();
    expect(await db.get('saves', 'backup-before-reset')).toEqual(partieA);
    expect(await db.get('saves', 'current')).toEqual(future);
    expect(await db.get('saves', 'backup-before-import')).toBeUndefined();

    const readyStore = setup();
    await readyStore.store.getState().init();
    const valid = await readyStore.store.getState().exportSave();
    expect(valid).toBeTruthy();
    const result = await store.getState().importSave(valid!);
    expect(result).toEqual({ ok: false, reason: 'future-schema' });
    expect(await db.get('saves', 'backup-before-import')).toBeUndefined();
    expect(await db.get('saves', 'current')).toEqual(future);
    expect(store.getState().status).toBe('recovery');
  });
  it('a ready tab does not clobber backups or claim a false import when disk is already v6 (DEF-GS-51)', async () => {
    const { store, name } = setup();
    await seed(name, { current: midgame });
    await store.getState().init();
    expect(store.getState().status).toBe('ready');
    const yenBefore = store.getState().game?.yenCents;
    const db = await openSaveDb(name);
    const partieA = { ...midgame, yenCents: 7777, tag: 'partie-A' };
    const partieB = { ...midgame, yenCents: 8888, tag: 'partie-B' };
    await db.put('saves', partieA, 'backup-before-reset');
    await db.put('saves', partieB, 'backup-before-import');
    const future = { ...midgame, schemaVersion: 6, yenCents: 42424 };
    await db.put('saves', future, 'current');

    const incoming = setup();
    await incoming.store.getState().init();
    const valid = await incoming.store.getState().exportSave();
    expect(valid).toBeTruthy();
    const result = await store.getState().importSave(valid!);
    expect(result).toEqual({ ok: false, reason: 'future-schema' });
    expect(store.getState().announcement).not.toBe('Sauvegarde importée.');
    expect(store.getState().game?.yenCents).toBe(yenBefore);
    expect(await db.get('saves', 'backup-before-import')).toEqual(partieB);
    expect(await db.get('saves', 'current')).toEqual(future);
    // DEF-GS-57 / M21: read-only immediately, without waiting for autosave or newGame.
    expect(store.getState().status).toBe('readonly');
    expect(store.getState().recoveryKind).toBe('future');
    expect(store.getState().reloadNeeded).toBe(true);

    await store.getState().newGame();
    expect(store.getState().game?.yenCents).toBe(yenBefore);
    expect(await db.get('saves', 'backup-before-reset')).toEqual(partieA);
    expect(await db.get('saves', 'current')).toEqual(future);
    expect(store.getState().recoveryKind).toBe('future');
    expect(store.getState().status).toBe('readonly');
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
    store.getState().tap();
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

describe('lot 4 store: migration v3 → v5 (R-L4-1 + R-MV5)', () => {
  it('writer tab keeps the raw v3 in -v3, leaves the lot 3 slot and writes v5', async () => {
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
    const prev = await db.get('saves', 'previous');
    expect((prev as { schemaVersion: number }).schemaVersion).toBe(5);
    expect((prev as { appel: unknown }).appel).toEqual({});
  });
  it('read-only tab migrates in memory only and writes nothing', async () => {
    const { store, name } = setup(false);
    await seed(name, { current: midgameV3 });
    await store.getState().init();
    expect(store.getState().game?.schemaVersion).toBe(5);
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

describe('write failures and read-only export (DEF-GS-56, DEF-GS-57, OBS-053-01)', () => {
  it('importSave reports write-failed and leaves current and backup-before-import unchanged (M16, M22)', async () => {
    const { store, name } = setup();
    await store.getState().init();
    const yenBefore = store.getState().game!.yenCents;
    const revBefore = store.getState().game!.revision;
    const db = await openSaveDb(name);
    const currentBefore = await db.get('saves', 'current');
    const previousBefore = await db.get('saves', 'previous');
    const marker = { ...midgame, yenCents: 7777, tag: 'backup-marker' };
    await db.put('saves', marker, 'backup-before-import');
    const incoming = setup();
    await incoming.store.getState().init();
    incoming.store.setState({
      game: { ...incoming.store.getState().game!, yenCents: 99_999 },
    });
    const valid = await incoming.store.getState().exportSave();
    expect(valid).toBeTruthy();

    // Spying writeSave (the only writer of current + backup-before-import on this
    // path) also proves a two-transaction backup-then-write would fail this test:
    // backup-before-import would already have been overwritten.
    const spy = vi.spyOn(saveDb, 'writeSave').mockRejectedValueOnce(new Error('disk full'));
    const result = await store.getState().importSave(valid!);
    spy.mockRestore();

    expect(result).toEqual({ ok: false, reason: 'write-failed' });
    expect(store.getState().game?.yenCents).toBe(yenBefore);
    expect(store.getState().game?.revision).toBe(revBefore);
    expect(store.getState().status).toBe('ready');
    expect(await db.get('saves', 'current')).toEqual(currentBefore);
    expect(await db.get('saves', 'backup-before-import')).toEqual(marker);
    expect(await db.get('saves', 'previous')).toEqual(previousBefore);
    // DEF-GS-58: the exact player-facing copy, used when reason is write-failed.
    expect(t('saveWriteFailed')).toBe(
      'L’import n’a pas pu être enregistré. Ta partie actuelle n’a pas changé : réessaie.',
    );
  });

  it('newGame keeps the previous game when writeSave fails (M17)', async () => {
    const { store, name } = setup();
    await store.getState().init();
    const yenBefore = store.getState().game!.yenCents;
    const revBefore = store.getState().game!.revision;

    const spy = vi.spyOn(saveDb, 'writeSave').mockRejectedValueOnce(new Error('disk full'));
    await store.getState().newGame();
    spy.mockRestore();

    expect(store.getState().game?.yenCents).toBe(yenBefore);
    expect(store.getState().game?.revision).toBe(revBefore);
    expect(store.getState().status).toBe('ready');
    const db = await openSaveDb(name);
    const current = (await db.get('saves', 'current')) as { yenCents: number; revision: number };
    expect(current.yenCents).toBe(yenBefore);
    expect(current.revision).toBe(revBefore);
  });

  it('a read-only tab exports the on-disk record, not the in-memory v5 snapshot (OBS-053-01)', async () => {
    const { store, name } = setup();
    await seed(name, { current: midgame });
    await store.getState().init();
    expect(store.getState().status).toBe('ready');
    store.setState({
      game: { ...store.getState().game!, yenCents: 12_000 },
    });
    const db = await openSaveDb(name);
    const future = { ...midgame, schemaVersion: 6, yenCents: 42_424 };
    await db.put('saves', future, 'current');
    await store.getState().flush();
    expect(store.getState().status).toBe('readonly');
    expect(store.getState().game?.yenCents).toBe(12_000);

    const text = await store.getState().exportSave();
    expect(text).toBeTruthy();
    const envelope = JSON.parse(text!) as {
      format: string;
      save: { schemaVersion: number; yenCents: number };
    };
    expect(envelope.save.schemaVersion).toBe(6);
    expect(envelope.save.yenCents).toBe(42_424);
    expect(envelope.format).toBe('thegameshow-save');
  });
});
