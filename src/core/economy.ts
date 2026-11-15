import {
  ASSOCIATES,
  CLICK_BASE_YEN,
  INVESTMENT_IDS,
  INVESTMENTS,
  MAX_AMOUNT,
  type BonusTarget,
  type InvestmentId,
} from '../data/balance';
import { addAmount, bucksToCents } from './numbers';
import { bumpQuest } from './quests';
import type { GameState } from './types';
import { callMult, toCoreEntry } from './appel';

/**
 * Partner bonus multiplier for a target: 1 + sum(percent × stars × callMult) / 100.
 * Call ×2 is multiplicative on that associate's contribution only (Associés v11).
 * `now`/`wallNow` default to maxSeenAt (online tick / no wall skew).
 */
export function bonusMultiplier(
  state: GameState,
  target: Exclude<BonusTarget, 'all'>,
  now: number = state.maxSeenAt,
  wallNow: number = state.maxSeenAt,
): number {
  let pct = 0;
  for (const a of ASSOCIATES) {
    const stars = state.gacha.stars[a.id] ?? 0;
    if (stars <= 0 || (a.target !== target && a.target !== 'all')) continue;
    const entry = state.appel[a.id];
    const mult = callMult(true, entry ? toCoreEntry(entry) : undefined, now, wallNow);
    pct += a.percentPerStar * stars * mult;
  }
  return 1 + pct / 100;
}

/** Buck earned by one click (whole Bucks, at least 1). */
export function clickValueBucks(state: GameState): number {
  return Math.max(1, Math.round(CLICK_BASE_YEN * bonusMultiplier(state, 'click')));
}

export function click(state: GameState): GameState {
  return bumpQuest(clickRaw(state), 'click');
}

function clickRaw(state: GameState): GameState {
  return {
    ...state,
    yenCents: addAmount(state.yenCents, bucksToCents(clickValueBucks(state))),
    totalClicks: addAmount(state.totalClicks, 1),
  };
}

/** Cost of the next level in whole Bucks: ceil(base x growth^level). */
export function nextCostBucks(id: InvestmentId, level: number): number {
  const def = INVESTMENTS[id];
  const cost = Math.ceil(def.baseCost * def.growth ** level);
  return Number.isFinite(cost)
    ? Math.min(cost, Math.floor(MAX_AMOUNT / 100))
    : Math.floor(MAX_AMOUNT / 100);
}

export function canBuy(state: GameState, id: InvestmentId): boolean {
  return state.yenCents >= bucksToCents(nextCostBucks(id, state.investments[id]));
}

export type BuyResult = { ok: true; state: GameState } | { ok: false; reason: 'insufficient' };

export function buy(state: GameState, id: InvestmentId): BuyResult {
  const cost = bucksToCents(nextCostBucks(id, state.investments[id]));
  if (state.yenCents < cost) return { ok: false, reason: 'insufficient' };
  let next: GameState = {
    ...state,
    yenCents: state.yenCents - cost,
    investments: { ...state.investments, [id]: addAmount(state.investments[id], 1) },
  };
  next = bumpQuest(next, 'invest');
  if (id === 'save') next = bumpQuest(next, 'save'); // "épargner une fois" (RES-6)
  return { ok: true, state: next };
}

/** Income of one investment in hundredths of a Buck per second (fractional). */
export function investmentCentsPerSecond(state: GameState, id: InvestmentId): number {
  return INVESTMENTS[id].ratePerLevel * 100 * state.investments[id] * bonusMultiplier(state, id);
}

/** Total idle income in hundredths of a Buck per second (fractional). */
export function incomeCentsPerSecond(state: GameState): number {
  return INVESTMENT_IDS.reduce((sum, id) => sum + investmentCentsPerSecond(state, id), 0);
}
