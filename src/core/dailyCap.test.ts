import { describe, expect, it } from 'vitest';
import { createInitialState } from './state';
import type { GameState } from './types';
import { validateSaveV6, ECMA_DATE_MAX } from '../save/schema';
import {
  applyDailyCapOnReplace,
  remainingAtWall,
  remainingCents,
  type CapSource,
} from './dailyCap';
import { MAX_TODAY_SKEW_DAYS, addCivilDays, isUsableNow, isUsableForAnchor } from './dayAnchor';

const GID = '01234567-89ab-4def-8012-3456789abcde';
const GID2 = '11234567-89ab-4def-8012-3456789abcde';

const at = (y: number, m: number, d: number, hh = 0, mm = 0, ss = 0) =>
  Date.UTC(y, m - 1, d, hh, mm, ss);

const NOW_15 = at(2026, 11, 15, 20);
const NOW_14 = at(2026, 11, 14, 12);
const NOW_15_2005 = at(2026, 11, 15, 20, 5);
const NOW_16 = at(2026, 11, 16, 0);
const NOW_15_2359 = at(2026, 11, 15, 23, 59);
const AT_2099 = at(2099, 1, 1, 12);
const NOW_2025_1114 = at(2025, 11, 14, 12);
const NOW_2025_1113 = at(2025, 11, 13, 12);

function rec(
  day: string,
  earned: number,
  maxSeenAt: number,
  opts: { gameId?: string; lastSeenAt?: number; schemaVersion?: number } = {},
): ReturnType<typeof createInitialState> {
  const g = createInitialState(maxSeenAt, 1, opts.gameId ?? GID);
  return {
    ...g,
    schemaVersion: 6,
    maxSeenAt,
    lastSeenAt: opts.lastSeenAt ?? maxSeenAt,
    bike: { ...g.bike, day, earnedTodayCents: earned },
  };
}

const atCap15 = () => rec('2026-11-15', 100_000, NOW_15);
const exportE = () => rec('2026-11-15', 100_000, NOW_15);
function written(
  incoming: GameState,
  replaced: CapSource | null,
  now: number,
  copies: CapSource[] = [],
) {
  const r = applyDailyCapOnReplace(incoming, replaced, now, copies);
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error('expected write');
  return r;
}

describe('dayAnchor helpers (DEF-BT-TA-03)', () => {
  it('MAX_TODAY_SKEW_DAYS is 366 and 15/11/2026 + 366 = 16/11/2027', () => {
    expect(MAX_TODAY_SKEW_DAYS).toBe(366);
    expect(addCivilDays('2026-11-15', 366)).toBe('2027-11-16');
    expect(addCivilDays('2026-11-15', 367)).toBe('2027-11-17');
  });
  it('refuses unusable now (E9) and a 8.64e15 timestamp for the anchor', () => {
    expect(isUsableNow(Number.NaN)).toBe(false);
    expect(isUsableNow(-1)).toBe(false);
    expect(isUsableNow(Number.MAX_SAFE_INTEGER)).toBe(false);
    expect(isUsableNow(NOW_15)).toBe(true);
    expect(isUsableForAnchor(ECMA_DATE_MAX, '2026-11-15')).toBe(false);
    expect(isUsableForAnchor(AT_2099, '2026-11-15')).toBe(false);
  });
});

