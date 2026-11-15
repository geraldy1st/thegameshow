import { BALANCE, MAX_STAT } from '../data/balance';
import { addAmount, bucksToCents } from './numbers';
import type { GameState } from './types';

/**
 * Converts floor(points / 100) × 10 B into `yenCents`, keeps the rest, +1 Créativité per
 * conversion (OD-3, not per 100 points), capped at MAX_STAT (GS-V5-48). Below 100 points:
 * nothing changes (`bucks: 0`).
 */
export function convert(g: GameState): { state: GameState; bucks: number } {
  const { pointsPerConversion, yenPerConversion, creativityPerConversion } = BALANCE.work;
  const n = Math.floor(g.work.points / pointsPerConversion);
  if (n <= 0) return { state: g, bucks: 0 };
  const bucks = n * yenPerConversion;
  return {
    bucks,
    state: {
      ...g,
      yenCents: addAmount(g.yenCents, bucksToCents(bucks)),
      work: { ...g.work, points: g.work.points - n * pointsPerConversion },
      stats: { ...g.stats, crea: Math.min(MAX_STAT, g.stats.crea + creativityPerConversion) },
    },
  };
}
