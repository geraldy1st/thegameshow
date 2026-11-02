import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { ManualClock } from '../core/clock';
import { pull, pullMany } from '../core/gacha';
import { createInitialState } from '../core/state';
import type { GameState } from '../core/types';
import { openSaveDb, type SaveDb } from '../save/db';
import { createGameStore } from './gameStore';

const T0 = new Date(2026, 10, 2, 12, 0, 0).getTime();
let n = 0;

function setup(openDb?: () => Promise<SaveDb>) {
  const name = `ten-${++n}`;
  const store = createGameStore({
    clock: new ManualClock(T0),
    openDb: openDb ?? (() => openSaveDb(name)),
    newSeed: () => 4242,
    acquireWriterLock: async () => true,
    debounceMs: 5,
  });
  return { store, name };
}
const withTickets = (g: GameState, tickets: number, pity = g.gacha.pity): GameState => ({
  ...g,
  tickets,
  gacha: { ...g.gacha, pity },
});

describe('pullMany (P10)', () => {
  it('is exactly pull composed n times, for 300 seeds', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const start = withTickets(createInitialState(T0, seed), 12, seed % 50);
      const r = pullMany(start, 10);
      if (!r.ok) throw new Error('refused');
      let s = start;
      for (let i = 0; i < 10; i++) {
        const one = pull(s);
        if (!one.ok) throw new Error('refused');
        expect(r.results[i]).toEqual(one.last);
        s = one.state;
      }
      expect(r.state).toEqual(s);
      expect(r.state.tickets).toBe(2); // 10 tickets, no bonus draw (R-P43-7)
      expect(r.results).toHaveLength(10);
    }
  });

  it('refuses as a whole below 10 tickets', () => {
    const g = withTickets(createInitialState(T0, 1), 9);
    expect(pullMany(g, 10)).toEqual({ ok: false, reason: 'no-ticket' });
  });

  it('pity 41, fixed seed: the 9th draw is forced to 3 ★ and pity ends at 1 (R-P43-3)', () => {
    // Fixed seed (R-P43-3): no natural 3 ★ before the forced 9th draw, checked below.
    const seed = 1;
    const r = pullMany(withTickets(createInitialState(T0, seed), 10, 41), 10);
    if (!r.ok) throw new Error('refused');
    expect(r.results.map((x) => x.forced)).toEqual([...Array(8).fill(false), true, false]);
    expect(r.state.gacha.pity).toBe(1);
  });
});

describe('store.pullTen (P10)', () => {
  it('one committed write: ten draws stored, ten tickets spent', async () => {
    const { store, name } = setup();
    await store.getState().init();
    store.setState({ game: withTickets(store.getState().game!, 10) });
    await store.getState().flush();
    const r = await store.getState().pullTen();
    if (!r.ok) throw new Error(r.reason);
    const db = await openSaveDb(name);
    const saved = (await db.get('saves', 'current')) as GameState;
    expect(saved.tickets).toBe(0);
    expect(saved.gacha.pulls).toBe(10);
    expect(saved.gacha.last).toEqual(r.results[9]);
    db.close();
  });

  it('a failed write draws nothing (memory and storage restored)', async () => {
    let fail = false;
    const name = `ten-fail-${++n}`;
    const openDb = async () => {
      const db = await openSaveDb(name);
      const tx = db.transaction.bind(db);
      (db as { transaction: unknown }).transaction = ((...a: Parameters<typeof tx>) => {
        if (fail && a[1] === 'readwrite') throw new DOMException('killed', 'AbortError');
        return tx(...a);
      }) as typeof tx;
      return db;
    };
    const { store } = setup(openDb);
    await store.getState().init();
    store.setState({ game: withTickets(store.getState().game!, 10) });
    await store.getState().flush();
    fail = true;
    expect(await store.getState().pullTen()).toEqual({ ok: false, reason: 'write-failed' });
    expect(store.getState().game?.tickets).toBe(10);
    expect(store.getState().game?.gacha.pulls).toBe(0);
  });

  it('below 10 tickets: refused, nothing written', async () => {
    const { store } = setup();
    await store.getState().init();
    expect(await store.getState().pullTen()).toEqual({ ok: false, reason: 'no-ticket' });
    expect(store.getState().game?.tickets).toBe(3);
  });
});
