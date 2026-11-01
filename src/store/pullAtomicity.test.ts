import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { ManualClock } from '../core/clock';
import { ASSOCIATES } from '../data/balance';
import { loadSave, openSaveDb } from '../save/db';
import { createGameStore } from './gameStore';

/**
 * DEF-GS-15: ticket, draw (history/stars/rng) and pity are one state written by ONE put in ONE
 * readwrite transaction. A "reload" at any point (a second reader that opens the same database
 * while the draw is in flight) sees either the whole draw or nothing, never a debited ticket with
 * a stale pity. The pity after the draw must follow the RARITY of the drawn associate (a natural
 * 3-rarity draw resets it to 0, which is what the flaky e2e oracle missed).
 */
const T0 = new Date(2026, 9, 25, 12, 0, 0).getTime();
const rarityOf = (id: string) => ASSOCIATES.find((a) => a.id === id)!.rarity;

describe('draw atomicity (DEF-GS-15)', () => {
  it('a reader racing the draw sees all of it or none of it, for 200 seeds', async () => {
    let threes = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const name = `atom-${seed}`;
      const store = createGameStore({
        clock: new ManualClock(T0),
        openDb: () => openSaveDb(name),
        newSeed: () => seed,
        acquireWriterLock: async () => true,
        debounceMs: 5,
      });
      await store.getState().init();
      const before = store.getState().game!;
      const db = await openSaveDb(name);
      // Readers interleaved with the write at several points (before, during, after commit).
      const inFlight = store.getState().pull();
      const seen = [await loadSave(db)];
      await Promise.resolve();
      seen.push(await loadSave(db));
      const r = await inFlight;
      seen.push(await loadSave(db));
      if (!r.ok) throw new Error(r.reason);
      for (const s of seen) {
        if (s.kind !== 'ok') throw new Error(s.kind);
        const g = s.save;
        const drawn = g.gacha.pulls === before.gacha.pulls + 1;
        if (!drawn) {
          expect(g.tickets).toBe(before.tickets);
          expect(g.gacha).toEqual(before.gacha);
          expect(g.rng).toEqual(before.rng);
          continue;
        }
        expect(g.tickets).toBe(before.tickets - 1);
        expect(g.gacha.last).toEqual(r.last);
        expect(g.gacha.pity).toBe(rarityOf(r.last.id) === 3 ? 0 : before.gacha.pity + 1);
      }
      const final = seen[2];
      if (final?.kind === 'ok') expect(final.save.gacha.pulls).toBe(before.gacha.pulls + 1);
      if (rarityOf(r.last.id) === 3) threes++;
      db.close();
    }
    // Sanity: some seeds draw a natural 3-rarity associate (pity 0 is then correct).
    expect(threes).toBeGreaterThan(0);
  });

  it('the draw is a single put of `current` (plus the `previous` copy) in one transaction', async () => {
    const name = 'atom-puts';
    const store = createGameStore({
      clock: new ManualClock(T0),
      openDb: async () => {
        const db = await openSaveDb(name);
        const orig = db.transaction.bind(db);
        (db as unknown as { transaction: unknown }).transaction = (
          ...a: Parameters<typeof orig>
        ) => {
          const tx = orig(...a);
          txs.push(tx);
          return tx;
        };
        return db;
      },
      newSeed: () => 9,
      acquireWriterLock: async () => true,
      debounceMs: 5,
    });
    const txs: unknown[] = [];
    await store.getState().init();
    txs.length = 0;
    const r = await store.getState().pull();
    expect(r.ok).toBe(true);
    expect(txs).toHaveLength(1);
  });
});
