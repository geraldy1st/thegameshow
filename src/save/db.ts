import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { SaveV1 } from '../core/types';
import { migrateToCurrent, type CurrentSave } from './migrations';

/**
 * IndexedDB persistence (ARCHITECTURE, SPEC-ADDENDUM RES-2, RES-3, RES-7d).
 * Slots: `current`, `previous` (last good state), `backup-before-import`,
 * `backup-before-reset` (raw copy kept when a new game replaces a save, RES-7 / DEF-GS-01).
 */
export type Slot = 'current' | 'previous' | 'backup-before-import' | 'backup-before-reset';

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
  | { kind: 'ok'; save: CurrentSave; from: 'current' | 'previous' }
  | { kind: 'corrupt'; reason: string };

/** Loads `current`, falls back to `previous`; never throws on bad data (recovery screen). */
export async function loadSave(db: IDBPDatabase<TgsDB>): Promise<LoadResult> {
  const [cur, prev] = await Promise.all([db.get('saves', 'current'), db.get('saves', 'previous')]);
  if (cur === undefined && prev === undefined) return { kind: 'empty' };
  const c = migrateToCurrent(cur);
  if (c.ok) return { kind: 'ok', save: c.value, from: 'current' };
  const p = migrateToCurrent(prev);
  if (p.ok) return { kind: 'ok', save: p.value, from: 'previous' };
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
  save: SaveV1,
  expectedRevision: number,
): Promise<SaveV1> {
  const tx = db.transaction('saves', 'readwrite');
  const store = tx.objectStore('saves');
  const current = await store.get('current');
  const stored = current === undefined ? -1 : storedRevision(current);
  if (stored !== expectedRevision) {
    tx.abort();
    await tx.done.catch(() => undefined);
    throw new RevisionConflictError(stored, expectedRevision);
  }
  const next: SaveV1 = { ...save, revision: Math.max(expectedRevision, save.revision) + 1 };
  if (current !== undefined) await store.put(current, 'previous');
  await store.put(next, 'current');
  await tx.done;
  return next;
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
