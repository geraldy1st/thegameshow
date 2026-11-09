import type { SaveV3 } from '../core/types';
import { validateSaveV3, type ValidationResult } from './schema';

/**
 * Lossless v4 -> v3 downgrade (OD-18 v1.3, R-L4-17, GS-V5-65).
 *
 * This file is self-contained on purpose: the same code runs in the 0.3.2 fix of the lot 3 app
 * (which downgrades a lot 4 save instead of refusing it) and in lot 4 (which restores `work`
 * when the player comes back). It only depends on `validateSaveV3`, present in both.
 *
 * - The raw v4 record is kept first in `backup-before-downgrade-v4`.
 * - `current` becomes the v4 record minus `work`, with schemaVersion 3: every v3 field is kept
 *   as is (deep equality).
 * - Going back to lot 4 restores `work` from that slot when its v3 fields are identical to the
 *   ones of `current` (bookkeeping excluded: revision, lastSeenAt, maxSeenAt), otherwise `work`
 *   starts at its initial value (QA-REQUEST-LOT4 §6 bis).
 */
export const DOWNGRADE_SLOT = 'backup-before-downgrade-v4' as const;

/** Announcement shown once by the 0.3.2 app after a downgrade (QA-REQUEST-LOT4 §6 bis). */
export const DOWNGRADE_ANNOUNCEMENT = 'Sauvegarde ramenée à la version précédente du jeu';

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** v4 record minus `work`, schemaVersion 3, validated with the v3 rules. Never throws. */
export function downgradeV4ToV3(input: unknown): ValidationResult<SaveV3> {
  if (!isObject(input) || (input.schemaVersion !== 4 && input.schemaVersion !== 5))
    return { ok: false, reason: 'downgrade: v4/v5 object expected' };
  if (!isObject(input.work)) return { ok: false, reason: 'downgrade: save.work missing' };
  const rest: Record<string, unknown> = structuredClone(input);
  delete rest.work;
  delete rest.appel;
  delete rest.appelReceipts;
  delete rest.bike;
  return validateSaveV3({ ...rest, schemaVersion: 3 });
}

/** Fields that change on every write or open, not progress: ignored by the comparison. */
const BOOKKEEPING = new Set([
  'schemaVersion',
  'revision',
  'lastSeenAt',
  'maxSeenAt',
  'work',
  'appel',
  'appelReceipts',
  'bike',
]);

/** Canonical JSON (sorted keys), so key order never makes two equal saves differ. */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (isObject(v))
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`)
      .join(',')}}`;
  return JSON.stringify(v);
}

/** True when two saves (any of v3/v4) have the same v3 progress fields. */
export function sameV3Fields(a: unknown, b: unknown): boolean {
  if (!isObject(a) || !isObject(b)) return false;
  const pick = (o: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(o).filter(([k]) => !BOOKKEEPING.has(k)));
  return canonical(pick(a)) === canonical(pick(b));
}

/**
 * Lot 4 side: `migrated` is the v4 state obtained from a v3 `current`; `rawSourceV3` is that v3
 * record. When `backup-before-downgrade-v4` holds a v4 record with the same v3 fields, its
 * `work` is restored; otherwise `migrated` is returned unchanged (`work` initial).
 */
export function restoreWorkAfterDowngrade<S extends { work: unknown }>(
  migrated: S,
  rawSourceV3: unknown,
  rawDowngradeBackup: unknown,
): { save: S; restored: boolean } {
  if (
    !isObject(rawDowngradeBackup) ||
    (rawDowngradeBackup.schemaVersion !== 4 && rawDowngradeBackup.schemaVersion !== 5)
  )
    return { save: migrated, restored: false };
  if (!isObject(rawDowngradeBackup.work) || !sameV3Fields(rawSourceV3, rawDowngradeBackup))
    return { save: migrated, restored: false };
  return {
    save: { ...migrated, work: structuredClone(rawDowngradeBackup.work) as S['work'] },
    restored: true,
  };
}

/** The few IndexedDB calls the downgrade needs (works with idb's typed database). */
export interface DowngradeDb {
  transaction(
    store: 'saves',
    mode: 'readwrite',
  ): {
    objectStore(name: 'saves'): {
      get(key: string): Promise<unknown>;
      put(value: unknown, key: string): Promise<unknown>;
    };
    done: Promise<void>;
    abort(): void;
  };
}

/**
 * 0.3.2 side, writer tab only: in ONE readwrite transaction, keeps the raw v4 `current` in
 * `backup-before-downgrade-v4`, then writes the downgraded v3 (revision + 1, so a lot 4 tab
 * still open loses its compare-and-set and becomes read-only). Nothing is written when
 * `current` is not v4 or cannot be downgraded (the loader then falls back as usual).
 */
export async function downgradeCurrentInDb(
  db: DowngradeDb,
): Promise<
  { kind: 'none' } | { kind: 'invalid'; reason: string } | { kind: 'downgraded'; save: SaveV3 }
> {
  const tx = db.transaction('saves', 'readwrite');
  const store = tx.objectStore('saves');
  const cur = await store.get('current');
  if (!isObject(cur) || (cur.schemaVersion !== 4 && cur.schemaVersion !== 5)) {
    await tx.done;
    return { kind: 'none' };
  }
  const d = downgradeV4ToV3(cur);
  if (!d.ok) {
    await tx.done;
    return { kind: 'invalid', reason: d.reason };
  }
  const save: SaveV3 = { ...d.value, revision: d.value.revision + 1 };
  await store.put(cur, DOWNGRADE_SLOT);
  await store.put(save, 'current');
  await tx.done;
  return { kind: 'downgraded', save };
}
