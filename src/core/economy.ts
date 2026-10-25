import {
  ASSOCIATES,
  CLICK_BASE_YEN,
  INVESTMENT_IDS,
  INVESTMENTS,
  MAX_AMOUNT,
  type BonusTarget,
  type InvestmentId,
} from '../data/balance';
import { addAmount, yenToCents } from './numbers';
import { bumpQuest } from './quests';
import type { GameState } from './types';

/** Partner bonus multiplier for a target: 1 + sum(percent x stars) / 100 (mockup rule). */
export function bonusMultiplier(state: GameState, target: Exclude<BonusTarget, 'all'>): number {
  let pct = 0;
  for (const a of ASSOCIATES) {
    const stars = state.gacha.stars[a.id] ?? 0;
    if (stars > 0 && (a.target === target || a.target === 'all')) pct += a.percentPerStar * stars;
  }
  return 1 + pct / 100;
}

/** Yen earned by one click (whole yen, at least 1). */
export function clickValueYen(state: GameState): number {
  return Math.max(1, Math.round(CLICK_BASE_YEN * bonusMultiplier(state, 'click')));
}

export function click(state: GameState): GameState {
  return bumpQuest(clickRaw(state), 'click');
}

function clickRaw(state: GameState): GameState {
  return {
    ...state,
    yenCents: addAmount(state.yenCents, yenToCents(clickValueYen(state))),
    totalClicks: addAmount(state.totalClicks, 1),
  };
}

/** Cost of the next level in whole yen: ceil(base x growth^level). */
export function nextCostYen(id: InvestmentId, level: number): number {
  const def = INVESTMENTS[id];
  const cost = Math.ceil(def.baseCost * def.growth ** level);
  return Number.isFinite(cost)
    ? Math.min(cost, Math.floor(MAX_AMOUNT / 100))
    : Math.floor(MAX_AMOUNT / 100);
}

export function canBuy(state: GameState, id: InvestmentId): boolean {
  return state.yenCents >= yenToCents(nextCostYen(id, state.investments[id]));
}

export type BuyResult = { ok: true; state: GameState } | { ok: false; reason: 'insufficient' };

export function buy(state: GameState, id: InvestmentId): BuyResult {
  const cost = yenToCents(nextCostYen(id, state.investments[id]));
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

/** Income of one investment in hundredths of yen per second (fractional). */
export function investmentCentsPerSecond(state: GameState, id: InvestmentId): number {
  return INVESTMENTS[id].ratePerLevel * 100 * state.investments[id] * bonusMultiplier(state, id);
}

/** Total idle income in hundredths of yen per second (fractional). */
export function incomeCentsPerSecond(state: GameState): number {
  return INVESTMENT_IDS.reduce((sum, id) => sum + investmentCentsPerSecond(state, id), 0);
}
