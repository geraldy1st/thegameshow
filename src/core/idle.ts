import { OFFLINE_CAP_MS, WELCOME_BACK_THRESHOLD_MS } from '../data/balance';
import { incomeCentsPerSecond } from './economy';
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

/** Gain for an elapsed duration: floor(income x elapsed), hundredths of yen. */
export function idleGainCents(state: GameState, elapsedMs: number): number {
  const gain = Math.floor((incomeCentsPerSecond(state) * elapsedMs) / 1000);
  return Number.isFinite(gain) && gain > 0 ? gain : 0;
}

/**
 * The ONLY function that credits time (SPEC-ADDENDUM RES-5). The 1 s tick and the
 * resume/catch-up path both call it, so the same interval can never be counted twice.
 *
 * elapsed = clamp(now - lastSeenAt, 0, 8 h).
 * If now < maxSeenAt (clock moved back): gain 0, lastSeenAt and maxSeenAt unchanged.
 * Clock moved forward is tolerated (solo game, no real money) and bounded by the 8 h cap.
 */
export function settle(state: GameState, now: number): SettleResult {
  if (!Number.isFinite(now) || now < state.maxSeenAt) {
    return { state, creditedMs: 0, gainCents: 0, deferred: false, clockRollback: true };
  }
  const rawElapsed = now - state.lastSeenAt;
  const creditedMs = Math.min(Math.max(rawElapsed, 0), OFFLINE_CAP_MS);
  const gainCents = idleGainCents(state, creditedMs);
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
