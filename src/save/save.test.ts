import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createInitialState } from '../core/state';
import { createRng, nextFloat } from '../core/rng';
import { CURRENT_SCHEMA_VERSION, validateSaveV1 } from './schema';
import { migrateToCurrent } from './migrations';
import { MAX_IMPORT_BYTES, fnv1a, parseImport, serializeExport } from './exportImport';
import {
  RevisionConflictError,
  backupBeforeImport,
  loadSave,
  openSaveDb,
  writeSave,
} from './db';
import initial from './__fixtures__/v1-initial.json';
import midgame from './__fixtures__/v1-midgame.json';

const T0 = Date.UTC(2026, 9, 25, 12, 0, 0);
let dbCounter = 0;
const freshDb = () => openSaveDb(`test-${++dbCounter}`);

describe('golden saves and migration chain (RES-7a)', () => {
  it.each([
    ['v1-initial', initial],
    ['v1-midgame', midgame],
  ])('%s loads through the chain unchanged', (_name, fixture) => {
    const r = migrateToCurrent(fixture);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual(fixture);
  });
  it('is idempotent', () => {
    const once = migrateToCurrent(midgame);
    if (!once.ok) throw new Error(once.reason);
    expect(migrateToCurrent(once.value)).toEqual(once);
  });
  it('refuses future versions and unknown versions', () => {
    expect(migrateToCurrent({ ...midgame, schemaVersion: CURRENT_SCHEMA_VERSION + 1 }).ok).toBe(false);
    expect(migrateToCurrent({ ...midgame, schemaVersion: 0 }).ok).toBe(false);
    expect(migrateToCurrent({ ...midgame, schemaVersion: '1' }).ok).toBe(false);
  });
  it('the initial fixture equals the spec initial state', () => {
    expect(initial).toEqual(createInitialState(T0, 20261025));
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
    ['affinity 101', { ...midgame, friends: { ...midgame.friends, ren: { ...midgame.friends.ren, affinity: 101 } } }],
    ['bad day', { ...midgame, quests: { ...midgame.quests, day: 'tomorrow' } }],
    ['unexpected key', { ...midgame, gems: 100 }],
    ['lastSeen > maxSeen', { ...midgame, lastSeenAt: midgame.maxSeenAt + 1 }],
  ];
  it.each(bad)('rejects %s', (_n, v) => {
    expect(validateSaveV1(v).ok).toBe(false);
  });
  it('rejects __proto__ / constructor keys from parsed JSON', () => {
    const text = JSON.stringify(midgame).replace('{', '{"__proto__":{"polluted":1},');
    expect(validateSaveV1(JSON.parse(text)).ok).toBe(false);
    const text2 = JSON.stringify(midgame).replace('"stars":{', '"stars":{"constructor":1,');
    expect(validateSaveV1(JSON.parse(text2)).ok).toBe(false);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('export / import (GS-CA5)', () => {
  it('round-trips to an identical state', () => {
    const r = parseImport(serializeExport(midgame as never));
    expect(r).toEqual({ ok: true, value: midgame });
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
    expect(parseImport(JSON.stringify({ ...env, format: 'thegameshow-save', extra: 1 })).ok).toBe(false);
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
      if (r.ok) expect(validateSaveV1(r.value).ok).toBe(true);
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
