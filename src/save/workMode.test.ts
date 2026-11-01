import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { ManualClock } from '../core/clock';
import type { GameState } from '../core/types';
import { createGameStore } from '../store/gameStore';
import { openSaveDb, type SaveDb } from './db';
import { DOWNGRADE_SLOT, downgradeCurrentInDb, type DowngradeDb } from './downgrade';
import { serializeExport } from './exportImport';
import { validateSaveV4 } from './schema';
import V4 from './__fixtures__/v4-midgame.json';

/**
 * Patch 0.4.2, R-P42-4 / GS-V5-74: a v4 save in `presse` (0.4.1) becomes `roman` with the
 * cursor at 0 on load, on import and on the way back from 0.3.2; points, total and taps are
 * untouched. The normalisation adds no write of its own: it rides on the store's load write
 * (one write, revision + 1), and a reload finds `roman` and has nothing more to convert.
 */
const WORK = { mode: 'presse', cursor: 37, points: 456, pointsTotal: 9_876, taps: 1_234 };
const presse = (): GameState =>
  ({
    ...structuredClone(V4),
    work: { ...structuredClone(V4).work, ...WORK },
  }) as unknown as GameState;
const roman = (): GameState =>
  ({ ...structuredClone(V4), work: { ...structuredClone(V4).work, mode: 'roman' } }) as GameState;

let n = 0;
async function setup(current?: unknown) {
  const name = `workmode-${++n}`;
  const db = await openSaveDb(name);
  if (current !== undefined) await db.put('saves', current, 'current');
  const clock = new ManualClock(V4.maxSeenAt + 1000);
  const store = () =>
    createGameStore({
      clock,
      openDb: () => openSaveDb(name),
      newSeed: () => 1,
      acquireWriterLock: async () => true,
      debounceMs: 5,
    });
  return { db, store };
}
const cur = async (db: SaveDb) => (await db.get('saves', 'current')) as unknown as GameState;
const kept = (g: GameState) => ({
  points: g.work.points,
  pointsTotal: g.work.pointsTotal,
  taps: g.work.taps,
  totalClicks: g.totalClicks,
});

describe('presse → roman (patch 0.4.2, R-P42-4)', () => {
  it('the v4 schema still accepts presse', () => {
    expect(validateSaveV4(presse()).ok).toBe(true);
  });

  it('load: roman, cursor 0, the rest intact; written once, then stable', async () => {
    const src = presse();
    const { db, store } = await setup(src);
    const s1 = store();
    await s1.getState().init();
    const g = s1.getState().game!;
    expect(g.work).toMatchObject({ mode: 'roman', cursor: 0 });
    expect(kept(g)).toEqual(kept(src));
    const after1 = await cur(db);
    expect(after1.work).toMatchObject({ mode: 'roman', cursor: 0 });
    expect(after1.revision).toBe(src.revision + 1); // one write
    // Reload: already roman; the stored work does not change any more.
    const s2 = store();
    await s2.getState().init();
    expect((await cur(db)).work).toEqual(after1.work);
    db.close();
  });

  it('load of a roman save: same write count as before 0.4.2, work unchanged', async () => {
    const src = roman();
    const { db, store } = await setup(src);
    const s = store();
    await s.getState().init();
    const after = await cur(db);
    expect(after.work).toEqual(src.work);
    expect(after.revision).toBe(src.revision + 1); // the usual load write, nothing more
    db.close();
  });

  it('import of a 0.4.1 export in presse: roman, cursor 0, the rest intact', async () => {
    const { db, store } = await setup(roman());
    const s = store();
    await s.getState().init();
    const rev = (await cur(db)).revision;
    const r = await s.getState().importSave(serializeExport(presse()));
    expect(r).toEqual({ ok: true });
    const stored = await cur(db);
    expect(stored.work).toMatchObject({ mode: 'roman', cursor: 0 });
    expect(kept(stored)).toEqual(kept(presse()));
    expect(stored.revision).toBe(rev + 1); // one write
    db.close();
  });

  it('back from 0.3.2 with a presse v4 kept aside: roman, cursor 0, the rest intact', async () => {
    const src = presse();
    const { db, store } = await setup(src);
    const d = await downgradeCurrentInDb(db as unknown as DowngradeDb);
    expect(d.kind).toBe('downgraded');
    expect(((await db.get('saves', DOWNGRADE_SLOT)) as GameState).work.mode).toBe('presse');
    const s = store();
    await s.getState().init();
    const g = s.getState().game!;
    expect(g.work).toMatchObject({ mode: 'roman', cursor: 0 });
    expect(kept(g)).toEqual(kept(src));
    expect((await cur(db)).work.mode).toBe('roman');
    db.close();
  });
});
