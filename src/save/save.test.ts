import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createInitialState, initialV3Fields } from '../core/state';
import { createRng, nextFloat } from '../core/rng';
import { CURRENT_SCHEMA_VERSION, validateSaveV2, validateSaveV3 } from './schema';
import { migrateToCurrent } from './migrations';
import { MAX_IMPORT_BYTES, fnv1a, parseImport, serializeExport } from './exportImport';
import {
  RevisionConflictError,
  backupBeforeImport,
  backupBeforeMigration,
  backupBeforeRestore,
  loadSave,
  openSaveDb,
  writeSave,
} from './db';
import initialV1 from './__fixtures__/v1-initial.json';
import midgameV1 from './__fixtures__/v1-midgame.json';
import initial from './__fixtures__/v2-initial.json';
import midgame from './__fixtures__/v2-midgame.json';
import initialV3 from './__fixtures__/v3-initial.json';
import midgameV3 from './__fixtures__/v3-midgame.json';

/** Lot 3: the v2 → v3 step adds the v3 fields at their initial values, nothing else. */
const withV3 = <T extends { maxSeenAt: number }>(v2: T) => ({
  ...v2,
  schemaVersion: 3,
  ...initialV3Fields(v2.maxSeenAt),
});

const T0 = Date.UTC(2026, 9, 25, 12, 0, 0);
let dbCounter = 0;
const freshDb = () => openSaveDb(`test-${++dbCounter}`);

