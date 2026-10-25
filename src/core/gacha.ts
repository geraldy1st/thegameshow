import {
  ASSOCIATES,
  MAX_STARS,
  PITY_LIMIT,
  RARITY_RATES,
  type AssociateDef,
  type Rarity,
} from '../data/balance';
import { addAmount } from './numbers';
import { nextFloat, type RngState } from './rng';
import type { GameState, LastPull, StarCount } from './types';

/** Raw rarity table, before pity (tested with a chi-square, SPEC-ADDENDUM RES-1a). */
export function rollRarity(rng: RngState): [Rarity, RngState] {
  const [u, next] = nextFloat(rng);
  if (u < RARITY_RATES[3]) return [3, next];
  if (u < RARITY_RATES[3] + RARITY_RATES[2]) return [2, next];
  return [1, next];
}

export const POOLS: Readonly<Record<Rarity, readonly AssociateDef[]>> = {
  1: ASSOCIATES.filter((a) => a.rarity === 1),
  2: ASSOCIATES.filter((a) => a.rarity === 2),
  3: ASSOCIATES.filter((a) => a.rarity === 3),
};

/** Uniform pick inside a rarity (mockup: pool[floor(rand x length)]). */
export function pickInRarity(rarity: Rarity, rng: RngState): [AssociateDef, RngState] {
  const pool = POOLS[rarity];
  const [u, next] = nextFloat(rng);
  return [pool[Math.min(pool.length - 1, Math.floor(u * pool.length))]!, next];
}

/** Pulls left before the guaranteed 3-star (1 when the next pull is forced). */
export function pullsUntilGuarantee(pity: number): number {
  return PITY_LIMIT - pity;
}

export type PullResult =
  { ok: true; state: GameState; last: LastPull } | { ok: false; reason: 'no-ticket' };

/**
 * One draw (RES-1): if pity === 49 the rarity is forced to 3 stars; a 3-star (forced or natural)
 * resets pity, anything else adds 1. Duplicate = +1 star up to 5; beyond, no effect.
 */
export function pull(state: GameState): PullResult {
  if (state.tickets < 1) return { ok: false, reason: 'no-ticket' };
  let rng = state.rng;
  const forced = state.gacha.pity >= PITY_LIMIT - 1;
  let rarity: Rarity = 3;
  if (!forced) [rarity, rng] = rollRarity(rng);
  const [def, rng2] = pickInRarity(rarity, rng);
  const had = state.gacha.stars[def.id];
  const stars = (had === undefined ? 1 : Math.min(MAX_STARS, had + 1)) as StarCount;
  const pulls = addAmount(state.gacha.pulls, 1);
  const last: LastPull = {
    id: def.id,
    stars,
    isNew: had === undefined,
    wasted: had === MAX_STARS,
    forced,
    pull: pulls,
  };
  return {
    ok: true,
    last,
    state: {
      ...state,
      rng: rng2,
      tickets: state.tickets - 1,
      gacha: {
        pity: rarity === 3 ? 0 : state.gacha.pity + 1,
        pulls,
        stars: { ...state.gacha.stars, [def.id]: stars },
        last,
      },
    },
  };
}

/** Effective 3-star rate with hard pity: 1 / E[pulls per 3-star] (SPEC-ADDENDUM RES-1b). */
export function effectiveThreeStarRate(): number {
  const p = RARITY_RATES[3];
  return p / (1 - (1 - p) ** PITY_LIMIT);
}
