import { MAX_LEVEL, xpNeed } from '../data/balance';
import type { GameState } from './types';

/**
 * +xp to the profile; a level is gained exactly at xpNeed(level), xp back to 0 (GS-V5-47).
 * Level is capped at MAX_LEVEL (xp keeps at most xpNeed − 1 there).
 */
export function addXp(g: GameState, xp: number): { state: GameState; levelUp: boolean } {
  let { level, xp: cur } = g.profile;
  cur += xp;
  let levelUp = false;
  while (cur >= xpNeed(level)) {
    if (level >= MAX_LEVEL) {
      cur = xpNeed(level) - 1;
      break;
    }
    cur -= xpNeed(level);
    level += 1;
    levelUp = true;
  }
  return { state: { ...g, profile: { level, xp: cur } }, levelUp };
}