describe('golden saves and migration chain (RES-7a)', () => {
  it.each([
    ['v3-initial', initialV3],
    ['v3-midgame', midgameV3],
  ])('%s loads through the chain unchanged', (_name, fixture) => {
    const r = migrateToCurrent(fixture);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual(fixture);
  });
  it.each([
    ['v2-initial', initial],
    ['v2-midgame', midgame],
  ])('%s migrates to v3 keeping every v2 value (GS-V5-05)', (_name, fixture) => {
    const r = migrateToCurrent(fixture);
    if (!r.ok) throw new Error(r.reason);
    expect(r.value).toEqual(withV3(fixture));
    const { profile, energy, stats, wardrobe, ...v2Part } = r.value;
    expect({ ...v2Part, schemaVersion: 2 }).toEqual(fixture);
    expect([profile, energy.value, wardrobe.outfit]).toEqual([{ level: 1, xp: 0 }, 50, 'jean']);
    expect(Object.values(stats)).toEqual(Array(10).fill(0));
  });
  it.each([
    ['v1-initial', initialV1],
    ['v1-midgame', midgameV1],
  ])('%s migrates to v2 keeping every v1 value', (_name, fixture) => {
    const r = migrateToCurrent(fixture);
    if (!r.ok) throw new Error(r.reason);
    expect(r.value).toEqual(
      withV3({
        ...fixture,
        schemaVersion: 2,
        gacha: { ...fixture.gacha, last: null },
        quests: { ...fixture.quests, quizChoice: null },
      }),
    );
  });
  it('v1-initial migrates to exactly v2-initial', () => {
    expect(migrateToCurrent(initialV1)).toEqual({ ok: true, value: initialV3 });
  });
  it('refuses an invalid v1 before migrating it', () => {
    expect(migrateToCurrent({ ...midgameV1, tickets: -1 }).ok).toBe(false);
  });
  it('imports a lot 1 (v1) export file', () => {
    const payload = JSON.stringify(midgameV1);
    const text = JSON.stringify({
      format: 'thegameshow-save',
      checksum: fnv1a(payload),
      save: midgameV1,
    });
    const r = parseImport(text);
    expect(r.ok && r.value.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });
  it('is idempotent', () => {
    const once = migrateToCurrent(midgame);
    if (!once.ok) throw new Error(once.reason);
    expect(migrateToCurrent(once.value)).toEqual(once);
  });
  it('refuses future versions and unknown versions', () => {
    expect(migrateToCurrent({ ...midgame, schemaVersion: CURRENT_SCHEMA_VERSION + 1 }).ok).toBe(
      false,
    );
    expect(migrateToCurrent({ ...midgame, schemaVersion: 0 }).ok).toBe(false);
    expect(migrateToCurrent({ ...midgame, schemaVersion: '1' }).ok).toBe(false);
  });
  it('the initial fixture equals the spec initial state', () => {
    expect(initialV3).toEqual(createInitialState(T0, 20261025));
  });
});

describe('validation bounds (RES-7c)', () => {
  const bad: Array<[string, unknown]> = [
    ['negative yen', { ...midgame, yenCents: -1 }],
    ['NaN tickets', { ...midgame, tickets: NaN }],
    ['fractional cents', { ...midgame, yenCents: 1.5 }],
    ['above 2^53', { ...midgame, yenCents: 2 ** 53 }],
    ['pity 50', { ...midgame, gacha: { ...midgame.gacha, pity: 50 } }],
    ['stars 6', { ...midgame, gacha: { ...midgame.gacha, stars: { jun: 6 } } }],
    ['unknown associate', { ...midgame, gacha: { ...midgame.gacha, stars: { ren: 1 } } }],
    [
      'affinity 101',
      {
        ...midgame,
        friends: { ...midgame.friends, ren: { ...midgame.friends.ren, affinity: 101 } },
      },
    ],
    ['bad day', { ...midgame, quests: { ...midgame.quests, day: 'tomorrow' } }],
    ['unexpected key', { ...midgame, gems: 100 }],
    ['lastSeen > maxSeen', { ...midgame, lastSeenAt: midgame.maxSeenAt + 1 }],
  ];
  it.each(bad)('rejects %s', (_n, v) => {
    expect(validateSaveV2(v).ok).toBe(false);
  });
  it.each([
    ['quiz choice 4', { ...midgame, quests: { ...midgame.quests, quizChoice: 4 } }],
    [
      'last draw stars 6',
      { ...midgame, gacha: { ...midgame.gacha, last: { ...midgame.gacha.last, stars: 6 } } },
    ],
    [
      'last draw friend id',
      { ...midgame, gacha: { ...midgame.gacha, last: { ...midgame.gacha.last, id: 'ren' } } },
    ],
    ['v1 shape labelled v2', { ...midgameV1, schemaVersion: 2 }],
  ])('rejects v2 %s', (_n, v) => {
    expect(validateSaveV2(v).ok).toBe(false);
  });
  it('rejects __proto__ / constructor keys from parsed JSON', () => {
    const text = JSON.stringify(midgame).replace('{', '{"__proto__":{"polluted":1},');
    expect(validateSaveV2(JSON.parse(text)).ok).toBe(false);
    const text2 = JSON.stringify(midgame).replace('"stars":{', '"stars":{"constructor":1,');
    expect(validateSaveV2(JSON.parse(text2)).ok).toBe(false);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('export / import (GS-CA5)', () => {
  it('round-trips to an identical state', () => {
    const r = parseImport(serializeExport(midgameV3 as never));
    expect(r).toEqual({ ok: true, value: midgameV3 });
  });
  it('detects accidental corruption via checksum', () => {
    const text = serializeExport(midgame as never).replace('"tickets": 4', '"tickets": 5');
    expect(parseImport(text)).toEqual({ ok: false, reason: 'checksum mismatch' });
  });
  it('rejects oversized files, non-JSON and wrong envelopes', () => {
    expect(parseImport('x'.repeat(MAX_IMPORT_BYTES + 1)).ok).toBe(false);
    expect(parseImport('{').ok).toBe(false);
    expect(parseImport('[]').ok).toBe(false);
    const save = midgame;
    const env = { format: 'other', checksum: fnv1a(JSON.stringify(save)), save };
    expect(parseImport(JSON.stringify(env)).ok).toBe(false);
    expect(parseImport(JSON.stringify({ ...env, format: 'thegameshow-save', extra: 1 })).ok).toBe(
      false,
    );
  });
});

describe('loader fuzz (RES-7b): never throws, never accepts garbage', () => {
  it('survives 2 000 random mutations and truncations', () => {
    const base = serializeExport(midgame as never);
    let rng = createRng(99);
    const rand = () => {
      const [v, n] = nextFloat(rng);
      rng = n;
      return v;
    };
    const chars = '{}[]":,0123456789-eE.nulltrue_proto';
    for (let i = 0; i < 2000; i++) {
      let t = base;
      const op = rand();
      if (op < 0.3) t = t.slice(0, Math.floor(rand() * t.length));
      else {
        const pos = Math.floor(rand() * t.length);
        t = t.slice(0, pos) + chars[Math.floor(rand() * chars.length)] + t.slice(pos + 1);
      }
      const r = parseImport(t);
      if (r.ok) expect(validateSaveV3(r.value).ok).toBe(true);
      expect(() => migrateToCurrent(safeParse(t))).not.toThrow();
    }
  });
});
const safeParse = (t: string): unknown => {
  try {
    return JSON.parse(t);
  } catch {
    return t;
  }
};

describe('IndexedDB persistence (RES-2, RES-3, RES-7d)', () => {
  it('empty db then write then load', async () => {
    const db = await freshDb();
    expect(await loadSave(db)).toEqual({ kind: 'empty' });
    const written = await writeSave(db, createInitialState(T0, 1), -1);
    expect(written.revision).toBe(1);
    const loaded = await loadSave(db);
    expect(loaded).toEqual({ kind: 'ok', save: written, from: 'current' });
  });
  it('conditional write: a stale tab gets a conflict and cannot rewind state (GS-CA15)', async () => {
    const db = await freshDb();
    const a = await writeSave(db, createInitialState(T0, 1), -1); // rev 1
    const tabA = await writeSave(db, { ...a, tickets: 9 }, a.revision); // rev 2
    await expect(writeSave(db, { ...a, tickets: 0 }, a.revision)).rejects.toBeInstanceOf(
      RevisionConflictError,
    );
    const loaded = await loadSave(db);
    expect(loaded.kind === 'ok' && loaded.save.tickets).toBe(9);
    expect(loaded.kind === 'ok' && loaded.save.revision).toBe(tabA.revision);
  });
  it('falls back to previous when current is corrupt; corrupt both => recovery', async () => {
    const db = await freshDb();
    const a = await writeSave(db, createInitialState(T0, 1), -1);
    await writeSave(db, { ...a, tickets: 7 }, a.revision);
    await db.put('saves', { garbage: true }, 'current');
    const r = await loadSave(db);
    expect(r.kind === 'ok' && r.from).toBe('previous');
    await db.put('saves', 'nope', 'previous');
    expect((await loadSave(db)).kind).toBe('corrupt');
  });
  it('an aborted transaction leaves the previous state intact', async () => {
    const db = await freshDb();
    const a = await writeSave(db, createInitialState(T0, 1), -1);
    const tx = db.transaction('saves', 'readwrite');
    await tx.store.put({ ...a, tickets: 99 }, 'current');
    tx.abort();
    await tx.done.catch(() => undefined);
    const r = await loadSave(db);
    expect(r.kind === 'ok' && r.save.tickets).toBe(3);
  });
  it('backs up the current save before import', async () => {
    const db = await freshDb();
    const a = await writeSave(db, createInitialState(T0, 1), -1);
    await backupBeforeImport(db);
    expect(await db.get('saves', 'backup-before-import')).toEqual(a);
  });
});

describe('schema v3 (lot 3, GS-V5-05/06)', () => {
  it.each([
    ['level 0', { ...midgameV3, profile: { level: 0, xp: 0 } }],
    ['level 1000', { ...midgameV3, profile: { level: 1000, xp: 0 } }],
    ['negative xp', { ...midgameV3, profile: { level: 1, xp: -1 } }],
    ['stat 101', { ...midgameV3, stats: { ...midgameV3.stats, intel: 101 } }],
    ['missing stat', { ...midgameV3, stats: { ...midgameV3.stats, intel: undefined } }],
    ['negative energy', { ...midgameV3, energy: { value: -1, updatedAt: 0 } }],
    ['energy extra key', { ...midgameV3, energy: { ...midgameV3.energy, x: 1 } }],
    ['outfit not a string', { ...midgameV3, wardrobe: { outfit: 3 } }],
    ['v2 shape labelled v3', { ...midgame, schemaVersion: 3 }],
    ['bad v2 part', { ...midgameV3, tickets: -1 }],
  ])('rejects %s', (_n, v) => {
    expect(validateSaveV3(JSON.parse(JSON.stringify(v))).ok).toBe(false);
  });
  it('normalises an unknown outfit to the initial one', () => {
    const r = validateSaveV3({ ...midgameV3, wardrobe: { outfit: 'kimono' } });
    expect(r.ok && r.value.wardrobe.outfit).toBe('jean');
  });
  it('migration is pure and deterministic (no clock read)', () => {
    expect(migrateToCurrent(midgame)).toEqual(migrateToCurrent(structuredClone(midgame)));
    expect(withV3(midgame).energy.updatedAt).toBe(midgame.maxSeenAt);
  });
});

describe('migration backups (lot 3, MVP v1.3 steps 2, 6, 7, 8 and R12)', () => {
  it('keeps the raw v2 record once, and never rewrites it on a replay', async () => {
    const db = await freshDb();
    await db.put('saves', midgame, 'current');
    expect(await backupBeforeMigration(db)).toBe(true);
    expect(await db.get('saves', 'backup-before-migration')).toEqual(midgame);
    expect(await backupBeforeMigration(db)).toBe(false);
    expect(await db.get('saves', 'backup-before-migration')).toEqual(midgame);
  });
  it('does not back up a v3 current record', async () => {
    const db = await freshDb();
    await writeSave(db, createInitialState(T0, 1), -1);
    expect(await backupBeforeMigration(db)).toBe(false);
    expect(await db.get('saves', 'backup-before-migration')).toBeUndefined();
  });
  it('falls back to backup-before-migration when current and previous are unreadable', async () => {
    const db = await freshDb();
    await db.put('saves', midgame, 'backup-before-migration');
    await db.put('saves', { garbage: true }, 'current');
    await db.put('saves', 'nope', 'previous');
    const r = await loadSave(db);
    expect(r).toEqual({ kind: 'ok', save: withV3(midgame), from: 'backup-before-migration' });
  });
  it('refuses a future version without falling back', async () => {
    const db = await freshDb();
    await db.put('saves', midgame, 'previous');
    await db.put('saves', { ...midgameV3, schemaVersion: 4 }, 'current');
    expect(await loadSave(db)).toEqual({ kind: 'future', version: 4 });
  });
  it('backup-before-restore copies current and leaves backup-before-import unchanged (R12)', async () => {
    const db = await freshDb();
    const a = await writeSave(db, createInitialState(T0, 1), -1);
    await backupBeforeImport(db);
    const b = await writeSave(db, { ...a, tickets: 8 }, a.revision);
    await backupBeforeRestore(db);
    expect(await db.get('saves', 'backup-before-restore')).toEqual(b);
    expect(await db.get('saves', 'backup-before-import')).toEqual(a);
  });
});
