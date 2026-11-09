import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { ManualClock } from '../core/clock';
import { initialV4Fields } from '../core/state';
import { createGameStore } from '../store/gameStore';
import { openSaveDb, type SaveDb } from './db';
import {
  DOWNGRADE_ANNOUNCEMENT,
  DOWNGRADE_SLOT,
  downgradeCurrentInDb as downgradeInDb,
  type DowngradeDb,
  downgradeV4ToV3,
  sameV3Fields,
} from './downgrade';
import { validateSaveV3 } from './schema';

/**
 * GS-V5-65 (OD-18 v1.3, R-L4-17 / R-LOT4-1): Crypto's 4 real v3 saves (built by 5894cb8 from the
 * lot 3 v2 saves) opened by lot 4 and played, plus a new v4 game, then downgraded by the 0.3.2
 * code, then opened again by lot 4.
 */
const FIXTURES = [
  'v3-midgame-migrated',
  'v3-after-restore',
  'v3-fresh',
  'v3-interrupted',
  'v4-fresh',
];
type Fixture = { slots: Record<string, unknown>; now?: number };
const RAW = import.meta.glob<Fixture>('./__fixtures__/recette-lot4/*.json', {
  eager: true,
  import: 'default',
});
const load = (f: string) => structuredClone(RAW[`./__fixtures__/recette-lot4/${f}.json`]!);
const downgradeCurrentInDb = (db: SaveDb) => downgradeInDb(db as unknown as DowngradeDb);

let n = 0;
async function seed(fx: Fixture): Promise<{ name: string; db: SaveDb; t0: number }> {
  const name = `downgrade-${++n}`;
  const db = await openSaveDb(name);
  for (const [slot, v] of Object.entries(fx.slots)) await db.put('saves', v, slot as never);
  const cur = fx.slots.current as { maxSeenAt: number };
  return { name, db, t0: cur.maxSeenAt + 1000 };
}
function lot4(name: string, clock: ManualClock) {
  return createGameStore({
    clock,
    openDb: () => openSaveDb(name),
    newSeed: () => 1,
    acquireWriterLock: async () => true,
    debounceMs: 5,
  });
}
const raw = async (db: SaveDb, slot: string) =>
  db.get('saves', slot as never) as Promise<Record<string, unknown>>;
const withoutWork = (s: Record<string, unknown>) => {
  const rest = { ...s };
  delete rest.work;
  delete rest.appel;
  delete rest.appelReceipts;
  delete rest.bike;
  return rest;
};

describe('GS-V5-65: lossless downgrade v4 -> v3 and back (OD-18)', () => {
  for (const f of FIXTURES) {
    it(`${f}: deep-equal v3 fields, no loss, announcement, then work restored in lot 4`, async () => {
      const { name, db, t0 } = await seed(load(f));
      const clock = new ManualClock(t0);
      // Lot 4 opens the save (v3 -> v4 when needed) and the player writes 5 times.
      const s1 = lot4(name, clock);
      await s1.getState().init();
      expect(s1.getState().status).toBe('ready');
      for (let i = 0; i < 5; i++) {
        clock.advance(100);
        expect(s1.getState().tap(1).accepted).toBe(true);
      }
      expect(await s1.getState().flush()).toBe(true);
      const v4 = await raw(db, 'current');
      expect(v4.schemaVersion).toBe(5);
      expect((v4.work as { taps: number }).taps).toBe(5);

      // 0.3.2: one transaction, raw v4 kept, current = v4 minus work.
      const d = await downgradeCurrentInDb(db);
      expect(d.kind).toBe('downgraded');
      expect(await raw(db, DOWNGRADE_SLOT)).toEqual(v4);
      const v3 = await raw(db, 'current');
      expect(v3).toEqual({
        ...withoutWork(v4),
        schemaVersion: 3,
        revision: (v4.revision as number) + 1,
      });
      expect(validateSaveV3(v3).ok).toBe(true);
      expect(sameV3Fields(v3, v4)).toBe(true);
      expect(DOWNGRADE_ANNOUNCEMENT).toBe('Sauvegarde ramenée à la version précédente du jeu');
      // Idempotent: a second open of 0.3.2 writes nothing.
      expect((await downgradeCurrentInDb(db)).kind).toBe('none');

      // Back to lot 4 (same moment): work restored, v3 fields unchanged.
      const s2 = lot4(name, clock);
      await s2.getState().init();
      const g = s2.getState().game!;
      expect(g.work).toEqual(v4.work);
      expect(sameV3Fields(g, v4)).toBe(true);
      db.close();
    });
  }

  it('progress made in 0.3.2 is kept; work then starts again at its initial value', async () => {
    const { name, db, t0 } = await seed(load('v4-fresh'));
    const clock = new ManualClock(t0);
    const s1 = lot4(name, clock);
    await s1.getState().init();
    clock.advance(100);
    s1.getState().tap(1);
    await s1.getState().flush();
    await downgradeCurrentInDb(db);
    const v3 = await raw(db, 'current');
    await db.put('saves', { ...v3, tickets: (v3.tickets as number) + 2 }, 'current');
    const s2 = lot4(name, clock);
    await s2.getState().init();
    expect(s2.getState().game!.tickets).toBe((v3.tickets as number) + 2);
    expect(s2.getState().game!.work).toEqual(initialV4Fields().work);
    db.close();
  });

  it('writes nothing for a v3 current or an unreadable v4', async () => {
    const { db } = await seed(load('v3-fresh'));
    const before = await raw(db, 'current');
    expect((await downgradeCurrentInDb(db)).kind).toBe('none');
    expect(await raw(db, 'current')).toEqual(before);
    await db.put('saves', { schemaVersion: 4, junk: true }, 'current');
    expect((await downgradeCurrentInDb(db)).kind).toBe('invalid');
    expect(await raw(db, DOWNGRADE_SLOT)).toBeUndefined();
    expect(downgradeV4ToV3({ ...before, schemaVersion: 4 }).ok).toBe(false); // no work
    db.close();
  });
});
