import {
  ASSOCIATES,
  INVESTMENT_IDS,
  INVESTMENTS,
  OFFLINE_CAP_MS,
  WELCOME_BACK_THRESHOLD_MS,
} from '../data/balance';
import { bonusMultiplier } from './economy';
import { addAmount } from './numbers';
import type { GameState } from './types';

export interface SettleResult {
  state: GameState;
  /** Elapsed time actually credited (after clamp). */
  creditedMs: number;
  gainCents: number;
  /** True when the gain went to pendingOfflineCents (welcome-back screen). */
  deferred: boolean;
  /** True when the clock went backwards (now < maxSeenAt): no gain, lastSeenAt kept. */
  clockRollback: boolean;
}

/** Instantaneous income (hundredths of yen per second) at given clocks. */
export function incomeCentsPerSecondAt(state: GameState, now: number, wallNow: number): number {
  return INVESTMENT_IDS.reduce(
    (sum, id) =>
      sum +
      INVESTMENTS[id].ratePerLevel *
        100 *
        state.investments[id] *
        bonusMultiplier(state, id, now, wallNow),
    0,
  );
}

/** Gain for an elapsed duration at a fixed instant (no call segmenting). */
export function idleGainCents(
  state: GameState,
  elapsedMs: number,
  now = state.maxSeenAt,
  wallNow = state.maxSeenAt,
): number {
  const gain = Math.floor((incomeCentsPerSecondAt(state, now, wallNow) * elapsedMs) / 1000);
  return Number.isFinite(gain) && gain > 0 ? gain : 0;
}

/**
 * Offline gain with call boost only on the overlapping part of each call's real duration
 * (game clock). Boundaries = window ends + every activation/until inside the window.
 */
export function idleGainCentsBetween(state: GameState, start: number, end: number): number {
  if (!(end > start)) return 0;
  const points = new Set<number>([start, end]);
  for (const a of ASSOCIATES) {
    const p = state.appel[a.id];
    if (!p) continue;
    if (p.activatedAt > start && p.activatedAt < end) points.add(p.activatedAt);
    if (p.endsAt > start && p.endsAt < end) points.add(p.endsAt);
  }
  const sorted = [...points].sort((x, y) => x - y);
  let total = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    const mid = (a + b) / 2;
    // During offline we only know the game clock; use mid for both so wall anchors cannot
    // invent extra boost beyond the real call window on the game timeline.
    const gain = Math.floor((incomeCentsPerSecondAt(state, mid, mid) * (b - a)) / 1000);
    if (Number.isFinite(gain) && gain > 0) total += gain;
  }
  return total;
}

/**
 * The ONLY function that credits time (SPEC-ADDENDUM RES-5). The 1 s tick and the
 * resume/catch-up path both call it, so the same interval can never be counted twice.
 *
 * elapsed = clamp(now - lastSeenAt, 0, 8 h).
 * If now < maxSeenAt (clock moved back): gain 0, lastSeenAt and maxSeenAt unchanged.
 * Clock moved forward is tolerated (solo game, no real money) and bounded by the 8 h cap.
 * Call ×2 applies only on the overlapping part of each call's real duration (Associés v11).
 */
export function settle(state: GameState, now: number): SettleResult {
  if (!Number.isFinite(now) || now < state.maxSeenAt) {
    return { state, creditedMs: 0, gainCents: 0, deferred: false, clockRollback: true };
  }
  const rawElapsed = now - state.lastSeenAt;
  const creditedMs = Math.min(Math.max(rawElapsed, 0), OFFLINE_CAP_MS);
  const windowStart = now - creditedMs;
  const gainCents = idleGainCentsBetween(state, windowStart, now);
  const deferred = rawElapsed >= WELCOME_BACK_THRESHOLD_MS && gainCents > 0;
  const next: GameState = {
    ...state,
    lastSeenAt: now,
    maxSeenAt: now,
    yenCents: deferred ? state.yenCents : addAmount(state.yenCents, gainCents),
    pendingOfflineCents: deferred
      ? addAmount(state.pendingOfflineCents, gainCents)
      : state.pendingOfflineCents,
  };
  return { state: next, creditedMs, gainCents, deferred, clockRollback: false };
}

/** "Récupérer" on the welcome-back screen. */
export function collectOffline(state: GameState): GameState {
  if (state.pendingOfflineCents === 0) return state;
  return {
    ...state,
    yenCents: addAmount(state.yenCents, state.pendingOfflineCents),
    pendingOfflineCents: 0,
  };
}
