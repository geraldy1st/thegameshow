import { QUESTS, QUEST_IDS, type QuestId } from '../data/balance';
import type { GameState } from './types';

/**
 * Patch 0.4.2 (points 1b and 2, H1): where an unfinished quest leads. The quiz opens on top of
 * the quests dialog; the others open a screen. Every target is open today (H2 covers a future
 * locked one: the row announces « bientôt » and stays put).
 */
export type QuestTarget =
  { kind: 'quiz' } | { kind: 'screen'; route: 'invest' | 'friends' | 'work' };
export type DotTarget = 'invest' | 'friends' | 'work';

export const QUEST_TARGET: Readonly<Record<QuestId, QuestTarget>> = {
  quiz: { kind: 'quiz' },
  save: { kind: 'screen', route: 'invest' },
  invest: { kind: 'screen', route: 'invest' },
  visit: { kind: 'screen', route: 'friends' },
  click: { kind: 'screen', route: 'work' },
};

/** H3: « à faire » = not finished (`progress < goal`). Finished but unclaimed is not « à faire ». */
export const questPending = (g: GameState, id: QuestId): boolean =>
  g.quests.progress[id] < QUESTS[id].goal;

export const pendingQuests = (g: GameState): QuestId[] =>
  QUEST_IDS.filter((id) => questPending(g, id));

/** Quests still to do that lead to `target` (Investir: save, invest or both, R-P42-7). */
export const pendingQuestsFor = (target: DotTarget, g: GameState): QuestId[] =>
  pendingQuests(g).filter((id) => {
    const q = QUEST_TARGET[id];
    return q.kind === 'screen' && q.route === target;
  });
