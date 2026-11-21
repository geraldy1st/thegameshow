import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createInitialState, initialV5Fields } from '../core/state';
import { gameIdFromCreatedAt, gameIdFromV5 } from '../core/gameId';
import { localDay } from '../core/clock';
import { CURRENT_SCHEMA_VERSION, ECMA_DATE_MAX, validateSaveV5, validateSaveV6 } from './schema';
import { migrateToCurrent } from './migrations';
import {
  backupBeforeMigration,
  loadSave,
  migrateCurrentSameTx,
  migrationSlotFor,
  openSaveDb,
  writeSave,
} from './db';
import midgameV4 from './__fixtures__/v4-midgame.json';

const T0 = Date.UTC(2026, 9, 25, 12, 0, 0);
const GID = '01234567-89ab-4def-8012-3456789abcde';
const RUN = '0a0a0a0a-0b0b-4c0c-8d0d-0e0e0e0e0e0e';

function v5FromV4(v4: typeof midgameV4) {
  return { ...v4, schemaVersion: 5 as const, ...initialV5Fields() };
}

function validV6(over: Record<string, unknown> = {}) {
  return { ...createInitialState(T0, 1, GID), ...over };
}

describe('CURRENT_SCHEMA_VERSION', () => {
  it('is 6 and refuses 7', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(6);
    expect(migrateToCurrent({ ...validV6(), schemaVersion: 7 }).ok).toBe(false);
  });
});

describe('validateSaveV6', () => {
  it('accepts createInitialState and a skipped civil day as bike.day', () => {
    expect(validateSaveV6(createInitialState(T0, 1, GID)).ok).toBe(true);
    const g = validV6();
    expect(validateSaveV6({ ...g, bike: { ...g.bike, day: '1994-12-31' } }).ok).toBe(true);
    expect(validateSaveV6({ ...g, bike: { ...g.bike, day: '2011-12-30' } }).ok).toBe(true);
    expect(validateSaveV6({ ...g, bike: { ...g.bike, day: '1993-08-21' } }).ok).toBe(true);
  });
  it('rejects a v5 object, a missing gameId, an uppercase UUID, bike null, 1995-01-00', () => {
    const g = validV6();
    expect(validateSaveV6(v5FromV4(midgameV4)).ok).toBe(false);
    const { gameId: _g, ...noId } = g;
    void _g;
    expect(validateSaveV6(noId).ok).toBe(false);
    expect(validateSaveV6({ ...g, gameId: GID.toUpperCase() }).ok).toBe(false);
    expect(validateSaveV6({ ...g, bike: null }).ok).toBe(false);
    expect(validateSaveV6({ ...g, bike: { ...g.bike, day: '1995-01-00' } }).ok).toBe(false);
  });
  it('rejects out-of-range bike fields and a too-large timestamp', () => {
    const g = validV6();
    expect(validateSaveV6({ ...g, bike: { ...g.bike, earnedTodayCents: 100_001 } }).ok).toBe(false);
    expect(validateSaveV6({ ...g, bike: { ...g.bike, progressRulesVersion: 2 } }).ok).toBe(false);
    expect(validateSaveV6({ ...g, bike: { ...g.bike, successes: -1 } }).ok).toBe(false);
    expect(
      validateSaveV6({ ...g, bike: { ...g.bike, best: { coins: 21, distanceM: 10 } } }).ok,
    ).toBe(false);
    expect(
      validateSaveV6({ ...g, createdAt: ECMA_DATE_MAX + 1, lastSeenAt: T0, maxSeenAt: T0 }).ok,
    ).toBe(false);
  });
  it('rejects a duplicate runId and too few counters for recent receipts', () => {
    const g = validV6();
    const receipt = {
      runId: RUN,
      gameId: GID,
      day: g.bike.day,
      paidCents: 200,
      outcome: 'fail' as const,
      at: T0,
    };
    expect(
      validateSaveV6({
        ...g,
        bike: { ...g.bike, successes: 0, failures: 0, receipts: [receipt] },
      }).ok,
    ).toBe(false);
    expect(
      validateSaveV6({
        ...g,
        bike: {
          ...g.bike,
          successes: 0,
          failures: 1,
          receipts: [receipt, { ...receipt, runId: RUN }],
        },
      }).ok,
    ).toBe(false);
    expect(
      validateSaveV6({
        ...g,
        bike: { ...g.bike, successes: 0, failures: 1, receipts: [receipt] },
      }).ok,
    ).toBe(true);
  });
});

