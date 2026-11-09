import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { ManualClock } from '../core/clock';
import { createInitialState } from '../core/state';
import { openSaveDb, writeSave } from '../save/db';
import { createGameStore } from './gameStore';
import { CALL_DURATION_MS, CALL_COOLDOWN_MS } from '../core/appel';
import { idleGainCentsBetween } from '../core/idle';

let n = 0;
async function ready() {
  const name = `appel-store-${++n}`;
  const T0 = Date.UTC(2026, 10, 9, 12, 0, 0);
  const clock = new ManualClock(T0);
  const db = await openSaveDb(name);
  const base = createInitialState(T0, 1);
  const seeded = {
    ...base,
    gacha: { ...base.gacha, stars: { ...base.gacha.stars, omar: 3 as const, haru: 2 as const } },
    investments: { ...base.investments, save: 2 },
  };
  await writeSave(db, seeded, -1);
  db.close();
  const store = createGameStore({
    clock,
    openDb: () => openSaveDb(name),
    newSeed: () => 1,
    acquireWriterLock: async () => true,
    debounceMs: 5,
  });
  await store.getState().init();
  return { store, clock, T0 };
}

describe('Associés v11 store integration', () => {
  it('startAppel is atomic and idempotent on activationId', async () => {
    const { store } = await ready();
    const id = 'act-1';
    const a = await store.getState().startAppel('omar', id);
    expect(a).toEqual({ ok: true, replay: false });
    const g1 = store.getState().game!;
    expect(g1.appel.omar?.activationId).toBe(id);
    expect(g1.appelReceipts.some((r) => r.activationId === id)).toBe(true);
    const b = await store.getState().startAppel('omar', id);
    expect(b).toEqual({ ok: true, replay: true });
    expect(store.getState().game!.appelReceipts.filter((r) => r.activationId === id)).toHaveLength(
      1,
    );
    const busy = await store.getState().startAppel('omar', 'act-2');
    expect(busy).toEqual({ ok: false, reason: 'busy' });
  });

  it('offline gain only counts call overlap (prorata)', async () => {
    const { store, clock, T0 } = await ready();
    await store.getState().startAppel('haru'); // 30 min
    const g = store.getState().game!;
    const start = T0;
    const end = T0 + 60 * 60_000; // 1 h absence
    const withCall = idleGainCentsBetween(g, start, end);
    const cleared = { ...g, appel: {} };
    const without = idleGainCentsBetween(cleared, start, end);
    expect(withCall).toBeGreaterThan(without);
    // Full hour without call vs half hour boosted: boosted window is CALL_DURATION for haru (2★)=30m
    expect(CALL_DURATION_MS[2]).toBe(30 * 60_000);
    expect(CALL_COOLDOWN_MS).toBe(24 * 60 * 60_000);
    clock.advance(1000);
  });
});
