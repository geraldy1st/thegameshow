/**
 * Single source of truth for game balance (ARCHITECTURE.md, MVP-DRAFT.md, SPEC-ADDENDUM.md).
 * Values come from the validated mockup (/workspace/gacha-mockups/proto/main.js).
 */

export const HOUR_MS = 3_600_000;

/** Offline earnings cap (validated by Geraldy). */
export const OFFLINE_CAP_MS = 8 * HOUR_MS;

/** Absence longer than this is shown on the "welcome back" screen instead of credited silently. */
export const WELCOME_BACK_THRESHOLD_MS = 60_000;

/** Hard ceiling for every stored amount (SPEC-ADDENDUM RES-4). */
export const MAX_AMOUNT = Number.MAX_SAFE_INTEGER;

export type InvestmentId = 'save' | 'stock' | 'estate';
export const INVESTMENT_IDS: readonly InvestmentId[] = ['save', 'stock', 'estate'];

export interface InvestmentDef {
  /** Base cost in whole yen. */
  baseCost: number;
  /** Cost growth factor per level. */
  growth: number;
  /** Income per level in yen per second. */
  ratePerLevel: number;
}

export const INVESTMENTS: Readonly<Record<InvestmentId, InvestmentDef>> = {
  save: { baseCost: 50, growth: 1.15, ratePerLevel: 0.6 },
  stock: { baseCost: 250, growth: 1.17, ratePerLevel: 2.5 },
  estate: { baseCost: 2000, growth: 1.2, ratePerLevel: 14 },
};

/** Base yen per click before partner bonuses (click levels are out of the MVP). */
export const CLICK_BASE_YEN = 1;

/** Initial state values (SPEC-ADDENDUM RES-7e). Not the mockup demo values. */
export const INITIAL = { yen: 120, tickets: 3 } as const;

// ---- Gacha (lot 2 logic; constants are fixed now so the save schema is stable) ----
export type Rarity = 1 | 2 | 3;
export const RARITY_RATES: Readonly<Record<Rarity, number>> = { 1: 0.7, 2: 0.25, 3: 0.05 };
/** Pity counter = pulls since the last 3-star; when it equals PITY_LIMIT - 1 the next pull is forced 3-star. */
export const PITY_LIMIT = 50;
export const MAX_STARS = 5;

export type AssociateId =
  'haru' | 'kei' | 'lila' | 'nana' | 'noa' | 'yuu' | 'daichi' | 'jun' | 'omar';
export type BonusTarget = InvestmentId | 'click' | 'all';

export interface AssociateDef {
  id: AssociateId;
  rarity: Rarity;
  target: BonusTarget;
  /** Bonus percent per star. */
  percentPerStar: number;
}

export const ASSOCIATES: readonly AssociateDef[] = [
  { id: 'haru', rarity: 1, target: 'save', percentPerStar: 5 },
  { id: 'kei', rarity: 1, target: 'click', percentPerStar: 5 },
  { id: 'lila', rarity: 1, target: 'stock', percentPerStar: 5 },
  { id: 'nana', rarity: 1, target: 'estate', percentPerStar: 5 },
  { id: 'noa', rarity: 2, target: 'stock', percentPerStar: 10 },
  { id: 'yuu', rarity: 2, target: 'click', percentPerStar: 10 },
  { id: 'daichi', rarity: 2, target: 'estate', percentPerStar: 10 },
  { id: 'jun', rarity: 3, target: 'all', percentPerStar: 8 },
  { id: 'omar', rarity: 3, target: 'save', percentPerStar: 25 },
];
export const ASSOCIATE_IDS: readonly AssociateId[] = ASSOCIATES.map((a) => a.id);

// ---- Daily quests (MVP-DRAFT table, SPEC-ADDENDUM RES-6) ----
export type QuestId = 'quiz' | 'save' | 'invest' | 'visit' | 'click';
export const QUEST_IDS: readonly QuestId[] = ['quiz', 'save', 'invest', 'visit', 'click'];
export interface QuestDef {
  goal: number;
  reward: number;
}
export const QUESTS: Readonly<Record<QuestId, QuestDef>> = {
  quiz: { goal: 1, reward: 2 },
  save: { goal: 1, reward: 1 },
  invest: { goal: 3, reward: 1 },
  visit: { goal: 1, reward: 1 },
  click: { goal: 100, reward: 2 },
};
/** 7 tickets per day at most (sum of rewards). */
export const MAX_TICKETS_PER_DAY = QUEST_IDS.reduce((n, q) => n + QUESTS[q].reward, 0);

// ---- Friends (SPEC-ADDENDUM RES-6, "à confirmer" values) ----
export type FriendId = 'ren' | 'mio' | 'sora';
export const FRIEND_IDS: readonly FriendId[] = ['ren', 'mio', 'sora'];
export const MAX_AFFINITY = 100;
export const VISIT_AFFINITY = 5;
/** Visits that still give affinity, per friend and per day. */
export const VISITS_COUNTED_PER_DAY = 3;
/** Scene thresholds from the mockup; only scene 1 exists in the MVP. */
export const SCENE_THRESHOLDS = [20, 50, 80] as const;
export const SCENES_READY = 1;

// ---- Draw reveal timing (DESIGN-BRIEF) ----
export const REVEAL_MS = 2300;
export const REVEAL_REDUCED_MS = 180;
export const SKIP_HOLD_MS = 400;
