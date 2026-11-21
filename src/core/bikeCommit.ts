/**
 * I2: write a settled bike run onto a SaveV6 (receipt, counters, stats, local pay).
 * Does not implement the G-4 cap merge or the v1.6 `today` anchor — those stay in
 * the dailyCap stub until Crypto reviews NOTE-MIGRATION-V6 v1.6.
 */
import type { BikeReceipt, GameState } from './types';
import { progressDelta, settle, type BikePayOutcome } from './bikePay';
import { isCanonicalUuid } from './gameId';

export type BikeCommitInput = {
  runId: string;
  outcome: Extract<BikePayOutcome, 'success' | 'fail'>;
  coins: number;
  distanceM: number;
  now: number;
};

export type BikeCommitOk = { ok: true; next: GameState; paidCents: number; capped: boolean };
export type BikeCommitErr = { ok: false; reason: string };
export type BikeCommitResult = BikeCommitOk | BikeCommitErr;

const MAX_RECEIPTS = 200;
const MAX_DISTANCE_M = 160;

export function applyBikeCommit(g: GameState, input: BikeCommitInput): BikeCommitResult {
  if (!isCanonicalUuid(input.runId)) return { ok: false, reason: 'invalid-runId' };
  if (
    !Number.isInteger(input.distanceM) ||
    input.distanceM < 0 ||
    input.distanceM > MAX_DISTANCE_M
  ) {
    return { ok: false, reason: 'invalid-distance' };
  }
  if (g.bike.receipts.some((r) => r.runId === input.runId)) {
    return { ok: false, reason: 'duplicate-runId' };
  }
  const settled = settle(
    input.outcome,
    input.coins,
    { day: g.bike.day, earnedTodayCents: g.bike.earnedTodayCents },
    input.now,
    g.maxSeenAt,
  );
  if (!settled.ok) return { ok: false, reason: settled.reason };
  const stats = {
    sante: g.stats.sante,
    bonheur: g.stats.bonheur,
    repu: g.stats.repu,
  };
  const prog = progressDelta(input.outcome, stats);
  if (!prog.ok) return { ok: false, reason: prog.reason };

  const receipt: BikeReceipt = {
    runId: input.runId,
    gameId: g.gameId,
    day: settled.newState.day,
    paidCents: settled.paidCents,
    outcome: input.outcome,
    at: input.now,
  };
  const receipts = [...g.bike.receipts, receipt].slice(-MAX_RECEIPTS);
  let best = g.bike.best;
  if (
    best === null ||
    input.coins > best.coins ||
    (input.coins === best.coins && input.distanceM > best.distanceM)
  ) {
    best = { coins: input.coins, distanceM: input.distanceM };
  }
  const yenCents = g.yenCents + settled.paidCents;
  if (yenCents > Number.MAX_SAFE_INTEGER) return { ok: false, reason: 'yen-overflow' };

  return {
    ok: true,
    paidCents: settled.paidCents,
    capped: settled.capped,
    next: {
      ...g,
      yenCents,
      stats: { ...g.stats, ...prog.next },
      lastSeenAt: input.now,
      maxSeenAt: Math.max(g.maxSeenAt, input.now),
      bike: {
        ...g.bike,
        day: settled.newState.day,
        earnedTodayCents: settled.newState.earnedTodayCents,
        receipts,
        successes: g.bike.successes + prog.successes,
        failures: g.bike.failures + prog.failures,
        best,
      },
    },
  };
}
