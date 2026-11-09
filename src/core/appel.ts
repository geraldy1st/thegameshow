import { ASSOCIATES, type AssociateId, type BonusTarget, type Rarity } from '../data/balance';
import type { AppelPersisted, AppelReceipt } from './types';

/** 1★ / 2★ = 30 min; 3★ = 1 h (Geraldy via Mirage, 09/11). */
export const CALL_DURATION_MS: Readonly<Record<Rarity, number>> = {
  1: 30 * 60_000,
  2: 30 * 60_000,
  3: 60 * 60_000,
};
/** Recharge from activation, not from the end of the boost. */
export const CALL_COOLDOWN_MS = 24 * 60 * 60_000;

/**
 * DEF-GS-29: wall clock for UI / statusAt. Real wall time, never behind the local
 * `maxSeenAt` anchor (same spirit as activation + R-MV5-04 clamp). Passing the game
 * clock here again is a mutant: wall anchors would stay inert.
 */
export function displayWallNow(maxSeenAt: number, wallNow: number = Date.now()): number {
  if (!Number.isFinite(wallNow) || wallNow < 0) return maxSeenAt;
  return Math.max(wallNow, maxSeenAt);
}

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

/** Persist shape ↔ core entry (MIGRATION-V5-COMMUNE mapping). */
export function toCoreEntry(p: AppelPersisted): AppelEntry {
  return {
    until: p.endsAt,
    cool: p.cooldownUntil,
    wallUntil: p.wallEndsAt,
    wallCool: p.wallCooldownUntil,
  };
}

export function toPersisted(
  entry: AppelEntry,
  activationId: string,
  activatedAt: number,
): AppelPersisted {
  return {
    activatedAt,
    endsAt: entry.until,
    cooldownUntil: entry.cool,
    wallEndsAt: entry.wallUntil,
    wallCooldownUntil: entry.wallCool,
    activationId,
  };
}

export function mapToCore(appel: Readonly<Partial<Record<AssociateId, AppelPersisted>>>): AppelMap {
  const out: Partial<Record<AssociateId, AppelEntry>> = {};
  for (const a of ASSOCIATES) {
    const p = appel[a.id];
    if (p) out[a.id] = toCoreEntry(p);
  }
  return out;
}

/**
 * R-MV5-04: inconsistent clock vs local maxSeenAt anchor → treat as available (no phantom boost).
 * Clamps wall anchors upward to maxSeenAt when they sit behind the local anchor in a way that
 * would accelerate gain or shorten cooldown; clears the entry when walls are non-finite.
 */
export function clampAppelForImport(
  appel: Readonly<Partial<Record<AssociateId, AppelPersisted>>>,
  maxSeenAt: number,
): Partial<Record<AssociateId, AppelPersisted>> {
  const out: Partial<Record<AssociateId, AppelPersisted>> = {};
  for (const a of ASSOCIATES) {
    const p = appel[a.id];
    if (!p) continue;
    const nums = [p.activatedAt, p.endsAt, p.cooldownUntil, p.wallEndsAt, p.wallCooldownUntil];
    if (
      !nums.every((n) => Number.isFinite(n)) ||
      typeof p.activationId !== 'string' ||
      !p.activationId
    ) {
      continue; // drop → available, no phantom
    }
    // If wall cool end is before the local maxSeenAt while game cool is still ahead, clamp walls
    // to the local anchor so remaining = max(game, wall) cannot shrink below honest wait.
    let wallEnds = p.wallEndsAt;
    let wallCool = p.wallCooldownUntil;
    if (wallCool < maxSeenAt && p.cooldownUntil > maxSeenAt) {
      const lag = maxSeenAt - wallCool;
      wallCool = maxSeenAt;
      wallEnds = Math.max(wallEnds + lag, maxSeenAt);
    }
    out[a.id] = { ...p, wallEndsAt: wallEnds, wallCooldownUntil: wallCool };
  }
  return out;
}

export function makeActivationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `appel-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export type ActivateResult =
  | { ok: true; state: import('./types').GameState; entry: AppelPersisted; replay: boolean }
  | { ok: false; reason: 'locked' | 'busy' | 'bad-clock' };

/**
 * Pure activation against a GameState. Idempotent on activationId (receipts) and on busy status.
 * Store layer still must persist under lock (R-AS-03).
 */
export function activateAppelOnState(
  state: import('./types').GameState,
  id: AssociateId | string,
  now: number,
  wallNow: number,
  activationId: string,
): ActivateResult {
  if (state.appelReceipts.some((r) => r.activationId === activationId)) {
    const existing = state.appel[id as AssociateId];
    if (existing && existing.activationId === activationId) {
      return { ok: true, state, entry: existing, replay: true };
    }
    return {
      ok: true,
      state,
      entry: existing ?? {
        activatedAt: now,
        endsAt: now,
        cooldownUntil: now,
        wallEndsAt: wallNow,
        wallCooldownUntil: wallNow,
        activationId,
      },
      replay: true,
    };
  }
  const owned = (state.gacha.stars[id as AssociateId] ?? 0) > 0;
  const coreMap = mapToCore(state.appel);
  const started = startAppel(coreMap, id, owned, now, wallNow);
  if (!started.ok) return { ok: false, reason: started.reason };
  const activatedAt = now;
  const entry = toPersisted(started.entry, activationId, activatedAt);
  const def2 = ASSOCIATES.find((a) => a.id === id);
  if (!def2) return { ok: false, reason: 'locked' };
  const aid = def2.id;
  const receipt: AppelReceipt = {
    activationId,
    associateId: aid,
    activatedAt,
    endsAt: entry.endsAt,
    cooldownUntil: entry.cooldownUntil,
  };
  return {
    ok: true,
    replay: false,
    entry,
    state: {
      ...state,
      appel: { ...state.appel, [aid]: entry },
      appelReceipts: [...state.appelReceipts, receipt],
    },
  };
}
