import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ASSOCIATES, type AssociateId } from '../data/balance';
import {
  CALL_COOLDOWN_MS,
  CALL_DURATION_MS,
  activationMs,
  associatePercent,
  callMult,
  drawChancePercent,
  offlineBoostOverlapMs,
  remainingMs,
  startAppel,
  statusAt,
  type AppelEntry,
  type AppelMap,
} from './appel';

const NOW = 1_700_000_000_000;
const WALL = 1_700_000_000_000;

function start(id: AssociateId, map: AppelMap = {}, now = NOW, wall = WALL) {
  return startAppel(map, id, true, now, wall);
}

describe('appel durations and states', () => {
  it('1★/2★ last 30 min, 3★ last 1 h; cool is 24 h from activation', () => {
    for (const a of ASSOCIATES) {
      const r = start(a.id);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.entry.until - NOW).toBe(CALL_DURATION_MS[a.rarity]);
      expect(r.entry.cool - NOW).toBe(CALL_COOLDOWN_MS);
      expect(activationMs(r.entry)).toBe(NOW);
      expect(statusAt(true, r.entry, NOW + 1, WALL + 1)).toBe('active');
      expect(
        statusAt(
          true,
          r.entry,
          NOW + CALL_DURATION_MS[a.rarity] + 1,
          WALL + CALL_DURATION_MS[a.rarity] + 1,
        ),
      ).toBe('cooling');
      expect(statusAt(true, r.entry, NOW + CALL_COOLDOWN_MS + 1, WALL + CALL_COOLDOWN_MS + 1)).toBe(
        'available',
      );
    }
  });

  it('locked when not owned; available with no entry', () => {
    expect(statusAt(false, undefined, NOW, WALL)).toBe('locked');
    expect(statusAt(true, undefined, NOW, WALL)).toBe('available');
    expect(startAppel({}, 'haru', false, NOW, WALL)).toEqual({ ok: false, reason: 'locked' });
  });

  it('start is idempotent against double-start (busy)', () => {
    const a = start('omar');
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    const b = startAppel(a.map, 'omar', true, NOW + 1000, WALL + 1000);
    expect(b).toEqual({ ok: false, reason: 'busy' });
  });

  it('several associates can be active at once', () => {
    let map: AppelMap = {};
    for (const id of ['omar', 'haru', 'jun'] as const) {
      const r = startAppel(map, id, true, NOW, WALL);
      expect(r.ok).toBe(true);
      if (r.ok) map = r.map;
    }
    expect(statusAt(true, map.omar, NOW + 1, WALL + 1)).toBe('active');
    expect(statusAt(true, map.haru, NOW + 1, WALL + 1)).toBe('active');
    expect(statusAt(true, map.jun, NOW + 1, WALL + 1)).toBe('active');
  });
});

describe('appel clock anchors', () => {
  it('forward jump of the game clock alone does not shorten active or recharge', () => {
    const r = start('kei');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // +23 h on the game clock, +1 min on the wall → still active (wallUntil not reached).
    expect(statusAt(true, r.entry, NOW + 23 * 3600_000, WALL + 60_000)).toBe('active');
    // Wall past the boost, game clock near +23 h → cooling, not available (wallCool).
    const afterBoost = WALL + CALL_DURATION_MS[1] + 1_000;
    expect(statusAt(true, r.entry, NOW + 23 * 3600_000, afterBoost)).toBe('cooling');
    expect(remainingMs(r.entry, NOW + 23 * 3600_000, afterBoost).cool).toBeGreaterThan(60 * 60_000);
  });

  it('rollback of the game clock does not reset to available nor shorten via wall', () => {
    const r = start('lila');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // After 20 h on both clocks → cooling; then game clock rolls back 10 h.
    const t = NOW + 20 * 3600_000;
    const w = WALL + 20 * 3600_000;
    expect(statusAt(true, r.entry, t, w)).toBe('cooling');
    expect(statusAt(true, r.entry, t - 10 * 3600_000, w)).toBe('cooling');
  });

  it('fast-check: remaining cool is never below wall remaining while wallCool > wallNow', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: CALL_COOLDOWN_MS }),
        fc.integer({ min: 0, max: CALL_COOLDOWN_MS }),
        (dg, dw) => {
          const entry: AppelEntry = {
            until: NOW + CALL_DURATION_MS[1],
            cool: NOW + CALL_COOLDOWN_MS,
            wallUntil: WALL + CALL_DURATION_MS[1],
            wallCool: WALL + CALL_COOLDOWN_MS,
          };
          const { cool } = remainingMs(entry, NOW + dg, WALL + dw);
          const wallRem = Math.max(0, entry.wallCool - (WALL + dw));
          expect(cool).toBeGreaterThanOrEqual(wallRem);
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe('callMult and associatePercent', () => {
  it('×2 on the associate contribution while active; 1 otherwise', () => {
    const r = start('omar');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Omar 3★ save 25%/★ → 75 %; active → 150 %.
    expect(associatePercent('omar', 3, 'save', r.entry, NOW + 1, WALL + 1)).toBe(150);
    expect(callMult(true, r.entry, NOW + 1, WALL + 1)).toBe(2);
    expect(
      associatePercent(
        'omar',
        3,
        'save',
        r.entry,
        NOW + CALL_DURATION_MS[3] + 1,
        WALL + CALL_DURATION_MS[3] + 1,
      ),
    ).toBe(75);
    expect(associatePercent('omar', 3, 'click', r.entry, NOW + 1, WALL + 1)).toBe(0);
  });

  it('Jun (all) applies to every target when active', () => {
    const r = start('jun');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 2★ × 8 % × 2 = 32
    expect(associatePercent('jun', 2, 'click', r.entry, NOW + 1, WALL + 1)).toBe(32);
    expect(associatePercent('jun', 2, 'save', r.entry, NOW + 1, WALL + 1)).toBe(32);
  });
});

describe('offlineBoostOverlapMs', () => {
  it('counts only the overlap of the boost window with the absence', () => {
    const r = start('haru');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const dur = CALL_DURATION_MS[1];
    // Absence covers the whole boost → full duration.
    expect(offlineBoostOverlapMs(r.entry, NOW - 1000, NOW + dur + 1000)).toBe(dur);
    // Absence starts halfway → half.
    expect(offlineBoostOverlapMs(r.entry, NOW + dur / 2, NOW + dur + 5000)).toBe(dur / 2);
    // Absence after boost → 0.
    expect(offlineBoostOverlapMs(r.entry, NOW + dur + 1, NOW + dur + 10_000)).toBe(0);
    // Absence before activation → 0.
    expect(offlineBoostOverlapMs(r.entry, NOW - 10_000, NOW - 1)).toBe(0);
  });
});

describe('drawChancePercent (MAPPING)', () => {
  it('matches the sourced chances', () => {
    expect(drawChancePercent('haru')).toBe(17.5);
    expect(drawChancePercent('noa')).toBe(8.33);
    expect(drawChancePercent('omar')).toBe(2.5);
  });
});
