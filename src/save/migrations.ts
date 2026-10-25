import type { SaveV1 } from '../core/types';
import { CURRENT_SCHEMA_VERSION, validateSaveV1, type ValidationResult } from './schema';

/** Current save type. Bump together with CURRENT_SCHEMA_VERSION. */
export type CurrentSave = SaveV1;

/**
 * Migration chain (RES-7a): MIGRATIONS[n] turns a vN object into vN+1. Empty in v1, but the
 * pipeline (version detection, ordering, future refusal, final validation) is live and tested.
 */
export const MIGRATIONS: Readonly<
  Record<number, (save: Record<string, unknown>) => Record<string, unknown>>
> = {};

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
      if (!step) return { ok: false, reason: `missing migration v${v}` };
      data = step(structuredClone(data));
    }
  } catch {
    return { ok: false, reason: 'migration failed' };
  }
  return validateSaveV1(data);
}
