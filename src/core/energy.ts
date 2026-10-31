import { BALANCE } from '../data/balance';
import type { GameState } from './types';

const SECOND = 1000;

/**
 * Energy recharge (lot 3, GS-V5-10): +BALANCE.energy.perSecond per whole second since
 * `energy.updatedAt`, capped at BALANCE.energy.max. A clock moved back (now < updatedAt or
 * now < maxSeenAt) gives 0 recharge and never moves `updatedAt` backwards. A stored value
 * above the max is clipped. Pure; returns the same object when nothing changes.
 */
export function rechargeEnergy(g: GameState, now: number): GameState {
  const { max, perSecond } = BALANCE.energy;
  const { value, updatedAt } = g.energy;
  const clipped = Math.min(value, max);
  if (now < updatedAt || now < g.maxSeenAt) {
    return clipped === value ? g : { ...g, energy: { value: clipped, updatedAt } };
  }
  if (clipped >= max) {
    return clipped === value && updatedAt === now
      ? g
      : { ...g, energy: { value: max, updatedAt: now } };
  }
  const seconds = Math.floor((now - updatedAt) / SECOND);
  if (seconds <= 0) return clipped === value ? g : { ...g, energy: { value: clipped, updatedAt } };
  const next = Math.min(max, clipped + seconds * perSecond);
  return {
    ...g,
    energy: { value: next, updatedAt: next >= max ? now : updatedAt + seconds * SECOND },
  };
}
