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
const SEEN_KEY = 'tgs-reveal-seen';
export function markRevealSeen(pull: number): void {
  try {
    localStorage.setItem(SEEN_KEY, String(pull));
  } catch {
    /* storage unavailable: the summary may show again, harmless */
  }
}
/** True when the saved last draw was never fully revealed (reload during the reveal). */
export function revealPending(last: { pull: number } | null): boolean {
  if (!last) return false;
  try {
    return localStorage.getItem(SEEN_KEY) !== String(last.pull);
  } catch {
    return false;
  }
}
