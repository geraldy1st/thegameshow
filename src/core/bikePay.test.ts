import { describe, expect, it } from 'vitest';
import { isCalendarDay, ManualClock } from './clock';
import {
  BIKE_PAY,
  BIKE_STAT_IDS,
  grossCents,
  progressDelta,
  settle,
  type BikePayState,
  type BikeStatValues,
} from './bikePay';
import { MAX_STAT } from '../data/balance';

/** Local calendar instants, so D1 tests do not depend on the runner's time zone. */
const atLocal = (y: number, m: number, d: number, hh = 12, mm = 0, ss = 0, ms = 0): number =>
  new Date(y, m, d, hh, mm, ss, ms).getTime();
const T0 = atLocal(2026, 10, 15);
const fresh = (earned = 0, day = '2026-11-15'): BikePayState => ({
  day,
  earnedTodayCents: earned,
});

describe('bikePay economy (raw, no boosts)', () => {
  it('pays 2\u00a0B per coin plus 100\u00a0B on success, capped at the daily remainder', () => {
    const r = settle('success', 20, fresh(), T0, T0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.paidCents).toBe(14_000);
    expect(r.capped).toBe(false);
    expect(r.newState.earnedTodayCents).toBe(14_000);
  });

  it('on failure pays collected coins only, never the 100\u00a0B bonus', () => {
    const r = settle('fail', 20, fresh(), T0, T0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.paidCents).toBe(4_000);
    expect(grossCents('fail', 20)).toBe(4_000);
    expect(grossCents('success', 20)).toBe(14_000);
  });

  it('abandon always pays 0 and leaves state untouched, even with 20 coins', () => {
    const state = fresh(500);
    const r = settle('abandon', 20, state, T0, T0);
    expect(r).toEqual({ ok: true, paidCents: 0, capped: false, newState: state });
  });

  it('rejects a coin count outside 0..20 (21 is refused, not clamped)', () => {
    expect(settle('success', 21, fresh(), T0, T0)).toEqual({
      ok: false,
      reason: 'invalid-coins',
    });
    expect(settle('success', -1, fresh(), T0, T0).ok).toBe(false);
    expect(settle('success', 1.5, fresh(), T0, T0).ok).toBe(false);
  });

  it.each([0, 1, 19, 20] as const)(
    'success and fail for %i coins, remainder 0/1/139/140/141\u00a0B',
    (p) => {
      const grossS = 200 * p + 10_000;
      const grossF = 200 * p;
      for (const remainBucks of [0, 1, 139, 140, 141]) {
        const earned = BIKE_PAY.dailyCapCents - remainBucks * 100;
        const success = settle('success', p, fresh(earned), T0, T0);
        const fail = settle('fail', p, fresh(earned), T0, T0);
        expect(success.ok && fail.ok).toBe(true);
        if (!success.ok || !fail.ok) return;
        expect(success.paidCents).toBe(Math.min(grossS, remainBucks * 100));
        expect(fail.paidCents).toBe(Math.min(grossF, remainBucks * 100));
        expect(success.paidCents).toBeGreaterThanOrEqual(0);
        expect(success.newState.earnedTodayCents).toBeLessThanOrEqual(BIKE_PAY.dailyCapCents);
      }
    },
  );

  it('never applies a multiplier: 20-coin success is exactly 14 000 cents', () => {
    // Mutant: wiring bonusMultiplier / appel "all" / work boost must fail this test.
    const r = settle('success', 20, fresh(), T0, T0);
    if (!r.ok) throw new Error('expected settlement');
    expect(r.paidCents).toBe(14_000);
  });
});

