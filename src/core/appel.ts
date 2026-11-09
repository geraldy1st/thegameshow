import { ASSOCIATES, type AssociateId, type BonusTarget, type Rarity } from '../data/balance';

/** 1★ / 2★ = 30 min; 3★ = 1 h (Geraldy via Mirage, 09/11). */
export const CALL_DURATION_MS: Readonly<Record<Rarity, number>> = {
  1: 30 * 60_000,
  2: 30 * 60_000,
  3: 60 * 60_000,
};
/** Recharge from activation, not from the end of the boost. */
export const CALL_COOLDOWN_MS = 24 * 60 * 60_000;

export interface AppelEntry {
  /** Game-clock end of the ×2 window. */
  until: number;
  /** Game-clock end of the 24 h recharge (activation + 24 h). */
  cool: number;
  /** Wall-clock anchors: a forward jump of the game clock alone must not shorten the wait. */
  wallUntil: number;
  wallCool: number;
}

export type AppelMap = Readonly<Partial<Record<AssociateId, AppelEntry>>>;
export type AppelStatus = 'available' | 'active' | 'cooling' | 'locked';

export type StartAppelResult =
  | { ok: true; map: AppelMap; entry: AppelEntry }
  | { ok: false; reason: 'locked' | 'busy' | 'bad-clock' };

/**
 * Remaining active / cool time: max(game remaining, wall remaining).
 * Rolling the game clock forward cannot shorten the recharge; rolling it back cannot
 * either (remainings only grow). No strong anti-cheat if both clocks are forged.
 */
export function remainingMs(
  entry: AppelEntry,
  now: number,
  wallNow: number,
): { active: number; cool: number } {
  return {
    active: Math.max(entry.until - now, entry.wallUntil - wallNow, 0),
    cool: Math.max(entry.cool - now, entry.wallCool - wallNow, 0),
  };
}

export function statusAt(
  owned: boolean,
  entry: AppelEntry | undefined,
  now: number,
  wallNow: number,
): AppelStatus {
  if (!owned) return 'locked';
  if (!entry) return 'available';
  if (!Number.isFinite(now) || !Number.isFinite(wallNow)) return 'cooling';
  const { active, cool } = remainingMs(entry, now, wallNow);
  if (active > 0) return 'active';
  if (cool > 0) return 'cooling';
  return 'available';
}

/** Activation timestamp derived from the stored cool end (cool = activation + 24 h). */
export function activationMs(entry: AppelEntry): number {
  return entry.cool - CALL_COOLDOWN_MS;
}

/**
 * Start a call. Idempotent against double-start: if already active or cooling, `{ ok:false, busy }`.
 * Pure: returns a new map; the store/transaction layer is out of scope (R-AS-03).
 */
export function startAppel(
  map: AppelMap,
  id: AssociateId | string,
  owned: boolean,
  now: number,
  wallNow: number,
): StartAppelResult {
  if (!owned) return { ok: false, reason: 'locked' };
  if (!Number.isFinite(now) || !Number.isFinite(wallNow) || wallNow < 0) {
    return { ok: false, reason: 'bad-clock' };
  }
  const def = ASSOCIATES.find((a) => a.id === id);
  if (!def) return { ok: false, reason: 'locked' };
  const aid = def.id;
  const cur = statusAt(true, map[aid], now, wallNow);
  if (cur === 'active' || cur === 'cooling') return { ok: false, reason: 'busy' };
  const dur = CALL_DURATION_MS[def.rarity];
  const entry: AppelEntry = {
    until: now + dur,
    cool: now + CALL_COOLDOWN_MS,
    wallUntil: wallNow + dur,
    wallCool: wallNow + CALL_COOLDOWN_MS,
  };
  return { ok: true, map: { ...map, [aid]: entry }, entry };
}

/** ×2 while active on this associate's contribution; else 1. */
export function callMult(
  owned: boolean,
  entry: AppelEntry | undefined,
  now: number,
  wallNow: number,
): 1 | 2 {
  return statusAt(owned, entry, now, wallNow) === 'active' ? 2 : 1;
}

/**
 * Percent points this associate adds to a target, with call ×2 when active.
 * Same formula as economy.bonusMultiplier, but per associate and call-aware.
 * Not wired into economy.ts (integration blocked).
 */
export function associatePercent(
  id: AssociateId | string,
  stars: number,
  target: Exclude<BonusTarget, 'all'>,
  entry: AppelEntry | undefined,
  now: number,
  wallNow: number,
): number {
  if (stars <= 0) return 0;
  const def = ASSOCIATES.find((a) => a.id === id);
  if (!def) return 0;
  if (def.target !== target && def.target !== 'all') return 0;
  return def.percentPerStar * stars * callMult(true, entry, now, wallNow);
}

/**
 * Offline overlap (Q-G3 / Ash): the boost counts only on the part of its real duration
 * that overlaps the absence window [absenceStart, absenceEnd] on the game clock.
 * Returns milliseconds of overlap (≥ 0). Used later by idle settle — not wired yet.
 */
export function offlineBoostOverlapMs(
  entry: AppelEntry,
  absenceStart: number,
  absenceEnd: number,
): number {
  if (!(absenceEnd > absenceStart)) return 0;
  const act = activationMs(entry);
  const boostEnd = entry.until;
  const from = Math.max(act, absenceStart);
  const to = Math.min(boostEnd, absenceEnd);
  return Math.max(0, to - from);
}

/** Chance of drawing this associate given rarity rates and equal split within rarity (MAPPING). */
export function drawChancePercent(id: AssociateId | string): number {
  const def = ASSOCIATES.find((a) => a.id === id);
  if (!def) return 0;
  const inRarity = ASSOCIATES.filter((a) => a.rarity === def.rarity).length;
  const rate = { 1: 0.7, 2: 0.25, 3: 0.05 }[def.rarity] / inRarity;
  return Math.round(rate * 10000) / 100; // 17.5, 8.33, 2.5
}
