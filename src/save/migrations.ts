import { initialV3Fields, initialV4Fields, initialV5Fields } from '../core/state';
import type { SaveV5 } from '../core/types';
import {
  CURRENT_SCHEMA_VERSION,
  validateSaveV1,
  validateSaveV2,
  validateSaveV3,
  validateSaveV4,
  validateSaveV5,
  type ValidationResult,
} from './schema';

/** Current save type. Bump together with CURRENT_SCHEMA_VERSION. */
export type CurrentSave = SaveV5;

/**
 * Migration chain (RES-7a): MIGRATIONS[n] turns a valid vN object into vN+1.
 * Each source version is validated with its own validator before migrating.
 */
type Step = (save: Record<string, unknown>) => Record<string, unknown>;

export const MIGRATIONS: Readonly<Record<number, Step>> = {
  // v1 -> v2 (lot 2): no last draw yet, today's quiz not answered.
  1: (s) => ({
    ...s,
    schemaVersion: 2,
    gacha: { ...(s.gacha as Record<string, unknown>), last: null },
    quests: { ...(s.quests as Record<string, unknown>), quizChoice: null },
  }),
  // v2 -> v3 (lot 3): every v2 field kept as is; new fields at their exact initial values.
  // Pure: the energy timestamp is the save's own maxSeenAt (never in its future), not Date.now().
  2: (s) => ({
    ...s,
    schemaVersion: 3,
    ...initialV3Fields(s.maxSeenAt as number),
  }),
  // v3 -> v4 (lot 4): every v3 field kept as is; `work` at its exact initial value.
  3: (s) => ({ ...s, schemaVersion: 4, ...initialV4Fields() }),
  // v4 -> v5 (Associés): appel empty, bike null (R-MV5-04).
  4: (s) => ({ ...s, schemaVersion: 5, ...initialV5Fields() }),
};

const VALIDATORS: Readonly<Record<number, (v: unknown) => ValidationResult<unknown>>> = {
  1: validateSaveV1,
  2: validateSaveV2,
  3: validateSaveV3,
  4: validateSaveV4,
};

/** Migrates any supported version to the current one and validates the result. Never throws. */
export function migrateToCurrent(input: unknown): ValidationResult<CurrentSave> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, reason: 'save: object expected' };
  }
  const version = (input as { schemaVersion?: unknown }).schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { ok: false, reason: 'save.schemaVersion: unknown' };
  }
  if (version > CURRENT_SCHEMA_VERSION) {
    return { ok: false, reason: `save.schemaVersion: ${version} is newer than this app` };
  }
  let data = input as Record<string, unknown>;
  try {
    for (let v = version; v < CURRENT_SCHEMA_VERSION; v++) {
      const step = MIGRATIONS[v];
      const check = VALIDATORS[v];
      if (!step || !check) return { ok: false, reason: `missing migration v${v}` };
      const valid = check(data);
      if (!valid.ok) return valid;
      data = step(structuredClone(data));
    }
  } catch {
    return { ok: false, reason: 'migration failed' };
  }
  return validateSaveV5(data);
}
