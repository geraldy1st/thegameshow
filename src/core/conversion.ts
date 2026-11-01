import { BALANCE, MAX_STAT } from '../data/balance';
import { addAmount, yenToCents } from './numbers';
import type { GameState } from './types';

/**
 * Converts floor(points / 100) × 10 ¥ into `yenCents`, keeps the rest, +1 Créativité per
 * conversion (OD-3, not per 100 points), capped at MAX_STAT (GS-V5-48). Below 100 points:
 * nothing changes (`yen: 0`).
 */
export function convert(g: GameState): { state: GameState; yen: number } {
  const { pointsPerConversion, yenPerConversion, creativityPerConversion } = BALANCE.work;
  const n = Math.floor(g.work.points / pointsPerConversion);
  if (n <= 0) return { state: g, yen: 0 };
  const yen = n * yenPerConversion;
  return {
    yen,
    state: {
      ...g,
      yenCents: addAmount(g.yenCents, yenToCents(yen)),
      work: { ...g.work, points: g.work.points - n * pointsPerConversion },
      stats: { ...g.stats, crea: Math.min(MAX_STAT, g.stats.crea + creativityPerConversion) },
    },
  };
}
