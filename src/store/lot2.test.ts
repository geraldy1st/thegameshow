import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { ManualClock } from '../core/clock';
import { openSaveDb, type SaveDb } from '../save/db';
import { createGameStore } from './gameStore';

const T0 = new Date(2026, 9, 25, 12, 0, 0).getTime();
let n = 0;

function setup(
  name = `lot2-${++n}`,
  opts: { writer?: boolean; openDb?: () => Promise<SaveDb> } = {},
) {
  const clock = new ManualClock(T0);
  const store = createGameStore({
    clock,
    openDb: opts.openDb ?? (() => openSaveDb(name)),
    newSeed: () => 777,
    acquireWriterLock: async () => opts.writer ?? true,
    debounceMs: 5,
  });
  return { store, clock, name };
}

const stored = async (name: string) =>
  (await (await openSaveDb(name)).get('saves', 'current')) as {
    tickets: number;
    revision: number;
    gacha: { pity: number; pulls: number; stars: Record<string, number>; last: unknown };
    rng: { state: number };
    totalClicks: number;
  };

describe('draw is stored before the reveal (RES-2, GS-CA17)', () => {
  it('point 2/3: the result is in IndexedDB when pull() resolves; a reload shows it once', async () => {
    const { store, name } = setup();
    await store.getState().init();
    const r = await store.getState().pull();
    if (!r.ok) throw new Error(r.reason);
    // "killed" during or after the animation: a fresh tab reads the same result.
    const s = await stored(name);
    expect(s.tickets).toBe(2);
    expect(s.gacha.pulls).toBe(1);
    expect(s.gacha.last).toEqual(r.last);
    const reloaded = setup(name).store;
    await reloaded.getState().init();
    expect(reloaded.getState().game?.gacha.last).toEqual(r.last);
    expect(reloaded.getState().game?.tickets).toBe(2);
  });

  it('no reroll: the next pull after a reload equals the next pull without reload', async () => {
    const a = setup();
    await a.store.getState().init();
    await a.store.getState().pull();
    const b = setup(a.name).store; // reload (tab A gone)
    await b.getState().init();
    const viaReload = await b.getState().pull();

    const c = setup();
    await c.store.getState().init();
    await c.store.getState().pull();
    const direct = await c.store.getState().pull();
    expect(viaReload.ok && viaReload.last.id).toBe(direct.ok && direct.last.id);
  });

  it('point 1: the write fails (app killed before commit) => no reveal, nothing lost', async () => {
    const name = `lot2-${++n}`;
    let failWrites = false;
    const openDb = async () => {
      const db = await openSaveDb(name);
      const tx = db.transaction.bind(db);
      (db as { transaction: unknown }).transaction = ((...args: Parameters<typeof tx>) => {
        if (failWrites && args[1] === 'readwrite') throw new DOMException('killed', 'AbortError');
        return tx(...args);
      }) as typeof tx;
      return db;
    };
    const { store } = setup(name, { openDb });
    await store.getState().init();
    failWrites = true;
    const r = await store.getState().pull();
    expect(r).toEqual({ ok: false, reason: 'write-failed' });
    expect(store.getState().game?.tickets).toBe(3); // memory rolled back
    expect((await stored(name)).tickets).toBe(3);
    expect((await stored(name)).gacha.pulls).toBe(0);
  });

  it('refuses without tickets and writes nothing', async () => {
    const { store, name } = setup();
    await store.getState().init();
    for (let i = 0; i < 3; i++) await store.getState().pull();
    const rev = (await stored(name)).revision;
    expect(await store.getState().pull()).toEqual({ ok: false, reason: 'no-ticket' });
    expect((await stored(name)).revision).toBe(rev);
  });
});

describe('two tabs (GS-CA15)', () => {
  it('a stale tab cannot pull: no reveal, and it shows the stored state', async () => {
    const a = setup();
    await a.store.getState().init();
    const b = setup(a.name).store;
    await b.getState().init();
    await b.getState().pull(); // B writes rev 2
    const r = await a.store.getState().pull(); // A still expects rev 1
    expect(r.ok).toBe(false);
    expect(a.store.getState().status).toBe('readonly');
    expect(a.store.getState().game?.gacha.pulls).toBe(1); // B's pull, from storage
    expect((await stored(a.name)).gacha.pulls).toBe(1);
  });

  it('unsaved clicks of a stale tab are replaced by the stored state (lot 1 note)', async () => {
    const a = setup();
    await a.store.getState().init();
    const b = setup(a.name).store;
    await b.getState().init();
    await b.getState().claimQuest('click'); // nothing to claim: no write
    await b.getState().answerQuiz(1); // B writes
    for (let i = 0; i < 10; i++) a.store.getState().click();
    expect(a.store.getState().game?.totalClicks).toBe(10);
    await a.store.getState().flush();
    expect(a.store.getState().status).toBe('readonly');
    expect(a.store.getState().game?.totalClicks).toBe(0);
    expect(a.store.getState().game?.quests.quizChoice).toBe(1);
  });

  it('a quest claim is idempotent across a double tap', async () => {
    const { store, name } = setup();
    await store.getState().init();
    await store.getState().answerQuiz(2);
    const [x, y] = await Promise.all([
      store.getState().claimQuest('quiz'),
      store.getState().claimQuest('quiz'),
    ]);
    expect([x, y].filter(Boolean)).toHaveLength(1);
    expect((await stored(name)).tickets).toBe(5);
  });
});

describe('friends and quests through the store', () => {
  it('visits count 3 times per friend per day and validate the visit quest', async () => {
    const { store, clock } = setup();
    await store.getState().init();
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await store.getState().visit('ren'));
    expect(results.map((r) => r?.counted)).toEqual([true, true, true, false]);
    expect(store.getState().game?.friends.ren.affinity).toBe(15);
    expect(store.getState().game?.quests.progress.visit).toBe(1);
    clock.advance(24 * 3_600_000);
    expect((await store.getState().visit('ren'))?.counted).toBe(true);
  });
});

describe('restore the backup kept before a reset', () => {
  it('a new game keeps the old save, which can be restored', async () => {
    const { store } = setup();
    await store.getState().init();
    await store.getState().pull();
    await store.getState().newGame();
    expect(store.getState().game?.gacha.pulls).toBe(0);
    const b = await store.getState().resetBackup();
    expect(b.kind).toBe('ok');
    expect(await store.getState().restoreResetBackup()).toBe(true);
    expect(store.getState().game?.gacha.pulls).toBe(1);
  });
  it('an unreadable backup is reported, never restored', async () => {
    const name = `lot2-${++n}`;
    const db = await openSaveDb(name);
    await db.put('saves', { junk: true }, 'current');
    const { store } = setup(name);
    await store.getState().init();
    await store.getState().newGame();
    expect((await store.getState().resetBackup()).kind).toBe('unreadable');
    expect(await store.getState().restoreResetBackup()).toBe(false);
  });
});
