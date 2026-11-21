import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { ManualClock } from '../core/clock';
import { createInitialState } from '../core/state';
import { remainingAtWall } from '../core/dailyCap';
import { openSaveDb, writeSave } from '../save/db';
import { createGameStore } from './gameStore';

const GID = '01234567-89ab-4def-8012-3456789abcde';
const NOW_15 = Date.UTC(2026, 10, 15, 20);
const NOW_14 = Date.UTC(2026, 10, 14, 12);
const NOW_15_2005 = Date.UTC(2026, 10, 15, 20, 5);

describe('Nouvelle partie no longer restores the bike cap (NV6-14 / G-4)', () => {
  it('keeps earnedTodayCents at the cap when a new game is started the same day or during a rollback', async () => {
    const name = `np-cap-${Date.now()}`;
    const db = await openSaveDb(name);
    const g = createInitialState(NOW_15, 1, GID);
    const atCap = {
      ...g,
      maxSeenAt: NOW_15,
      lastSeenAt: NOW_15,
      bike: { ...g.bike, day: '2026-11-15', earnedTodayCents: 100_000 },
    };
    await writeSave(db, atCap, -1);
    db.close();

    const clock = new ManualClock(NOW_14);
    const store = createGameStore({
      clock,
      openDb: () => openSaveDb(name),
      newSeed: () => 2,
      acquireWriterLock: async () => true,
      debounceMs: 5,
    });
    await store.getState().init();
    expect(store.getState().game?.bike.earnedTodayCents).toBe(100_000);
    await store.getState().newGame();
    const after = store.getState().game!;
    expect(after.bike.day).toBe('2026-11-15');
    expect(after.bike.earnedTodayCents).toBe(100_000);
    expect(after.maxSeenAt).toBe(NOW_14);
    expect(
      remainingAtWall(after.bike.day, after.bike.earnedTodayCents, NOW_15_2005).remainingCents,
    ).toBe(0);
  });
});