describe('bikePay day rule (D1, day of end)', () => {
  it('a run that crosses midnight is paid on the end day and can reset the counter', () => {
    const clock = new ManualClock(atLocal(2026, 10, 15, 23, 59, 59, 999));
    const started: BikePayState = { day: '2026-11-15', earnedTodayCents: 100_000 };
    clock.set(atLocal(2026, 10, 16, 0, 0, 0, 0));
    const end = clock.now();
    const r = settle('success', 20, started, end, end);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.newState.day).toBe('2026-11-16');
    expect(r.paidCents).toBe(14_000);
    expect(r.newState.earnedTodayCents).toBe(14_000);
  });

  it('does not reset when now is before maxSeenAt (clock rollback); remainder is paid', () => {
    const state = fresh(99_000);
    const maxSeen = T0;
    const earlier = T0 - 3_600_000;
    const r = settle('success', 20, state, earlier, maxSeen);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.newState.day).toBe('2026-11-15');
    expect(r.paidCents).toBe(1_000);
    expect(r.capped).toBe(true);
    expect(r.newState.earnedTodayCents).toBe(100_000);
  });

  it('does not reset when the stored day is still today, even if maxSeenAt is older', () => {
    const r = settle('fail', 5, fresh(2_000), T0 + 1_000, T0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.newState.day).toBe('2026-11-15');
    expect(r.paidCents).toBe(1_000);
    expect(r.newState.earnedTodayCents).toBe(3_000);
  });

  it('rejects earnedTodayCents above the daily cap (P11)', () => {
    expect(settle('success', 0, fresh(BIKE_PAY.dailyCapCents + 1), T0, T0)).toEqual({
      ok: false,
      reason: 'invalid-state',
    });
    expect(settle('fail', 0, fresh(-1), T0, T0).ok).toBe(false);
  });

  it('abandon neither rolls the day nor pays, even with 21 coins or a later day (P16, P17)', () => {
    const state = fresh(500);
    const later = atLocal(2026, 10, 16, 12);
    expect(settle('abandon', 20, state, later, later)).toEqual({
      ok: true,
      paidCents: 0,
      capped: false,
      newState: state,
    });
    expect(settle('abandon', 21, state, T0, T0)).toEqual({
      ok: true,
      paidCents: 0,
      capped: false,
      newState: state,
    });
  });

  it('rolls the counter on the local calendar day, not the UTC date (P20)', () => {
    const morning = atLocal(2026, 10, 16, 0, 30);
    const evening = atLocal(2026, 10, 16, 22, 0);
    const prior = fresh(50_000, '2026-11-15');
    const am = settle('fail', 0, prior, morning, morning);
    expect(am.ok).toBe(true);
    if (!am.ok) return;
    expect(am.newState.day).toBe('2026-11-16');
    expect(am.paidCents).toBe(0);
    expect(am.newState.earnedTodayCents).toBe(0);
    const pm = settle('fail', 0, prior, evening, evening);
    expect(pm.ok).toBe(true);
    if (!pm.ok) return;
    expect(pm.newState.day).toBe('2026-11-16');
    expect(pm.newState.earnedTodayCents).toBe(0);
  });
});

const stats = (sante = 0, bonheur = 0, repu = 0): BikeStatValues => ({
  sante,
  bonheur,
  repu,
});

describe('bikePay progressDelta (G-1 = C, 17:13)', () => {
  it('applies +1 Santé, +1 Bonheur and +1 Réputation in one success call', () => {
    const r = progressDelta('success', stats(3, 8, 12));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.successes).toBe(1);
    expect(r.failures).toBe(0);
    expect(r.deltas).toEqual({ sante: 1, bonheur: 1, repu: 1 });
    expect(r.next).toEqual({ sante: 4, bonheur: 9, repu: 13 });
    expect(BIKE_STAT_IDS).toEqual(['sante', 'bonheur', 'repu']);
  });

  it('a failure increments failures only and leaves all three skills unchanged', () => {
    const before = stats(7, 7, 7);
    const r = progressDelta('fail', before);
    expect(r).toEqual({
      ok: true,
      successes: 0,
      failures: 1,
      deltas: { sante: 0, bonheur: 0, repu: 0 },
      next: before,
    });
  });

  it('abandon increments nothing and leaves skills unchanged', () => {
    const before = stats(1, 2, 3);
    const r = progressDelta('abandon', before);
    expect(r).toEqual({
      ok: true,
      successes: 0,
      failures: 0,
      deltas: { sante: 0, bonheur: 0, repu: 0 },
      next: before,
    });
  });

  it('a skill at 99 goes to 100 while the other two rise normally', () => {
    const r = progressDelta('success', stats(99, 4, 10));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.deltas).toEqual({ sante: 1, bonheur: 1, repu: 1 });
    expect(r.next).toEqual({ sante: 100, bonheur: 5, repu: 11 });

    const r2 = progressDelta('success', stats(4, 99, 10));
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.next).toEqual({ sante: 5, bonheur: 100, repu: 11 });

    const r3 = progressDelta('success', stats(4, 10, 99));
    expect(r3.ok).toBe(true);
    if (!r3.ok) return;
    expect(r3.next).toEqual({ sante: 5, bonheur: 11, repu: 100 });
  });

  it('a skill at 100 stays at 100 while the other two still get +1', () => {
    const r = progressDelta('success', stats(100, 4, 10));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.successes).toBe(1);
    expect(r.deltas).toEqual({ sante: 0, bonheur: 1, repu: 1 });
    expect(r.next).toEqual({ sante: 100, bonheur: 5, repu: 11 });
    expect(r.next.sante).toBe(MAX_STAT);

    const r2 = progressDelta('success', stats(4, 100, 10));
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.deltas).toEqual({ sante: 1, bonheur: 0, repu: 1 });
    expect(r2.next).toEqual({ sante: 5, bonheur: 100, repu: 11 });

    const r3 = progressDelta('success', stats(4, 10, 100));
    expect(r3.ok).toBe(true);
    if (!r3.ok) return;
    expect(r3.deltas).toEqual({ sante: 1, bonheur: 1, repu: 0 });
    expect(r3.next).toEqual({ sante: 5, bonheur: 11, repu: 100 });
  });

  it('all three already at 100 stay at 100; the success is still counted', () => {
    const r = progressDelta('success', stats(100, 100, 100));
    expect(r).toEqual({
      ok: true,
      successes: 1,
      failures: 0,
      deltas: { sante: 0, bonheur: 0, repu: 0 },
      next: { sante: 100, bonheur: 100, repu: 100 },
    });
  });

  it('rejects a skill value outside 0..MAX_STAT', () => {
    expect(progressDelta('success', stats(-1, 0, 0)).ok).toBe(false);
    expect(progressDelta('success', stats(0, 101, 0))).toEqual({
      ok: false,
      reason: 'invalid-stats',
    });
    expect(progressDelta('success', stats(0, 0, 1.5)).ok).toBe(false);
  });

  it('a success at 0 paid still gives +1; a failure at 0 paid gives 0 (option a)', () => {
    const atCap = settle('success', 20, fresh(BIKE_PAY.dailyCapCents), T0, T0);
    expect(atCap.ok).toBe(true);
    if (!atCap.ok) return;
    expect(atCap.paidCents).toBe(0);
    const win = progressDelta('success', stats(3, 8, 12));
    expect(win.ok).toBe(true);
    if (!win.ok) return;
    expect(win.successes).toBe(1);
    expect(win.failures).toBe(0);
    expect(win.deltas).toEqual({ sante: 1, bonheur: 1, repu: 1 });
    expect(win.next).toEqual({ sante: 4, bonheur: 9, repu: 13 });

    const losePay = settle('fail', 0, fresh(BIKE_PAY.dailyCapCents), T0, T0);
    expect(losePay.ok).toBe(true);
    if (!losePay.ok) return;
    expect(losePay.paidCents).toBe(0);
    const lose = progressDelta('fail', stats(3, 8, 12));
    expect(lose.ok).toBe(true);
    if (!lose.ok) return;
    expect(lose.successes).toBe(0);
    expect(lose.failures).toBe(1);
    expect(lose.deltas).toEqual({ sante: 0, bonheur: 0, repu: 0 });
    expect(lose.next).toEqual({ sante: 3, bonheur: 8, repu: 12 });
  });
});

