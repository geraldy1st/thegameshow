import {
  BALANCE,
  FRIEND_IDS,
  INITIAL,
  QUEST_IDS,
  STAT_IDS,
  type FriendId,
  type QuestId,
  type StatId,
} from '../data/balance';
import { localDay } from './clock';
import { yenToCents } from './numbers';
import { createRng } from './rng';
import type { FriendState, GameState, SaveV3 } from './types';

const record = <K extends string, V>(keys: readonly K[], make: () => V): Record<K, V> =>
  Object.fromEntries(keys.map((k) => [k, make()])) as Record<K, V>;

export const emptyQuestProgress = (): Record<QuestId, number> => record(QUEST_IDS, () => 0);
export const emptyQuestClaims = (): Record<QuestId, boolean> => record(QUEST_IDS, () => false);

/** v3 fields at their exact initial values (MVP v1.3 lot 3 §Données, R15). */
export function initialV3Fields(
  now: number,
): Pick<SaveV3, 'profile' | 'energy' | 'stats' | 'wardrobe'> {
  return {
    profile: { level: BALANCE.profile.initialLevel, xp: BALANCE.profile.initialXp },
    energy: { value: BALANCE.energy.initial, updatedAt: now },
    stats: record<StatId, number>(STAT_IDS, () => BALANCE.initialStats),
    wardrobe: { outfit: BALANCE.profile.initialOutfit },
  };
}

/** Initial state per spec (RES-7e): 120 yen, 3 tickets, everything else at zero. */
export function createInitialState(now: number, seed: number): GameState {
  return {
    schemaVersion: 3,
    ...initialV3Fields(now),
    revision: 0,
    createdAt: now,
    lastSeenAt: now,
    maxSeenAt: now,
    rng: createRng(seed),
    yenCents: yenToCents(INITIAL.yen),
    pendingOfflineCents: 0,
    tickets: INITIAL.tickets,
    totalClicks: 0,
    investments: { save: 0, stock: 0, estate: 0 },
    gacha: { pity: 0, pulls: 0, stars: {}, last: null },
    quests: {
      day: localDay(now),
      progress: emptyQuestProgress(),
      claimed: emptyQuestClaims(),
      quizChoice: null,
    },
    friends: record<FriendId, FriendState>(FRIEND_IDS, () => ({
      affinity: 0,
      scenesSeen: [],
      visitsToday: 0,
    })),
    backup: { lastExportAt: null, reminderDismissedAt: null },
    settings: { lang: 'fr', sound: true, reducedMotion: 'auto' },
  };
}
