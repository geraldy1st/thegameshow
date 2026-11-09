import { ASSOCIATE_IDS, type AssociateId } from '../../data/balance';
import type { LastPull } from '../../core/types';

/**
 * Patch 0.4.3 (P10, R-P43-3): the ×10 detail for a reload during the grid. localStorage only
 * (schema v4 unchanged), written AFTER the IndexedDB write succeeded, and only trusted when it
 * matches the save: same createdAt, exactly 10 entries, consecutive pull numbers ending at
 * gacha.last.pull, and the 10th entry equal to gacha.last (id, stars, forced). Anything else
 * falls back to the single last-draw summary.
 * DEF-GS-23: every id must be a known associate; otherwise the marker is purged (no blank screen).
 */
export const TEN_KEY = 'tgs-reveal-ten';
export const TEN = 10;

const KNOWN = new Set<string>(ASSOCIATE_IDS);

interface SaveLike {
  createdAt: number;
  gacha: { last: LastPull | null };
}

export function writeTenMarker(save: { createdAt: number }, results: readonly LastPull[]): void {
  try {
    localStorage.setItem(TEN_KEY, JSON.stringify({ createdAt: save.createdAt, results }));
  } catch {
    /* storage refused: a reload shows the last draw only, harmless */
  }
}

export function clearTenMarker(): void {
  try {
    localStorage.removeItem(TEN_KEY);
  } catch {
    /* ignore */
  }
}

const isPull = (x: unknown): x is LastPull => {
  if (!x || typeof x !== 'object') return false;
  const p = x as Record<string, unknown>;
  return (
    typeof p.id === 'string' &&
    Number.isInteger(p.stars) &&
    typeof p.forced === 'boolean' &&
    typeof p.isNew === 'boolean' &&
    typeof p.wasted === 'boolean' &&
    Number.isInteger(p.pull)
  );
};

function isKnownId(id: string): id is AssociateId {
  return KNOWN.has(id);
}

/** Purge a dangerous marker (unknown id / unreadable). Harmless mismatches leave the key. */
function purge(): null {
  clearTenMarker();
  return null;
}

export function readTenMarker(save: SaveLike | null): LastPull[] | null {
  const last = save?.gacha.last;
  if (!save || !last) return null;
  let raw: string | null;
  try {
    raw = localStorage.getItem(TEN_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return purge();
  }
  if (!data || typeof data !== 'object') return purge();
  const { createdAt, results } = data as { createdAt?: unknown; results?: unknown };
  if (createdAt !== save.createdAt || !Array.isArray(results) || results.length !== TEN)
    return null;
  if (!results.every(isPull)) return purge();
  // DEF-GS-23: unknown id anywhere (or on last) → purge, never throw in the UI.
  if (!results.every((r) => isKnownId(r.id)) || !isKnownId(last.id)) return purge();
  const first = last.pull - (TEN - 1);
  if (!results.every((r, i) => r.pull === first + i)) return null;
  const tenth = results[TEN - 1]!;
  if (tenth.id !== last.id || tenth.stars !== last.stars || tenth.forced !== last.forced)
    return null;
  return results;
}
