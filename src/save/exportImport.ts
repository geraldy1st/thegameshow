import type { SaveV1 } from '../core/types';
import { migrateToCurrent, type CurrentSave } from './migrations';
import type { ValidationResult } from './schema';

export const EXPORT_FORMAT = 'thegameshow-save';
export const MAX_IMPORT_BYTES = 256 * 1024;

/** FNV-1a 32-bit. Detects accidental corruption only, NOT tampering (RES-7c). */
export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function serializeExport(save: SaveV1): string {
  const payload = JSON.stringify(save);
  return JSON.stringify({ format: EXPORT_FORMAT, checksum: fnv1a(payload), save }, null, 2);
}

/** Parses and validates an imported file. Never throws; never touches storage. */
export function parseImport(text: string): ValidationResult<CurrentSave> {
  if (new TextEncoder().encode(text).length > MAX_IMPORT_BYTES) {
    return { ok: false, reason: 'file too large' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'not JSON' };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: 'envelope: object expected' };
  }
  const keys = Object.getOwnPropertyNames(parsed);
  if (keys.length !== 3 || !['format', 'checksum', 'save'].every((k) => keys.includes(k))) {
    return { ok: false, reason: 'envelope: unexpected keys' };
  }
  const env = parsed as { format: unknown; checksum: unknown; save: unknown };
  if (env.format !== EXPORT_FORMAT) return { ok: false, reason: 'envelope: wrong format' };
  if (typeof env.checksum !== 'string' || env.checksum !== fnv1a(JSON.stringify(env.save))) {
    return { ok: false, reason: 'checksum mismatch' };
  }
  return migrateToCurrent(env.save);
}
