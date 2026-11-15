import { describe, expect, it } from 'vitest';
import { ManualClock } from './clock';
import { BIKE_PAY, grossCents, settle, type BikePayState } from './bikePay';

/** Local calendar instants, so D1 tests do not depend on the runner's time zone. */
const atLocal = (y: number, m: number, d: number, hh = 12, mm = 0, ss = 0, ms = 0): number =>
  new Date(y, m, d, hh, mm, ss, ms).getTime();
const T0 = atLocal(2026, 10, 15);
const fresh = (earned = 0, day = '2026-11-15'): BikePayState => ({
  day,
  earnedTodayCents: earned,
});

describe('bikePay economy (raw, no boosts)', () => {
  it('pays 2 ¥ per coin plus 100 ¥ on success, capped at the daily remainder', () => {
    const r = settle('success', 20, fresh(), T0, T0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.paidCents).toBe(14_000);
    expect(r.capped).toBe(false);
    expect(r.newState.earnedTodayCents).toBe(14_000);
  });

  it('on failure pays collected coins only, never the 100 ¥ bonus', () => {
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
    'success and fail for %i coins, remainder 0/1/139/140/141 ¥',
    (p) => {
      const grossS = 200 * p + 10_000;
      const grossF = 200 * p;
      for (const remainYen of [0, 1, 139, 140, 141]) {
        const earned = BIKE_PAY.dailyCapCents - remainYen * 100;
        const success = settle('success', p, fresh(earned), T0, T0);
        const fail = settle('fail', p, fresh(earned), T0, T0);
        expect(success.ok && fail.ok).toBe(true);
        if (!success.ok || !fail.ok) return;
        expect(success.paidCents).toBe(Math.min(grossS, remainYen * 100));
        expect(fail.paidCents).toBe(Math.min(grossF, remainYen * 100));
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
});
