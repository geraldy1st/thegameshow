import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { associatePercent, capAppelCooldowns, clampAppelForImport, toCoreEntry } from './appel';
import { bonusMultiplier, clickValueYen } from './economy';
import { ManualClock } from './clock';
import { createInitialState } from './state';
import { openSaveDb, writeSave } from '../save/db';
import { createGameStore } from '../store/gameStore';
import { serializeExport } from '../save/exportImport';
import type { AppelPersisted, GameState } from './types';

const T0 = Date.UTC(2026, 10, 10, 8, 0, 0);
const H = 3_600_000;
const FOUR = 4 * H;

function entry(overrides: Partial<AppelPersisted> & { activatedAt: number }): AppelPersisted {
  const act = overrides.activatedAt;
  const dur = overrides.endsAt !== undefined ? overrides.endsAt - act : H;
  const cool = overrides.cooldownUntil ?? act + 24 * H;
  return {
    activatedAt: act,
    endsAt: act + dur,
    cooldownUntil: cool,
    wallEndsAt: overrides.wallEndsAt ?? act + dur,
    wallCooldownUntil: overrides.wallCooldownUntil ?? cool,
    activationId: overrides.activationId ?? 'e',
  };
}

function seeded(): GameState {
  const b = createInitialState(T0, 7);
  return {
    ...b,
    lastSeenAt: T0,
    maxSeenAt: T0,
    gacha: { ...b.gacha, stars: { ...b.gacha.stars, omar: 3, haru: 2, jun: 1 } },
    investments: { save: 2, stock: 0, estate: 0 },
  };
}

describe('R-052D-04 Jun target all also doubles the click', () => {
  it('associatePercent, bonusMultiplier(click) and clickValueYen all take the ×2', () => {
    const g = seeded();
    const quiet = clickValueYen(g);
    expect(associatePercent('jun', 1, 'click', undefined, T0, T0)).toBe(8);
    expect(bonusMultiplier(g, 'click', T0, T0)).toBe(1.08);
    const ev = entry({ activatedAt: T0, endsAt: T0 + H, cooldownUntil: T0 + FOUR });
    const during: GameState = { ...g, appel: { ...g.appel, jun: ev } };
    expect(associatePercent('jun', 1, 'click', toCoreEntry(ev), T0, T0)).toBe(16);
    expect(bonusMultiplier(during, 'click', T0, T0)).toBe(1.16);
    // clickValueYen rounds a 1-yen base, so the ×2 is asserted on the multiplier.
    expect(clickValueYen(during)).toBe(Math.max(1, Math.round(1 * 1.16)));
    expect(quiet).toBe(Math.max(1, Math.round(1 * 1.08)));
  });
});

describe('C05: wall cooldown is capped from the wall activation, not the game clock', () => {
  it('keeps a diverging wall cap at wallAct + 4 h', () => {
    const act = T0;
    const wallAct = T0 + 10 * H;
    const p = entry({
      activatedAt: act,
      endsAt: act + H,
      cooldownUntil: act + 24 * H,
      wallEndsAt: wallAct + H,
      wallCooldownUntil: wallAct + 24 * H,
    });
    const out = capAppelCooldowns({ omar: p });
    expect(out.omar!.cooldownUntil).toBe(act + FOUR);
    expect(out.omar!.wallCooldownUntil).toBe(wallAct + FOUR);
    // Mutant C05 would cap the wall against act, collapsing it to act + 4 h.
    expect(out.omar!.wallCooldownUntil).not.toBe(act + FOUR);
  });
});

describe('M16: a future wall anchor is shifted to the local wall clamp', () => {
  it('leaves a past game activation in place and pulls the wall back', () => {
    const act = T0 - H;
    const wallAct = T0 + 10 * H;
    const p = entry({
      activatedAt: act,
      endsAt: act + H,
      cooldownUntil: act + FOUR,
      wallEndsAt: wallAct + H,
      wallCooldownUntil: wallAct + FOUR,
    });
    const out = clampAppelForImport({ omar: p }, T0, T0, { omar: 3 });
    expect(out.omar!.activatedAt).toBe(act);
    expect(out.omar!.endsAt).toBe(act + H);
    expect(out.omar!.wallEndsAt).toBe(T0 + H);
    expect(out.omar!.wallCooldownUntil).toBe(T0 + FOUR);
    // Mutant M16 would leave wallEndsAt at wallAct + H.
    expect(out.omar!.wallEndsAt).toBeLessThan(wallAct);
  });
});

describe('C07: restore from a backup applies the 4 h cap', () => {
  it('restoreResetBackup caps a stored 24 h recharge', async () => {
    const name = `c07-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const db = await openSaveDb(name);
    await writeSave(db, seeded(), -1);
    const backup: GameState = {
      ...seeded(),
      appel: {
        omar: entry({
          activatedAt: T0,
          endsAt: T0 + H,
          cooldownUntil: T0 + 24 * H,
          wallEndsAt: T0 + H,
          wallCooldownUntil: T0 + 24 * H,
          activationId: 'c07',
        }),
      },
    };
    await db.put('saves', backup, 'backup-before-reset');
    db.close();
    const store = createGameStore({
      clock: new ManualClock(T0),
      openDb: () => openSaveDb(name),
      newSeed: () => 1,
      acquireWriterLock: async () => true,
      debounceMs: 5,
    });
    await store.getState().init();
    expect(await store.getState().restoreResetBackup()).toBe(true);
    expect(store.getState().game!.appel.omar!.cooldownUntil).toBe(T0 + FOUR);
    expect(store.getState().game!.appel.omar!.wallCooldownUntil).toBe(T0 + FOUR);
  });
});

describe('M17: importSave forwards owned stars to the clamp', () => {
  it('drops a call when the imported stars for that associate are 0', async () => {
    const name = `m17-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const db = await openSaveDb(name);
    await writeSave(db, seeded(), -1);
    db.close();
    const store = createGameStore({
      clock: new ManualClock(T0),
      openDb: () => openSaveDb(name),
      newSeed: () => 1,
      acquireWriterLock: async () => true,
      debounceMs: 5,
    });
    await store.getState().init();
    const incoming: GameState = {
      ...seeded(),
      gacha: { ...seeded().gacha, stars: { ...seeded().gacha.stars, haru: undefined } },
      appel: {
        haru: entry({
          activatedAt: T0,
          endsAt: T0 + 30 * 60_000,
          cooldownUntil: T0 + FOUR,
          wallEndsAt: T0 + 30 * 60_000,
          wallCooldownUntil: T0 + FOUR,
          activationId: 'm17-haru',
        }),
      },
    };
    expect((await store.getState().importSave(serializeExport(incoming))).ok).toBe(true);
    expect(store.getState().game!.appel.haru).toBeUndefined();
  });
});
