import {
  FRIEND_IDS,
  MAX_AFFINITY,
  QUESTS,
  SCENE_THRESHOLDS,
  SCENES_READY,
  VISIT_AFFINITY,
  VISITS_COUNTED_PER_DAY,
  type FriendId,
  type QuestId,
} from '../data/balance';
import { QUIZ } from '../data/quiz';
import { localDay } from './clock';
import { addAmount } from './numbers';
import { emptyQuestClaims, emptyQuestProgress } from './state';
import type { GameState } from './types';

/**
 * Monotonic quest day (RES-6): day = max(stored, today). A new day resets progress, claims,
 * today's quiz answer and visit counters, with no penalty (no punitive streak).
 */
export function rollDay(state: GameState, now: number): GameState {
  const today = localDay(now);
  if (today <= state.quests.day) return state;
  const friends = { ...state.friends };
  for (const f of FRIEND_IDS) friends[f] = { ...friends[f], visitsToday: 0 };
  return {
    ...state,
    quests: {
      day: today,
      progress: emptyQuestProgress(),
      claimed: emptyQuestClaims(),
      quizChoice: null,
    },
    friends,
  };
}

export function bumpQuest(state: GameState, id: QuestId, by = 1): GameState {
  const cur = state.quests.progress[id];
  const goal = QUESTS[id].goal;
  if (cur >= goal) return state;
  return {
    ...state,
    quests: {
      ...state.quests,
      progress: { ...state.quests.progress, [id]: Math.min(goal, cur + by) },
    },
  };
}

export const questDone = (s: GameState, id: QuestId) => s.quests.progress[id] >= QUESTS[id].goal;
export const canClaim = (s: GameState, id: QuestId) => questDone(s, id) && !s.quests.claimed[id];

/** Idempotent claim: a second call, or a claim of an unfinished quest, changes nothing. */
export function claimQuest(state: GameState, id: QuestId): GameState {
  if (!canClaim(state, id)) return state;
  return {
    ...state,
    tickets: addAmount(state.tickets, QUESTS[id].reward),
    quests: { ...state.quests, claimed: { ...state.quests.claimed, [id]: true } },
  };
}

/** Deterministic question of the day (day + save seed), FNV-like mix. */
export function quizIndex(day: string, seed: number): number {
  let h = (0x811c9dc5 ^ seed) >>> 0;
  for (let i = 0; i < day.length; i++) h = Math.imul(h ^ day.charCodeAt(i), 0x01000193) >>> 0;
  return h % QUIZ.length;
}

/** Answering (right or wrong) validates the quiz quest; one answer per day. */
export function answerQuiz(state: GameState, choice: number): GameState {
  if (state.quests.quizChoice !== null || !Number.isInteger(choice) || choice < 0 || choice > 3)
    return state;
  return bumpQuest({ ...state, quests: { ...state.quests, quizChoice: choice } }, 'quiz');
}

export type VisitResult = { state: GameState; counted: boolean };

/** +5 affinity (max 100), counted 3 times per friend per day; every visit counts for the quest. */
export function visitFriend(state: GameState, id: FriendId): VisitResult {
  const f = state.friends[id];
  const counted = f.visitsToday < VISITS_COUNTED_PER_DAY;
  const next: GameState = {
    ...state,
    friends: {
      ...state.friends,
      [id]: {
        ...f,
        visitsToday: Math.min(1000, f.visitsToday + 1),
        affinity: counted ? Math.min(MAX_AFFINITY, f.affinity + VISIT_AFFINITY) : f.affinity,
      },
    },
  };
  return { state: bumpQuest(next, 'visit'), counted };
}

/** Scenes unlocked by affinity that actually exist (scene 1 only in the MVP). */
export function unlockedScenes(state: GameState, id: FriendId): number[] {
  const a = state.friends[id].affinity;
  return SCENE_THRESHOLDS.map((t, i) => (a >= t && i < SCENES_READY ? i + 1 : 0)).filter(Boolean);
}

export function markSceneSeen(state: GameState, id: FriendId, scene: number): GameState {
  const f = state.friends[id];
  if (!unlockedScenes(state, id).includes(scene) || f.scenesSeen.includes(scene)) return state;
  return {
    ...state,
    friends: { ...state.friends, [id]: { ...f, scenesSeen: [...f.scenesSeen, scene].sort() } },
  };
}
