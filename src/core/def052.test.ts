import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import {
  CALL_COOLDOWN_MS,
  capAppelCooldowns,
  clampAppelForImport,
  remainingMs,
  startAppel,
  statusAt,
  toCoreEntry,
} from './appel';
import { ManualClock } from './clock';
import { createInitialState } from './state';
import { openSaveDb, writeSave } from '../save/db';
import { createGameStore } from '../store/gameStore';
import type { AppelPersisted, GameState } from './types';

const T0 = Date.UTC(2026, 10, 10, 8, 0, 0);
const H = 3_600_000;
const FOUR = 4 * H;

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

describe('R-052-03 official 4 h cooldown cap (narrow, DEF-GS-36 stays open)', () => {
  it('stored 24 h is shortened to 4 h (import clamp and cap helper)', () => {
    const p = entry({ activatedAt: T0, cooldownUntil: T0 + 24 * H });
    const clamped = clampAppelForImport({ omar: p }, T0, T0, { omar: 3 });
    expect(clamped.omar!.cooldownUntil).toBe(T0 + FOUR);
    expect(clamped.omar!.wallCooldownUntil).toBe(T0 + FOUR);
    const capped = capAppelCooldowns({ omar: p });
    expect(capped.omar!.cooldownUntil).toBe(T0 + FOUR);
    expect(capped.omar!.wallCooldownUntil).toBe(T0 + FOUR);
  });

  it('stored 4 h is unchanged', () => {
    const p = entry({ activatedAt: T0, cooldownUntil: T0 + FOUR });
    expect(capAppelCooldowns({ omar: p }).omar!.cooldownUntil).toBe(T0 + FOUR);
    expect(clampAppelForImport({ omar: p }, T0, T0, { omar: 3 }).omar!.cooldownUntil).toBe(
      T0 + FOUR,
    );
  });

  it('tampered 1 ms is left unchanged (EXP-02 / DEF-GS-36 remains demonstrable)', () => {
    const act = T0 - H;
    const p = entry({
      activatedAt: act,
      endsAt: act + H,
      cooldownUntil: act + 1,
      wallEndsAt: act + H,
      wallCooldownUntil: act + 1,
      activationId: 'exp02',
    });
    const out = capAppelCooldowns({ haru: p });
    expect(out.haru!.cooldownUntil).toBe(act + 1);
    expect(out.haru!.wallCooldownUntil).toBe(act + 1);
    const clamped = clampAppelForImport({ haru: p }, T0, T0, { haru: 2 });
    expect(clamped.haru!.cooldownUntil).toBe(act + 1);
    // New call accepted immediately (the 1 ms window is already over at T0).
    expect(statusAt(true, toCoreEntry(clamped.haru!), T0, T0)).toBe('available');
    const r = startAppel({ haru: toCoreEntry(clamped.haru!) }, 'haru', true, T0, T0);
    expect(r.ok).toBe(true);
  });

  it('activation more than 4 h ago (honest 24 h recharge) becomes available right away', () => {
    const act = T0 - 5 * H;
    const p = entry({ activatedAt: act, endsAt: act + H, cooldownUntil: act + 24 * H });
    const out = capAppelCooldowns({ omar: p });
    expect(out.omar!.cooldownUntil).toBe(act + FOUR); // in the past relative to T0
    expect(statusAt(true, toCoreEntry(out.omar!), T0, T0)).toBe('available');
  });

  it('call in progress for 1 h leaves 3 h of recharge', () => {
    const act = T0 - H;
    const p = entry({ activatedAt: act, endsAt: act + H, cooldownUntil: act + 24 * H });
    const now = T0;
    const out = capAppelCooldowns({ omar: p });
    expect(out.omar!.cooldownUntil).toBe(act + FOUR);
    expect(remainingMs(toCoreEntry(out.omar!), now, now).cool).toBe(3 * H);
  });

  it('the cap is idempotent', () => {
    const p = entry({ activatedAt: T0, cooldownUntil: T0 + 24 * H });
    const once = capAppelCooldowns({ omar: p });
    const twice = capAppelCooldowns(once);
    expect(twice).toEqual(once);
    const c1 = clampAppelForImport({ omar: p }, T0, T0, { omar: 3 });
    const c2 = clampAppelForImport(c1, T0, T0, { omar: 3 });
    expect(c2).toEqual(c1);
  });
});

describe('Q5: no schema bump; a 0.5.1 tab rewriting 24 h is capped on the next 0.5.2 load', () => {
  it('init of a v5 save with a 24 h cooldown rewrites it to 4 h; a second 24 h write is capped again', async () => {
    const name = `q5-24h-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const db = await openSaveDb(name);
    const act = T0;
    const v51: GameState = {
      ...seeded(),
      appel: {
        omar: entry({
          activatedAt: act,
          endsAt: act + H,
          cooldownUntil: act + 24 * H,
          wallEndsAt: act + H,
          wallCooldownUntil: act + 24 * H,
          activationId: 'v51-omar',
        }),
      },
    };
    expect(v51.schemaVersion).toBe(5);
    await writeSave(db, v51, -1);
    db.close();

    const clock = new ManualClock(T0 + H); // 1 h later: 3 h of recharge left after the cap
    const store = createGameStore({
      clock,
      openDb: () => openSaveDb(name),
      newSeed: () => 1,
      acquireWriterLock: async () => true,
      debounceMs: 5,
    });
    await store.getState().init();
    const g = store.getState().game!;
    expect(g.schemaVersion).toBe(5);
    expect(g.appel.omar!.cooldownUntil).toBe(act + FOUR);
    expect(g.appel.omar!.wallCooldownUntil).toBe(act + FOUR);
    expect(remainingMs(toCoreEntry(g.appel.omar!), T0 + H, T0 + H).cool).toBe(3 * H);

    // 0.5.1 tab overwrites current with a 24 h recharge (same schema v5).
    const db2 = await openSaveDb(name);
    const cur = (await db2.get('saves', 'current')) as GameState;
    await writeSave(
      db2,
      {
        ...cur,
        appel: {
          omar: entry({
            activatedAt: act,
            endsAt: act + H,
            cooldownUntil: act + 24 * H,
            wallEndsAt: act + H,
            wallCooldownUntil: act + 24 * H,
            activationId: 'v51-rewrite',
          }),
        },
      },
      cur.revision,
    );
    db2.close();

    const store2 = createGameStore({
      clock: new ManualClock(T0 + H),
      openDb: () => openSaveDb(name),
      newSeed: () => 1,
      acquireWriterLock: async () => true,
      debounceMs: 5,
    });
    await store2.getState().init();
    const g2 = store2.getState().game!;
    expect(g2.schemaVersion).toBe(5);
    expect(g2.appel.omar!.cooldownUntil).toBe(act + FOUR);
    expect(g2.appel.omar!.wallCooldownUntil).toBe(act + FOUR);
  });
});

describe('CT-APL-01 durations 30 min (1★/2★), 1 h (3★), recharge 4 h from activation', () => {
  it('uses the official 4 h constant', () => {
    expect(CALL_COOLDOWN_MS).toBe(FOUR);
    const r = startAppel({}, 'omar', true, T0, T0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.entry.until - T0).toBe(H);
    expect(r.entry.cool - T0).toBe(FOUR);
  });
});