describe('bikePay day rule mutants and invalid dates (R-I1-05, P05, P07)', () => {
  it('does not reset on a clock rollback that crosses a day boundary (P05)', () => {
    // Stored day is yesterday at the cap. nowCal is today, but earlier than maxSeenAt
    // (also today). Without the rollback guard the later calendar day would reset and
    // pay 14 000 cents; with the guard the cap still applies and the run pays 0.
    const state: BikePayState = { day: '2026-11-15', earnedTodayCents: 100_000 };
    const maxSeen = atLocal(2026, 10, 16, 18);
    const nowCal = atLocal(2026, 10, 16, 10);
    const r = settle('success', 20, state, nowCal, maxSeen);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.newState.day).toBe('2026-11-15');
    expect(r.paidCents).toBe(0);
    expect(r.capped).toBe(true);
    expect(r.newState.earnedTodayCents).toBe(100_000);
  });

  it('does not reset when the stored day is still after today (P07)', () => {
    // today !== state.day would wrongly reset a future stored day.
    const state: BikePayState = { day: '2026-11-17', earnedTodayCents: 50_000 };
    const r = settle('success', 20, state, T0, T0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.newState.day).toBe('2026-11-17');
    expect(r.paidCents).toBe(14_000);
    expect(r.newState.earnedTodayCents).toBe(64_000);
  });

  it('rejects a non-calendar date such as 2026-02-30', () => {
    expect(isCalendarDay('2026-02-30')).toBe(false);
    expect(isCalendarDay('2026-02-29')).toBe(false);
    expect(isCalendarDay('2026-02-28')).toBe(true);
    expect(isCalendarDay('2024-02-29')).toBe(true);
    expect(isCalendarDay('2026-13-01')).toBe(false);
    expect(isCalendarDay('2026-11-15')).toBe(true);
    expect(settle('success', 0, { day: '2026-02-30', earnedTodayCents: 0 }, T0, T0)).toEqual({
      ok: false,
      reason: 'invalid-state',
    });
    expect(settle('success', 0, { day: '2026-02-29', earnedTodayCents: 0 }, T0, T0).ok).toBe(false);
  });
});

describe('P04 remaining clamp is equivalent', () => {
  it('isPayState already rejects earnedToday above the cap, so remaining cannot go negative (P04)', () => {
    expect(settle('success', 20, fresh(BIKE_PAY.dailyCapCents + 1), T0, T0)).toEqual({
      ok: false,
      reason: 'invalid-state',
    });
    const atCap = settle('success', 20, fresh(BIKE_PAY.dailyCapCents), T0, T0);
    expect(atCap.ok).toBe(true);
    if (!atCap.ok) return;
    expect(atCap.paidCents).toBe(0);
    expect(atCap.newState.earnedTodayCents).toBe(BIKE_PAY.dailyCapCents);
  });
});
