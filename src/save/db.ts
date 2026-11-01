import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { GameState } from '../core/types';
import { migrateToCurrent, type CurrentSave } from './migrations';
import { DOWNGRADE_SLOT, restoreWorkAfterDowngrade } from './downgrade';
import { CURRENT_SCHEMA_VERSION, validateSaveV4 } from './schema';

/**
 * IndexedDB persistence (ARCHITECTURE, SPEC-ADDENDUM RES-2, RES-3, RES-7d).
 * Slots: `current`, `previous` (last good state), `backup-before-import`,
 * `backup-before-reset` (raw copy kept when a new game replaces a save, RES-7 / DEF-GS-01).
 */
export type Slot =
  | 'current'
  | 'previous'
  | 'backup-before-import'
  | 'backup-before-reset'
  /** Lot 3: raw record as it was before the v2 → v3 migration (MVP v1.3 step 2). */
  | 'backup-before-migration'
  /** Lot 4 (R-L4-1): raw v3 record before the v3 → v4 migration; never overwritten by v1/v2. */
  | 'backup-before-migration-v3'
  /** Lot 3 (R12): current state before a manual restore; one copy, replaced each time. */
  | 'backup-before-restore'
  /** OD-18 / R-L4-17: raw v4 record kept by the 0.3.2 app before it downgraded `current`. */
  | typeof DOWNGRADE_SLOT;

interface TgsDB extends DBSchema {
  saves: { key: Slot; value: unknown };
}

export const DB_NAME = 'thegameshow';
const DB_VERSION = 1;

export class RevisionConflictError extends Error {
  constructor(
    readonly stored: number,
    readonly expected: number,
  ) {
    super(`revision conflict: stored ${stored}, expected ${expected}`);
  }
}

export function openSaveDb(name = DB_NAME): Promise<IDBPDatabase<TgsDB>> {
  return openDB<TgsDB>(name, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore('saves');
    },
  });
}

export type LoadResult =
  | { kind: 'empty' }
  | {
      kind: 'ok';
      save: CurrentSave;
      from: 'current' | 'previous' | 'backup-before-migration-v3' | 'backup-before-migration';
    }
  | { kind: 'corrupt'; reason: string }
  /** `current` comes from a newer app: refused, nothing is written (MVP v1.3 step 7). */
  | { kind: 'future'; version: number };

const versionOf = (v: unknown): number => {
  const n = (v as { schemaVersion?: unknown } | null | undefined)?.schemaVersion;
  return typeof n === 'number' ? n : -1;
};

/**
 * Loads `current`, falls back to `previous` (re-migrated when older), then to
 * `backup-before-migration-v3`, then to `backup-before-migration` (both re-migrated).
 * A future version in `current` is refused without fallback, so no older state can overwrite
 * it. Never throws on bad data (recovery screen).
 */
export async function loadSave(db: IDBPDatabase<TgsDB>): Promise<LoadResult> {
  const [cur, prev, mig3, mig] = await Promise.all([
    db.get('saves', 'current'),
    db.get('saves', 'previous'),
    db.get('saves', 'backup-before-migration-v3'),
    db.get('saves', 'backup-before-migration'),
  ]);
  if (cur === undefined && prev === undefined) return { kind: 'empty' };
  if (versionOf(cur) > CURRENT_SCHEMA_VERSION) return { kind: 'future', version: versionOf(cur) };
  const c = migrateToCurrent(cur);
  if (c.ok) {
    // Back from the 0.3.2 app (OD-18): a v3 `current` that was downgraded from v4 gets its
    // `work` back from `backup-before-downgrade-v4` when the v3 fields are unchanged.
    if (versionOf(cur) === 3) {
      const kept = await db.get('saves', DOWNGRADE_SLOT);
      const r = restoreWorkAfterDowngrade(c.value, cur, kept);
      const v = r.restored ? validateSaveV4(r.save) : null;
      if (v?.ok) return { kind: 'ok', save: v.value, from: 'current' };
    }
    return { kind: 'ok', save: c.value, from: 'current' };
  }
  const p = migrateToCurrent(prev);
  if (p.ok) return { kind: 'ok', save: p.value, from: 'previous' };
  if (mig3 !== undefined) {
    const m = migrateToCurrent(mig3);
    if (m.ok) return { kind: 'ok', save: m.value, from: 'backup-before-migration-v3' };
  }
  if (mig !== undefined) {
    const m = migrateToCurrent(mig);
    if (m.ok) return { kind: 'ok', save: m.value, from: 'backup-before-migration' };
  }
  return { kind: 'corrupt', reason: c.reason };
}