describe('applyDailyCapOnReplace oracles (note v1.6, Crypto 46/0)', () => {
  it("V1: yesterday export imported today keeps today's 80 000", () => {
    const r = written(
      rec('2026-11-14', 100_000, at(2026, 11, 14, 18)),
      rec('2026-11-15', 80_000, at(2026, 11, 15, 19, 50)),
      NOW_15,
    );
    expect(r.value.bike.day).toBe('2026-11-15');
    expect(r.value.bike.earnedTodayCents).toBe(80_000);
    expect(r.remainingCents).toBe(20_000);
  });

  it('V2: older same-day export does not restore the cap', () => {
    const r = written(
      rec('2026-11-15', 30_000, at(2026, 11, 15, 10)),
      rec('2026-11-15', 80_000, at(2026, 11, 15, 19, 50)),
      NOW_15,
    );
    expect(r.value.bike.earnedTodayCents).toBe(80_000);
    expect(r.remainingCents).toBe(20_000);
  });

  it('V3: tomorrow export does not advance today (incoming stays out of the anchor)', () => {
    const r = written(
      rec('2026-11-16', 100_000, at(2026, 11, 16, 10)),
      rec('2026-11-15', 20_000, at(2026, 11, 15, 19, 50)),
      NOW_15,
    );
    expect(r.today).toBe('2026-11-15');
    expect(r.value.bike.day).toBe('2026-11-15');
    expect(r.value.bike.earnedTodayCents).toBe(100_000);
    expect(r.value.maxSeenAt).toBe(NOW_15);
    expect(remainingAtWall(r.value.bike.day, r.value.bike.earnedTodayCents, NOW_16)).toEqual({
      day: '2026-11-16',
      earnedTodayCents: 0,
      remainingCents: 100_000,
    });
  });

  it('4a/4c: Nouvelle partie or morning export on the same day keeps the cap; 4b is a fresh cap on the 16th', () => {
    const a = written(rec('2026-11-15', 0, NOW_15_2359, { gameId: GID2 }), atCap15(), NOW_15_2359);
    expect(a.value.bike.earnedTodayCents).toBe(100_000);
    expect(a.remainingCents).toBe(0);
    const b = written(exportE(), a.value, NOW_16);
    expect(b.value.bike.day).toBe('2026-11-16');
    expect(b.value.bike.earnedTodayCents).toBe(0);
    expect(b.remainingCents).toBe(100_000);
    const c = written(
      rec('2026-11-15', 0, at(2026, 11, 15, 9), { gameId: GID2 }),
      atCap15(),
      NOW_15_2359,
    );
    expect(c.value.bike.earnedTodayCents).toBe(100_000);
    expect(c.remainingCents).toBe(0);
  });

  it('6a: import during a clock rollback keeps day=15; return-clock remaining is 0', () => {
    const r = written(exportE(), atCap15(), NOW_14);
    expect(r.value.bike.day).toBe('2026-11-15');
    expect(r.value.bike.earnedTodayCents).toBe(100_000);
    expect(r.value.maxSeenAt).toBe(NOW_14);
    expect(
      remainingAtWall(r.value.bike.day, r.value.bike.earnedTodayCents, NOW_15_2005).remainingCents,
    ).toBe(0);
  });

  it('6b: Nouvelle partie during rollback, then import, uses the path copy not incoming.maxSeenAt', () => {
    const np1 = written(rec('2026-11-14', 0, NOW_14, { gameId: GID2 }), atCap15(), NOW_14, [
      atCap15(),
    ]);
    expect(np1.value.bike.day).toBe('2026-11-15');
    expect(np1.value.bike.earnedTodayCents).toBe(100_000);
    const imported = written(exportE(), np1.value, NOW_14, [atCap15()]);
    expect(imported.value.bike.day).toBe('2026-11-15');
    expect(imported.remainingCents).toBe(0);
    expect(imported.value.maxSeenAt).toBe(NOW_14);
    expect(
      remainingAtWall(imported.value.bike.day, imported.value.bike.earnedTodayCents, NOW_15_2005)
        .remainingCents,
    ).toBe(0);
  });

  it('6c is forbidden: G-4 runs before min, so a rollback NP+import does not restore the cap', () => {
    const np1 = written(rec('2026-11-14', 0, NOW_14, { gameId: GID2 }), atCap15(), NOW_14, [
      atCap15(),
    ]);
    const imported = written(exportE(), np1.value, NOW_14, [atCap15()]);
    // A 6c implementation would have written day=14 and paid 100 000 B on return.
    expect(imported.value.bike.day).toBe('2026-11-15');
    expect(imported.value.maxSeenAt).toBe(NOW_14);
    expect(
      remainingAtWall(imported.value.bike.day, imported.value.bike.earnedTodayCents, NOW_15_2005)
        .remainingCents,
    ).toBe(0);
  });

  it('L1 / L5 / L6 / L7 / L8', () => {
    const l1 = written(rec('2026-11-15', 40_000, NOW_15), null, NOW_15);
    expect(l1.remainingCents).toBe(60_000);
    const l5 = written(
      rec('2026-11-15', 10_000, at(2026, 11, 15, 12), { gameId: GID2 }),
      atCap15(),
      NOW_15,
    );
    expect(l5.value.bike.earnedTodayCents).toBe(100_000);
    const l6 = written(
      rec('2026-11-14', 90_000, at(2026, 11, 14, 18)),
      rec('2026-11-14', 80_000, at(2026, 11, 14, 19)),
      NOW_15,
    );
    expect(l6.value.bike.day).toBe('2026-11-15');
    expect(l6.value.bike.earnedTodayCents).toBe(0);
    const l7 = written(rec('2026-11-16', 100_000, at(2026, 11, 15, 10)), atCap15(), NOW_15);
    expect(l7.value.bike.day).toBe('2026-11-15');
    expect(l7.value.bike.earnedTodayCents).toBe(100_000);
    const l8 = written(rec('2026-11-15', 10_000, at(2026, 11, 16, 10)), atCap15(), NOW_15);
    expect(l8.today).toBe('2026-11-15');
    expect(l8.value.bike.day).toBe('2026-11-15');
    expect(l8.value.bike.earnedTodayCents).toBe(100_000);
    expect(l8.value.maxSeenAt).toBe(NOW_15);
    expect(
      remainingAtWall(l8.value.bike.day, l8.value.bike.earnedTodayCents, NOW_16).remainingCents,
    ).toBe(100_000);
  });

  it('L4 / E8-import: an incoming file at 8.64e15 or MAX_SAFE is rejected by validateSaveV6', () => {
    const ok = rec('2026-11-15', 10_000, NOW_15);
    expect(validateSaveV6({ ...ok, maxSeenAt: Number.MAX_SAFE_INTEGER }).ok).toBe(false);
    expect(
      validateSaveV6({ ...ok, maxSeenAt: ECMA_DATE_MAX, lastSeenAt: NOW_15, createdAt: NOW_15 }).ok,
    ).toBe(false);
  });

  it('L9 / L10 / L11a / L11b', () => {
    const pairs: Array<[number, number, number]> = [
      [0, 0, 0],
      [0, 1, 1],
      [1, 0, 1],
      [99_999, 1, 99_999],
      [1, 99_999, 99_999],
      [100_000, 50_000, 100_000],
      [50_000, 100_000, 100_000],
      [100_000, 100_000, 100_000],
    ];
    for (const [a, b, exp] of pairs) {
      const r = written(rec('2026-11-15', b, NOW_15), rec('2026-11-15', a, NOW_15), NOW_15);
      expect(r.value.bike.earnedTodayCents).toBe(exp);
    }
    const before = written(atCap15(), atCap15(), at(2026, 11, 15, 23, 59, 59));
    expect(before.value.bike.day).toBe('2026-11-15');
    expect(before.remainingCents).toBe(0);
    const after = written(atCap15(), atCap15(), NOW_16);
    expect(after.value.bike.day).toBe('2026-11-16');
    expect(after.remainingCents).toBe(100_000);
    const l11a = written(rec('2026-11-15', 0, NOW_15), rec('2026-11-15', 80_000, NOW_15), NOW_15);
    expect(l11a.value.bike.earnedTodayCents).toBe(80_000);
    const v5replaced: CapSource = { schemaVersion: 5, maxSeenAt: NOW_15, bike: null, gameId: GID };
    const l11b = written(rec('2026-11-15', 90_000, NOW_15), v5replaced, NOW_15);
    expect(l11b.value.bike.earnedTodayCents).toBe(90_000);
  });

  it('E5 / E5bis: a second import during the rollback keeps day=15 and remaining 0 on return', () => {
    const first = written(exportE(), atCap15(), NOW_14);
    const e5 = written(exportE(), first.value, NOW_14, []);
    expect(e5.value.bike.day).toBe('2026-11-15');
    expect(e5.value.maxSeenAt).toBe(NOW_14);
    expect(e5.today).toBe('2026-11-15');
    expect(e5.wallToday).toBe('2026-11-14');
    expect(
      remainingAtWall(e5.value.bike.day, e5.value.bike.earnedTodayCents, NOW_15_2005)
        .remainingCents,
    ).toBe(0);
    const e5bis = written(exportE(), first.value, NOW_14, [first.value]);
    expect(e5bis.value.bike.earnedTodayCents).toBe(100_000);
    expect(
      remainingAtWall(e5bis.value.bike.day, e5bis.value.bike.earnedTodayCents, NOW_15_2005)
        .remainingCents,
    ).toBe(0);
  });

  it('E6 / E7: missing or overwritten backup-before-reset falls back to replaced.day', () => {
    const np1 = written(rec('2026-11-14', 0, NOW_14, { gameId: GID2 }), atCap15(), NOW_14, [
      atCap15(),
    ]);
    const e6 = written(exportE(), np1.value, NOW_14, []);
    expect(e6.value.bike.day).toBe('2026-11-15');
    expect(
      remainingAtWall(e6.value.bike.day, e6.value.bike.earnedTodayCents, NOW_15_2005)
        .remainingCents,
    ).toBe(0);
    const e7 = written(rec('2026-11-14', 0, NOW_14, { gameId: GID2 }), np1.value, NOW_14, [
      np1.value,
    ]);
    expect(e7.value.bike.day).toBe('2026-11-15');
    expect(e7.value.bike.earnedTodayCents).toBe(100_000);
    expect(
      remainingAtWall(e7.value.bike.day, e7.value.bike.earnedTodayCents, NOW_15_2005)
        .remainingCents,
    ).toBe(0);
  });

  it('E3 / E6-residu: does not reopen L8 (incoming stays out of the anchor; remaining returns to 100 000)', () => {
    const r = written(exportE(), rec('2026-11-14', 0, NOW_14), NOW_14, []);
    expect(r.today).toBe('2026-11-14');
    expect(r.value.bike.day).toBe('2026-11-14');
    expect(r.value.bike.earnedTodayCents).toBe(100_000);
    expect(
      remainingAtWall(r.value.bike.day, r.value.bike.earnedTodayCents, NOW_15_2005).remainingCents,
    ).toBe(100_000);
  });

  it('E8 / E8bis / E8ter: far-future local observations are dropped, no lock-out, no refused loop', () => {
    const e8 = written(
      rec('2026-11-15', 10_000, NOW_15),
      rec('2026-11-15', 50_000, ECMA_DATE_MAX),
      NOW_15,
    );
    expect(e8.today).toBe('2026-11-15');
    expect(e8.value.bike.earnedTodayCents).toBe(50_000);
    expect(e8.remainingCents).toBe(50_000);
    expect(e8.value.maxSeenAt).toBe(NOW_15);
    const e8bis = written(
      rec('2026-11-15', 10_000, NOW_15),
      rec('2026-11-15', 50_000, AT_2099),
      NOW_15,
    );
    expect(e8bis.value.bike.day).toBe('2026-11-15');
    expect(e8bis.value.bike.earnedTodayCents).toBe(50_000);
    expect(e8bis.value.maxSeenAt).toBe(NOW_15);
    const e8ter = written(
      rec('2026-11-15', 10_000, NOW_15),
      rec('2099-01-01', 50_000, NOW_15),
      NOW_15,
    );
    expect(e8ter.today).toBe('2026-11-15');
    expect(e8ter.value.bike.day).toBe('2026-11-15');
    expect(e8ter.value.bike.earnedTodayCents).toBe(50_000);
  });

  it('bounds 366 inclusive / 367 excluded-with-net / rollback 366 vs 367', () => {
    const incl = written(
      rec('2026-11-15', 10_000, NOW_15),
      rec('2027-11-16', 50_000, NOW_15),
      NOW_15,
    );
    expect(incl.today).toBe('2027-11-16');
    expect(incl.value.bike.earnedTodayCents).toBe(50_000);
    const excl = written(
      rec('2026-11-15', 10_000, NOW_15),
      rec('2027-11-17', 50_000, NOW_15),
      NOW_15,
    );
    expect(excl.today).toBe('2026-11-15');
    expect(excl.value.bike.earnedTodayCents).toBe(50_000);
    const rb366 = written(
      rec('2025-11-14', 0, NOW_2025_1114, { gameId: GID2 }),
      atCap15(),
      NOW_2025_1114,
      [],
    );
    expect(rb366.today).toBe('2026-11-15');
    expect(rb366.value.bike.earnedTodayCents).toBe(100_000);
    expect(
      remainingAtWall(rb366.value.bike.day, rb366.value.bike.earnedTodayCents, NOW_15_2005)
        .remainingCents,
    ).toBe(0);
    const rb367 = written(
      rec('2025-11-13', 0, NOW_2025_1113, { gameId: GID2 }),
      atCap15(),
      NOW_2025_1113,
      [],
    );
    expect(rb367.today).toBe('2025-11-13');
    expect(
      remainingAtWall(rb367.value.bike.day, rb367.value.bike.earnedTodayCents, NOW_15_2005)
        .remainingCents,
    ).toBe(100_000);
  });

  it('E9: unusable now refuses the write and leaves current unchanged', () => {
    for (const now of [Number.NaN, -1, Number.MAX_SAFE_INTEGER]) {
      const r = applyDailyCapOnReplace(exportE(), atCap15(), now);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('unusable-now');
    }
  });

  it('Nouvelle partie does not restore the cap (4a / E7 family)', () => {
    const np = written(rec('2026-11-15', 0, NOW_15, { gameId: GID2 }), atCap15(), NOW_15, [
      atCap15(),
    ]);
    expect(np.value.bike.earnedTodayCents).toBe(100_000);
    expect(np.remainingCents).toBe(0);
    expect(remainingCents(np.value.bike.earnedTodayCents)).toBe(0);
  });
});
