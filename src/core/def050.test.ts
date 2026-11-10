import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { activateAppelOnState, clampAppelForImport, startAppel } from './appel';
import { ManualClock } from './clock';
import { createInitialState } from './state';
import { idleGainCentsBetween } from './idle';
import { clickValuePoints, tap } from './work';
import { openSaveDb, writeSave } from '../save/db';
import { serializeExport } from '../save/exportImport';
import { createGameStore } from '../store/gameStore';
import type { GameState } from './types';
import type { AppelPersisted } from './types';

const T0 = Date.UTC(2026, 10, 10, 8, 0, 0);
const H = 3_600_000;

/** QA economy seed: Omar 3★ + Haru 2★, Livret A lv 2 → 222 c/s, 312 c/s with Omar's call. */
function seeded(): GameState {
  const b = createInitialState(T0, 7);
  return {
    ...b,
    lastSeenAt: T0,
    maxSeenAt: T0,
    gacha: { ...b.gacha, stars: { omar: 3, haru: 2 } },
    investments: { save: 2, stock: 0, estate: 0 },
  };
}

describe('DEF-GS-31 / M07: import clamp of a future-dated call', () => {
  it('shifts a +5 h Omar 3★ call so duration stays 1 h (exact remaining and gain)', () => {
    const activatedAt = T0 + 5 * H;
    const entry: AppelPersisted = {
      activatedAt,
      endsAt: activatedAt + H, // real 3★ duration, literal 1 h
      cooldownUntil: activatedAt + 24 * H,
      wallEndsAt: activatedAt + H,
      wallCooldownUntil: activatedAt + 24 * H,
      activationId: 'future-omar',
    };
    const out = clampAppelForImport({ omar: entry }, T0, T0);
    expect(out.omar).toBeDefined();
    expect(out.omar!.activatedAt).toBe(T0);
    expect(out.omar!.endsAt).toBe(T0 + H); // not T0 + 6 h
    expect(out.omar!.endsAt - out.omar!.activatedAt).toBe(H);
    expect(out.omar!.cooldownUntil).toBe(T0 + 24 * H);
    // SHIFT (not DROP): 2 h absence = 1 h boosted + 1 h normal.
    const g: GameState = { ...seeded(), appel: out, appelReceipts: [] };
    expect(idleGainCentsBetween(g, T0, T0 + 2 * H)).toBe(312 * 3600 + 222 * 3600);
    // Real wall may already be past the exported start (QA clock vs afternoon Date.now):
    // wall must still sit on the maxSeenAt line so mid/mid offline is not a 6 h boost.
    const outWall = clampAppelForImport({ omar: entry }, T0, T0 + 5 * H + 13 * 60_000);
    expect(outWall.omar!.activatedAt).toBe(T0);
    expect(outWall.omar!.endsAt).toBe(T0 + H);
    expect(outWall.omar!.wallEndsAt).toBe(T0 + H);
    const g2: GameState = { ...seeded(), appel: outWall, appelReceipts: [] };
    expect(idleGainCentsBetween(g2, T0, T0 + 2 * H)).toBe(312 * 3600 + 222 * 3600);
  });

  it('importSave applies the same clamp (mutant: identity clamp leaves +5 h start)', async () => {
    const name = `def31-imp-${Date.now()}`;
    const db = await openSaveDb(name);
    await writeSave(db, seeded(), -1);
    db.close();
    const clock = new ManualClock(T0);
    const store = createGameStore({
      clock,
      openDb: () => openSaveDb(name),
      newSeed: () => 1,
      acquireWriterLock: async () => true,
      debounceMs: 5,
    });
    await store.getState().init();
    const A = T0 + 5 * H;
    const exp = { ...seeded(), lastSeenAt: A, maxSeenAt: A };
    const act = activateAppelOnState(exp, 'omar', A, A, 'qa-future');
    if (!act.ok) throw new Error('activate');
    const r = await store.getState().importSave(serializeExport(act.state));
    expect(r).toEqual({ ok: true });
    const g = store.getState().game!;
    expect(g.appel.omar?.activatedAt).toBe(T0);
    expect(g.appel.omar?.endsAt).toBe(T0 + H);
    expect(g.maxSeenAt).toBe(T0);
    expect(g.lastSeenAt).toBe(T0);
    expect(idleGainCentsBetween(g, T0, T0 + 2 * H)).toBe(312 * 3600 + 222 * 3600);
  });
});

describe('M05: a 3★ call lasts 1 h, not 30 min (literal, not CALL_DURATION_MS[3])', () => {
  it('Omar (3★) until = now + 3 600 000 ms', () => {
    const r = startAppel({}, 'omar', true, T0, T0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.entry.until - T0).toBe(3_600_000);
    expect(r.entry.until - T0).not.toBe(1_800_000);
    const later = activateAppelOnState(seeded(), 'omar', T0, T0, 'dur-3star');
    if (!later.ok) throw new Error('activate');
    // Still active after 30 min + 1 ms (the 30 min mutant would have ended).
    expect(later.state.appel.omar!.endsAt).toBe(T0 + 3_600_000);
    expect(later.state.appel.omar!.endsAt).toBeGreaterThan(T0 + 30 * 60_000 + 1);
  });
});

describe('M04: power boost is multiplicative with appel ×2 (exact points)', () => {
  it('Jun 5★ + appel ×2 + power boost ×2 at level 10 yields 36 points, not 19', () => {
    // Jun 5★ « all »: 8 % × 5 = 40 %, ×2 call = 80 % → multiplier 1.80.
    // clickVal = round(10 × 1.80) = 18. POWER BOOST ×2 → 36.
    // Additive mutant `clickValuePoints + mult - 1` would yield 18 + 2 - 1 = 19.
    const base: GameState = {
      ...createInitialState(T0, 7),
      lastSeenAt: T0,
      maxSeenAt: T0,
      gacha: { ...createInitialState(T0, 7).gacha, stars: { jun: 5 } },
      profile: { ...createInitialState(T0, 7).profile, level: 10 },
    };
    const act = activateAppelOnState(base, 'jun', T0, T0, 'jun-call');
    if (!act.ok) throw new Error('activate');
    const g = act.state;
    expect(clickValuePoints(g)).toBe(18);
    const r = tap(g, [], T0, 2);
    if (!r.accepted) throw new Error('refused');
    expect(r.gained).toBe(36);
  });
});