function storedRevision(v: unknown): number {
  const r = (v as { revision?: unknown } | undefined)?.revision;
  return typeof r === 'number' ? r : -1;
}

/**
 * Conditional write in ONE readwrite transaction, awaited (compare-and-set on `revision`).
 * `expectedRevision` is the revision this tab last loaded or wrote; -1 means "slot must be empty".
 * IndexedDB serialises readwrite transactions on the same store, so the compare and the
 * write are atomic even without Web Locks (fallback documented in SPEC-ADDENDUM RES-3).
 */
export async function writeSave(
  db: IDBPDatabase<TgsDB>,
  save: GameState,
  expectedRevision: number,
): Promise<GameState> {
  const tx = db.transaction('saves', 'readwrite');
  const store = tx.objectStore('saves');
  const current = await store.get('current');
  const stored = current === undefined ? -1 : storedRevision(current);
  if (stored !== expectedRevision) {
    tx.abort();
    await tx.done.catch(() => undefined);
    throw new RevisionConflictError(stored, expectedRevision);
  }
  const next: GameState = { ...save, revision: Math.max(expectedRevision, save.revision) + 1 };
  if (current !== undefined) await store.put(current, 'previous');
  await store.put(next, 'current');
  await tx.done;
  return next;
}

const sameRecord = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Slot that keeps a raw record of `version` before migration (R-L4-1: one slot per source). */
export function migrationSlotFor(version: number): Slot {
  return version === 3 ? 'backup-before-migration-v3' : 'backup-before-migration';
}

/**
 * Copies the raw `current` record before it is migrated (MVP v1.3 step 2): a v1/v2 record goes
 * to `backup-before-migration` (lot 3 rule; the v1/v2 → v4 chain runs in memory and never
 * writes `-v3`), a v3 record goes to `backup-before-migration-v3` (lot 4). Only if the slot is
 * empty or holds a different record, so a replay after an aborted migration never rewrites the
 * original copy. Returns true when it wrote.
 */
export async function backupBeforeMigration(db: IDBPDatabase<TgsDB>): Promise<boolean> {
  const tx = db.transaction('saves', 'readwrite');
  const cur = await tx.store.get('current');
  let wrote = false;
  const v = versionOf(cur);
  if (cur !== undefined && v < CURRENT_SCHEMA_VERSION) {
    const slot = migrationSlotFor(v);
    const kept = await tx.store.get(slot);
    if (!sameRecord(cur, kept)) {
      await tx.store.put(cur, slot);
      wrote = true;
    }
  }
  await tx.done;
  return wrote;
}

/** R12: keeps the raw current record before a manual restore replaces it. */
export async function backupBeforeRestore(db: IDBPDatabase<TgsDB>): Promise<void> {
  const tx = db.transaction('saves', 'readwrite');
  const cur = await tx.store.get('current');
  if (cur !== undefined) await tx.store.put(cur, 'backup-before-restore');
  await tx.done;
}

/** Keeps a copy of the current save before an import replaces it (RES-7c). */
export async function backupBeforeImport(db: IDBPDatabase<TgsDB>): Promise<void> {
  const tx = db.transaction('saves', 'readwrite');
  const cur = await tx.store.get('current');
  if (cur !== undefined) await tx.store.put(cur, 'backup-before-import');
  await tx.done;
}

/** Keeps the raw current record (even unreadable) before a new game overwrites it (DEF-GS-01). */
export async function backupBeforeReset(db: IDBPDatabase<TgsDB>): Promise<void> {
  const tx = db.transaction('saves', 'readwrite');
  const cur = await tx.store.get('current');
  if (cur !== undefined) await tx.store.put(cur, 'backup-before-reset');
  await tx.done;
}

/** Raw JSON of a slot, readable or not, so the player can download it before a reset. */
export async function readRawSlot(db: IDBPDatabase<TgsDB>, slot: Slot): Promise<string | null> {
  const v = await db.get('saves', slot);
  if (v === undefined) return null;
  return typeof v === 'string' ? v : JSON.stringify(v, null, 2);
}

export async function readRevision(db: IDBPDatabase<TgsDB>): Promise<number> {
  return storedRevision(await db.get('saves', 'current'));
}

export type SaveDb = IDBPDatabase<TgsDB>;
