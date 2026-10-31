import { QUEST_IDS } from '../data/balance';
import { QUIZ } from '../data/quiz';
import { canClaim, quizIndex } from '../core/quests';
import type { GameState } from '../core/types';

export function download(text: string, prefix = 'thegameshow') {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${prefix}-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export const displayName = (id: string): string => id.charAt(0).toUpperCase() + id.slice(1);

export const prefersReducedMotion = (): boolean =>
  document.documentElement.dataset.motion === 'reduce' ||
  (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
export const claimableCount = (g: GameState | null): number =>
  g ? QUEST_IDS.filter((q) => canClaim(g, q)).length : 0;

export function todayQuestion(g: GameState) {
  return QUIZ[quizIndex(g.quests.day, g.createdAt >>> 0)]!;
}

// DEF-GS-08: which draw's reveal was fully shown, kept OUTSIDE the save (no save write, no draw).
// DEF-GS-11 (lot 3, GS-V5-15): the marker is keyed by `createdAt:pull`, so a new game, an
// import or a migration (createdAt kept by deep equality) can never be confused with another
// game's draw n°1. No explicit clearing anywhere.
const SEEN_KEY = 'tgs-reveal-seen';
type SaveKey = { createdAt: number };
const markerOf = (save: SaveKey, pull: number) => `${save.createdAt}:${pull}`;

export function markRevealSeen(save: SaveKey, pull: number): void {
  try {
    localStorage.setItem(SEEN_KEY, markerOf(save, pull));
  } catch {
    /* storage unavailable: the summary may show again, harmless */
  }
}
/**
 * True when the saved last draw was never fully revealed (reload during the reveal).
 * A lot 2 marker (pull number only) equal to the last pull counts as seen and is rewritten
 * in the `createdAt:pull` format (localStorage only, never IndexedDB).
 */
export function revealPending(save: SaveKey | null, last: { pull: number } | null): boolean {
  if (!save || !last) return false;
  try {
    const stored = localStorage.getItem(SEEN_KEY);
    if (stored === markerOf(save, last.pull)) return false;
    if (stored === String(last.pull)) {
      markRevealSeen(save, last.pull);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
