import type { AssociateId, FriendId, InvestmentId, QuestId } from '../data/balance';
import type { RngState } from './rng';

export type Lang = 'fr' | 'en' | 'es';
export type ReducedMotionSetting = 'auto' | 'on' | 'off';
export type StarCount = 1 | 2 | 3 | 4 | 5;

export interface FriendState {
  affinity: number;
  scenesSeen: number[];
  /** Visits counted today (reset with the quest day; daily cap in SPEC-ADDENDUM RES-6). */
  visitsToday: number;
}

/**
 * Save schema v1 (SPEC-ADDENDUM RES-4: every number is a JS number, amounts are integers,
 * yen are stored in integer hundredths). The in-memory game state is the same shape.
 */
export interface SaveV1 {
  schemaVersion: 1;
  /** Incremented on every successful write (RES-3, conditional write). */
  revision: number;
  createdAt: number;
  /** Last instant credited by idle settlement. */
  lastSeenAt: number;
  /** Highest `now` ever observed; guards against clock rollback (RES-5). */
  maxSeenAt: number;
  rng: RngState;
  yenCents: number;
  /** Offline earnings waiting for the "welcome back" screen. */
  pendingOfflineCents: number;
  tickets: number;
  totalClicks: number;
  investments: Record<InvestmentId, number>;
  gacha: { pity: number; pulls: number; stars: Partial<Record<AssociateId, StarCount>> };
  quests: { day: string; progress: Record<QuestId, number>; claimed: Record<QuestId, boolean> };
  friends: Record<FriendId, FriendState>;
  backup: { lastExportAt: number | null; reminderDismissedAt: number | null };
  settings: { lang: Lang; sound: boolean; reducedMotion: ReducedMotionSetting };
}

/** Last draw, kept so a reload during the reveal shows the already-saved result (GS-CA17). */
export interface LastPull {
  id: AssociateId;
  stars: StarCount;
  isNew: boolean;
  /** True when the pull was a duplicate at 5 stars (no effect, ticket consumed). */
  wasted: boolean;
  forced: boolean;
  pull: number;
}

/**
 * Save schema v2 (lot 2): v1 + `gacha.last` and `quests.quizChoice` (answer to today's quiz).
 */
export interface SaveV2 extends Omit<SaveV1, 'schemaVersion' | 'gacha' | 'quests'> {
  schemaVersion: 2;
  gacha: SaveV1['gacha'] & { last: LastPull | null };
  quests: SaveV1['quests'] & { quizChoice: number | null };
}

export type GameState = SaveV2;