describe('MIGRATIONS[5] v5 → v6', () => {
  it('mints gameId only from createdAt and initialises bike from maxSeenAt', () => {
    const v5 = v5FromV4(midgameV4);
    expect(validateSaveV5(v5).ok).toBe(true);
    const r = migrateToCurrent(v5);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const minted = gameIdFromV5({ createdAt: v5.createdAt });
    expect(minted.ok).toBe(true);
    if (!minted.ok) return;
    expect(r.value.gameId).toBe(minted.gameId);
    const again = gameIdFromCreatedAt(v5.createdAt);
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(r.value.gameId).toBe(again.gameId);
    expect(r.value.schemaVersion).toBe(6);
    expect(r.value.bike).toEqual({
      day: localDay(v5.maxSeenAt),
      earnedTodayCents: 0,
      best: null,
      receipts: [],
      progressRulesVersion: 1,
      successes: 0,
      failures: 0,
    });
    expect(r.value.appel).toEqual(v5.appel);
    expect(migrateToCurrent(r.value)).toEqual(r);
  });
});

describe('backup-before-migration-v5', () => {
  it('uses the -v5 slot and writes it only if empty', async () => {
    expect(migrationSlotFor(5)).toBe('backup-before-migration-v5');
    const db = await openSaveDb(`v6-slot-${Date.now()}-${Math.random()}`);
    const v5 = v5FromV4(midgameV4);
    await db.put('saves', v5, 'current');
    expect(await backupBeforeMigration(db)).toBe(true);
    expect(await db.get('saves', 'backup-before-migration-v5')).toEqual(v5);
    const other = { ...v5, revision: v5.revision + 9 };
    await db.put('saves', other, 'current');
    expect(await backupBeforeMigration(db)).toBe(false);
    expect(await db.get('saves', 'backup-before-migration-v5')).toEqual(v5);
    db.close();
  });
  it('falls back current → previous → -v5 and never overwrites a valid v6 current', async () => {
    const db = await openSaveDb(`v6-fb-${Date.now()}-${Math.random()}`);
    const v5 = v5FromV4(midgameV4);
    await db.put('saves', v5, 'backup-before-migration-v5');
    await db.put('saves', { junk: true }, 'current');
    const loaded = await loadSave(db);
    expect(loaded.kind).toBe('ok');
    if (loaded.kind === 'ok') {
      expect(loaded.from).toBe('backup-before-migration-v5');
      expect(loaded.save.schemaVersion).toBe(6);
    }
    const v6 = createInitialState(T0, 1, GID);
    await writeSave(db, v6, -1);
    const again = await loadSave(db);
    expect(again.kind).toBe('ok');
    if (again.kind === 'ok') {
      expect(again.from).toBe('current');
      expect(again.save.gameId).toBe(GID);
    }
    expect(await db.get('saves', 'backup-before-migration-v4')).toBeUndefined();
    db.close();
  });
  it('migrateCurrentSameTx writes -v5 only when empty and leaves a present different copy', async () => {
    const db = await openSaveDb(`v6-same-${Date.now()}-${Math.random()}`);
    const v5 = v5FromV4(midgameV4);
    const kept = { ...v5, revision: 0 };
    await db.put('saves', kept, 'backup-before-migration-v5');
    await db.put('saves', v5, 'current');
    const migrated = await migrateCurrentSameTx(db);
    expect(migrated?.schemaVersion).toBe(6);
    expect(await db.get('saves', 'backup-before-migration-v5')).toEqual(kept);
    db.close();
  });
});
