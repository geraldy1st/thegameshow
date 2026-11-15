import { MAX_STAT } from '../data/balance';
import { isCalendarDay, localDay } from './clock';

/**
 * Isolated bike settlement (0.6.0 I1). Pure: no DOM, no storage, no boosts, no profile.xp.
 * Amounts are integer bucks-cents. Economy (according to Mirage, 08/11): 2\u00a0B / coin, 20 coins
 * max, +100\u00a0B on success, 1 000\u00a0B / day bike-only cap.
 *
 * G-1 = C, corrected 15/11 17:13 (supersedes 17:09–17:11 « Santé only »): a committed
 * success raises sante, bonheur and repu by +1 each, each capped at MAX_STAT independently;
 * a failure or abandon raises 0 to all three. I1 only *computes* the delta (progressDelta).
 * I2 writes it in the same transaction as the receipt. No UI here.
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
    isCalendarDay(s.day) &&
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

/** Rule version persisted on the v6 bike object (G-2). A later incompatible rule is a new version. */
export const BIKE_PROGRESS_RULES_VERSION = 1 as const;

/** Existing skill ids (STAT_IDS). Do not invent other names. */
export const BIKE_STAT_IDS = ['sante', 'bonheur', 'repu'] as const;
export type BikeStatId = (typeof BIKE_STAT_IDS)[number];
export type BikeStatValues = Record<BikeStatId, number>;

export type ProgressDeltaOk = {
  ok: true;
  /** Disjoint counters: a success increments only successes, a fail only failures. */
  successes: 0 | 1;
  failures: 0 | 1;
  deltas: Record<BikeStatId, 0 | 1>;
  next: BikeStatValues;
};

export type ProgressDeltaErr = {
  ok: false;
  reason: 'invalid-stats';
};

export type ProgressDeltaResult = ProgressDeltaOk | ProgressDeltaErr;

function isStatValue(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= MAX_STAT;
}

function isStatValues(s: BikeStatValues): boolean {
  return BIKE_STAT_IDS.every((id) => isStatValue(s[id]));
}

function bump(stats: BikeStatValues): { deltas: Record<BikeStatId, 0 | 1>; next: BikeStatValues } {
  const deltas = {} as Record<BikeStatId, 0 | 1>;
  const next = {} as BikeStatValues;
  for (const id of BIKE_STAT_IDS) {
    const n = Math.min(MAX_STAT, stats[id] + 1);
    deltas[id] = (n - stats[id]) as 0 | 1;
    next[id] = n;
  }
  return { deltas, next };
}

/**
 * Pure G-1/G-2 increment. Does not touch storage. Abandon: nothing. Fail: failures +1,
 * all three skills unchanged. Success: successes +1 and each of sante, bonheur, repu +1,
 * each capped independently at MAX_STAT (99→100 on one skill does not block the others;
 * 100 stays 100 while the other two still rise). Paid Bucks (including 0\u00a0B after the daily
 * cap) do not change this rule: it follows `outcome`.
 */
export function progressDelta(outcome: BikePayOutcome, stats: BikeStatValues): ProgressDeltaResult {
  if (!isStatValues(stats)) return { ok: false, reason: 'invalid-stats' };
  const zero = { sante: 0, bonheur: 0, repu: 0 } as const;
  if (outcome === 'abandon') {
    return { ok: true, successes: 0, failures: 0, deltas: { ...zero }, next: { ...stats } };
  }
  if (outcome === 'fail') {
    return { ok: true, successes: 0, failures: 1, deltas: { ...zero }, next: { ...stats } };
  }
  const { deltas, next } = bump(stats);
  return { ok: true, successes: 1, failures: 0, deltas, next };
}
