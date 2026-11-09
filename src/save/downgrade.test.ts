import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { ManualClock } from '../core/clock';
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

describe('GS-V5-65: lossless downgrade v4 -> v3 and back (OD-18)', () => {
  it('true v4 current: deep-equal v3 fields, work restored on return', async () => {
    const fx = load('v4-fresh');
    const { name, db, t0 } = await seed(fx);
    // Plant a real v4 (not migrated) so OD-18 still applies.
    const v4raw = structuredClone(fx.slots.current) as Record<string, unknown>;
    expect(v4raw.schemaVersion).toBe(4);
    await db.put('saves', v4raw, 'current');
    const d = await downgradeCurrentInDb(db);
    expect(d.kind).toBe('downgraded');
    expect(await raw(db, DOWNGRADE_SLOT)).toEqual(v4raw);
    const v3 = await raw(db, 'current');
    expect(v3.schemaVersion).toBe(3);
    expect(validateSaveV3(v3).ok).toBe(true);
    expect(sameV3Fields(v3, v4raw)).toBe(true);
    expect(DOWNGRADE_ANNOUNCEMENT).toBe('Sauvegarde ramenée à la version précédente du jeu');
    const clock = new ManualClock(t0);
    const s2 = lot4(name, clock);
    await s2.getState().init();
    expect(s2.getState().game!.work).toEqual((v4raw as { work: unknown }).work);
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

describe('DEF-GS-28: refuse v5→v3 (no silent appel loss)', () => {
  it('downgradeV4ToV3 refuses schema 5 and keeps the reason', () => {
    const v5 = {
      schemaVersion: 5,
      work: { mode: 'roman', points: 1, pointsTotal: 1, cursor: 0, taps: 1 },
      appel: {
        omar: {
          activatedAt: 1,
          endsAt: 2,
          cooldownUntil: 3,
          wallEndsAt: 4,
          wallCooldownUntil: 5,
          activationId: 'x',
        },
      },
      appelReceipts: [
        { activationId: 'x', associateId: 'omar', activatedAt: 1, endsAt: 2, cooldownUntil: 3 },
      ],
      bike: null,
    };
    const r = downgradeV4ToV3(v5);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/v5 refused/);
  });

  it('downgradeCurrentInDb refuses a live v5 with appel: no write, current intact', async () => {
    const { name, db, t0 } = await seed(load('v4-fresh'));
    const clock = new ManualClock(t0);
    const s1 = lot4(name, clock);
    await s1.getState().init();
    await s1.getState().startAppel('omar'); // may fail if not owned — seed stars via patch
    // Force a v5 current with appel
    const cur = await raw(db, 'current');
    const withAppel = {
      ...cur,
      schemaVersion: 5,
      appel: {
        omar: {
          activatedAt: t0,
          endsAt: t0 + 3600000,
          cooldownUntil: t0 + 86400000,
          wallEndsAt: t0 + 3600000,
          wallCooldownUntil: t0 + 86400000,
          activationId: 'keep-me',
        },
      },
      appelReceipts: [
        {
          activationId: 'keep-me',
          associateId: 'omar',
          activatedAt: t0,
          endsAt: t0 + 3600000,
          cooldownUntil: t0 + 86400000,
        },
      ],
      bike: null,
    };
    await db.put('saves', withAppel, 'current');
    const before = await raw(db, 'current');
    const d = await downgradeCurrentInDb(db);
    expect(d.kind).toBe('refused');
    if (d.kind === 'refused') {
      expect(d.messageFr).toContain('Associés');
      expect(d.messageFr).toContain('rien n’a été modifié');
    }
    expect(await raw(db, 'current')).toEqual(before);
    expect(await raw(db, DOWNGRADE_SLOT)).toEqual(undefined as never);
    expect((await raw(db, 'current')).appel).toEqual(withAppel.appel);
    db.close();
  });
});
