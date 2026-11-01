import { BALANCE } from '../data/balance';
import { WORK_CURSOR_MAX, WORK_CURSOR_STEP } from '../data/workTexts';
import { bonusMultiplier } from './economy';
import { rechargeEnergy } from './energy';
import { addXp } from './level';
import { bumpQuest } from './quests';
import { acceptTap, type TapWindow } from './tapLimiter';
import type { GameState, WorkMode } from './types';

/** Points per accepted tap: level × click bonus, at least 1 (mockup `clickVal`). */
export function clickValuePoints(g: GameState): number {
  return Math.max(1, Math.round(g.profile.level * bonusMultiplier(g, 'click')));
}

export type TapResult =
  | {
      accepted: true;
      state: GameState;
      window: TapWindow;
      gained: number;
      levelUp: boolean;
      /** A 100-point milestone of `pointsTotal` was crossed (joy, §6). */
      milestone: boolean;
    }
  | { accepted: false; state: GameState; window: TapWindow; reason: 'rate' | 'energy' };

/**
 * One tap on the document (ARCHITECTURE-LOT4 §3): rate limit, energy, −1 energy,
 * +clickVal × mult points (the boost doubles points only, never XP), +1 XP, cursor, taps,
 * totalClicks and the « clic » quest (R-L4: only accepted taps in Travailler count).
 * Pure: `now` comes from the injectable clock.
 */
export function tap(g0: GameState, window: TapWindow, now: number, mult = 1): TapResult {
  const g = rechargeEnergy(g0, now);
  if (g.energy.value < BALANCE.work.energyPerTap) {
    return { accepted: false, state: g, window, reason: 'energy' };
  }
  const lim = acceptTap(window, now);
  if (!lim.accepted) return { accepted: false, state: g, window: lim.window, reason: 'rate' };
  const gained = clickValuePoints(g) * mult; // paid at the level before this tap's XP
  const before = Math.floor(g.work.pointsTotal / BALANCE.work.milestonePoints);
  const pointsTotal = g.work.pointsTotal + gained;
  const spent: GameState = {
    ...g,
    totalClicks: g.totalClicks + 1,
    energy: {
      value: g.energy.value - BALANCE.work.energyPerTap,
      // Full energy restarts the recharge clock at the first spend.
      updatedAt: g.energy.value >= BALANCE.energy.max ? now : g.energy.updatedAt,
    },
    work: {
      ...g.work,
      points: g.work.points + gained,
      pointsTotal,
      cursor: (g.work.cursor + WORK_CURSOR_STEP) % (WORK_CURSOR_MAX + 1),
      taps: g.work.taps + 1,
    },
  };
  const lv = addXp(spent, BALANCE.work.xpPerTap);
  return {
    accepted: true,
    state: bumpQuest(lv.state, 'click'),
    window: lim.window,
    gained,
    levelUp: lv.levelUp,
    milestone: Math.floor(pointsTotal / BALANCE.work.milestonePoints) > before,
  };
}

/** Roman / Presse (GS-V5-49): the text cursor goes back to 0, points are untouched. */
export function setMode(g: GameState, mode: WorkMode): GameState {
  if (g.work.mode === mode) return g;
  return { ...g, work: { ...g.work, mode, cursor: 0 } };
}
