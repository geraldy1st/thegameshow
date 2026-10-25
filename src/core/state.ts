import { FRIEND_IDS, INITIAL, QUEST_IDS, type FriendId, type QuestId } from '../data/balance';
import { localDay } from './clock';
import { yenToCents } from './numbers';
import { createRng } from './rng';
import type { FriendState, GameState } from './types';

const record = <K extends string, V>(keys: readonly K[], make: () => V): Record<K, V> =>
  Object.fromEntries(keys.map((k) => [k, make()])) as Record<K, V>;

export const emptyQuestProgress = (): Record<QuestId, number> => record(QUEST_IDS, () => 0);
export const emptyQuestClaims = (): Record<QuestId, boolean> => record(QUEST_IDS, () => false);

/** Initial state per spec (RES-7e): 120 yen, 3 tickets, everything else at zero. */
export function createInitialState(now: number, seed: number): GameState {
  return {
    schemaVersion: 1,
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
    gacha: { pity: 0, pulls: 0, stars: {} },
    quests: { day: localDay(now), progress: emptyQuestProgress(), claimed: emptyQuestClaims() },
    friends: record<FriendId, FriendState>(FRIEND_IDS, () => ({
      affinity: 0,
      scenesSeen: [],
      visitsToday: 0,
    })),
    backup: { lastExportAt: null, reminderDismissedAt: null },
    settings: { lang: 'fr', sound: true, reducedMotion: 'auto' },
  };
}
