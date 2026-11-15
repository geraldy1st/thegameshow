import { localDay } from './clock';

/**
 * Isolated bike settlement (0.6.0 I1). Pure: no DOM, no storage, no boosts, no profile.xp.
 * Amounts are integer yen-cents. Economy (according to Mirage, 08/11): 2 ¥ / coin, 20 coins
 * max, +100 ¥ on success, 1 000 ¥ / day bike-only cap.
 */
export const BIKE_PAY = {
  coinYenCents: 200,
  maxCoins: 20,
  successBonusCents: 10_000,
  dailyCapCents: 100_000,
} as const;

export type BikePayOutcome = 'success' | 'fail' | 'abandon';

export type BikePayState = {
  day: string;
  earnedTodayCents: number;
};

export type SettleOk = {
  ok: true;
  paidCents: number;
  capped: boolean;
  newState: BikePayState;
};

export type SettleErr = {
  ok: false;
  reason: 'invalid-coins' | 'invalid-state';
};

export type SettleResult = SettleOk | SettleErr;

export function initialBikePayState(nowCal: number): BikePayState {
  return { day: localDay(nowCal), earnedTodayCents: 0 };
}

export function grossCents(outcome: BikePayOutcome, coins: number): number {
  if (outcome === 'abandon') return 0;
  const collected = BIKE_PAY.coinYenCents * coins;
  return outcome === 'success' ? collected + BIKE_PAY.successBonusCents : collected;
}

/**
 * D1: reset the daily counter only when the calendar day of `nowCal` is strictly after the
 * stored day AND nowCal >= maxSeenAt. A clock rollback (nowCal < maxSeenAt) keeps day and
 * counter and still pays the remainder. The day used is the day the run *ends* (`nowCal`).
 */
export function applyDayRule(state: BikePayState, nowCal: number, maxSeenAt: number): BikePayState {
  const today = localDay(nowCal);
  if (nowCal < maxSeenAt) return state;
  if (today > state.day) return { day: today, earnedTodayCents: 0 };
  return state;
}

function isCoinCount(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= BIKE_PAY.maxCoins;
}

function isPayState(s: BikePayState): boolean {
  return (
    typeof s.day === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(s.day) &&
    Number.isInteger(s.earnedTodayCents) &&
    s.earnedTodayCents >= 0 &&
    s.earnedTodayCents <= BIKE_PAY.dailyCapCents
  );
}

export function settle(
  outcome: BikePayOutcome,
  coins: number,
  state: BikePayState,
  nowCal: number,
  maxSeenAt: number,
): SettleResult {
  if (!isPayState(state)) return { ok: false, reason: 'invalid-state' };
  if (outcome === 'abandon') {
    // No day roll, no credit: a quit or reload before commit is not a settlement.
    return { ok: true, paidCents: 0, capped: false, newState: state };
  }
  if (!isCoinCount(coins)) return { ok: false, reason: 'invalid-coins' };

  const rolled = applyDayRule(state, nowCal, maxSeenAt);
  const remaining = Math.max(0, BIKE_PAY.dailyCapCents - rolled.earnedTodayCents);
  const gross = grossCents(outcome, coins);
  const paidCents = Math.min(gross, remaining);
  const earnedTodayCents = rolled.earnedTodayCents + paidCents;
  return {
    ok: true,
    paidCents,
    capped: paidCents < gross,
    newState: { day: rolled.day, earnedTodayCents },
  };
}
