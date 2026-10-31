import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { initialV3Fields } from '../core/state';
import { migrateToCurrent } from './migrations';
import { validateSaveV2, validateSaveV3 } from './schema';
import midgame from './__fixtures__/v2-midgame.json';

/** Valid v2 saves: the mid-game fixture with every business counter drawn at random. */
const v2Save = fc
  .record({
    yenCents: fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }),
    pendingOfflineCents: fc.integer({ min: 0, max: 10 ** 12 }),
    tickets: fc.integer({ min: 0, max: 100_000 }),
    totalClicks: fc.integer({ min: 0, max: 10 ** 9 }),
    save: fc.integer({ min: 0, max: 200 }),
    stock: fc.integer({ min: 0, max: 200 }),
    estate: fc.integer({ min: 0, max: 200 }),
    pity: fc.integer({ min: 0, max: 49 }),
    ren: fc.integer({ min: 0, max: 100 }),
    maxSeenAt: fc.integer({ min: midgame.lastSeenAt, max: midgame.lastSeenAt + 10 ** 10 }),
    revision: fc.integer({ min: 0, max: 10 ** 6 }),
    sound: fc.boolean(),
    reducedMotion: fc.constantFrom('auto', 'on', 'off'),
  })
  .map((r) => ({
    ...midgame,
    revision: r.revision,
    maxSeenAt: r.maxSeenAt,
    yenCents: r.yenCents,
    pendingOfflineCents: r.pendingOfflineCents,
    tickets: r.tickets,
    totalClicks: r.totalClicks,
    investments: { save: r.save, stock: r.stock, estate: r.estate },
    gacha: { ...midgame.gacha, pity: r.pity },
    friends: { ...midgame.friends, ren: { ...midgame.friends.ren, affinity: r.ren } },
    settings: { ...midgame.settings, sound: r.sound, reducedMotion: r.reducedMotion },
  }));

const RUNS = { numRuns: 1000, seed: 77 };

describe('v2 → v3 migration properties (fast-check, 1 000 cases, GS-V5-05)', () => {
  it('every valid v2 migrates to a valid v3 that keeps every v2 field', () => {
    fc.assert(
      fc.property(v2Save, (v2) => {
        fc.pre(validateSaveV2(v2).ok);
        const r = migrateToCurrent(v2);
        if (!r.ok) return false;
        expect(validateSaveV3(r.value).ok).toBe(true);
        const { schemaVersion, profile, energy, stats, wardrobe, ...kept } = r.value;
        expect(schemaVersion).toBe(3);
        expect({ profile, energy, stats, wardrobe }).toEqual(initialV3Fields(v2.maxSeenAt));
        const { schemaVersion: _v, ...v2Kept } = v2;
        void _v;
        expect(kept).toEqual(v2Kept);
        return true;
      }),
      RUNS,
    );
  });
  it('migration is idempotent: migrate(migrate(x)) = migrate(x)', () => {
    fc.assert(
      fc.property(v2Save, (v2) => {
        fc.pre(validateSaveV2(v2).ok);
        const once = migrateToCurrent(v2);
        if (!once.ok) return false;
        expect(migrateToCurrent(once.value)).toEqual(once);
        return true;
      }),
      RUNS,
    );
  });
  it('a negative or fractional counter is always refused, never written', () => {
    fc.assert(
      fc.property(
        v2Save,
        fc.constantFrom('tickets', 'yenCents', 'totalClicks'),
        fc.oneof(fc.integer({ max: -1 }), fc.double({ noInteger: true, noNaN: true })),
        (v2, key, bad) => {
          expect(migrateToCurrent({ ...v2, [key]: bad }).ok).toBe(false);
        },
      ),
      RUNS,
    );
  });
});
