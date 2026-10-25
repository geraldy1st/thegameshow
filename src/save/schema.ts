import {
  ASSOCIATE_IDS,
  FRIEND_IDS,
  INVESTMENT_IDS,
  MAX_AFFINITY,
  MAX_STARS,
  PITY_LIMIT,
  QUEST_IDS,
} from '../data/balance';
import { isAmount } from '../core/numbers';
import type { SaveV1, SaveV2 } from '../core/types';

export const CURRENT_SCHEMA_VERSION = 2;

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; reason: string };

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

class Invalid extends Error {}

type Obj = Record<string, unknown>;

/** Strict object check: plain object, exact key set, no dangerous keys (RES-7c). */
function obj(
  v: unknown,
  path: string,
  keys: readonly string[],
  optional: readonly string[] = [],
): Obj {
  if (typeof v !== 'object' || v === null || Array.isArray(v))
    throw new Invalid(`${path}: object expected`);
  const proto = Object.getPrototypeOf(v);
  if (proto !== Object.prototype && proto !== null)
    throw new Invalid(`${path}: plain object expected`);
  const own = Object.getOwnPropertyNames(v);
  for (const k of own) {
    if (FORBIDDEN_KEYS.has(k)) throw new Invalid(`${path}.${k}: forbidden key`);
    if (!keys.includes(k) && !optional.includes(k))
      throw new Invalid(`${path}.${k}: unexpected key`);
  }
  for (const k of keys) if (!own.includes(k)) throw new Invalid(`${path}.${k}: missing`);
  return v as Obj;
}

function int(v: unknown, path: string, max = Number.MAX_SAFE_INTEGER, min = 0): number {
  if (!isAmount(v) || v < min || v > max)
    throw new Invalid(`${path}: integer in [${min}, ${max}] expected`);
  return v;
}

function bool(v: unknown, path: string): boolean {
  if (typeof v !== 'boolean') throw new Invalid(`${path}: boolean expected`);
  return v;
}

function oneOf<T extends string>(v: unknown, path: string, values: readonly T[]): T {
  if (typeof v !== 'string' || !values.includes(v as T))
    throw new Invalid(`${path}: invalid value`);
  return v as T;
}

function nullableInt(v: unknown, path: string): number | null {
  return v === null ? null : int(v, path);
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Validates an unknown value as a SaveV1 with bounds (RES-7c). Never throws. */
export function validateSaveV1(input: unknown): ValidationResult<SaveV1> {
  try {
    const s = obj(input, 'save', [
      'schemaVersion',
      'revision',
      'createdAt',
      'lastSeenAt',
      'maxSeenAt',
      'rng',
      'yenCents',
      'pendingOfflineCents',
      'tickets',
      'totalClicks',
      'investments',
      'gacha',
      'quests',
      'friends',
      'backup',
      'settings',
    ]);
    if (s.schemaVersion !== 1) throw new Invalid('save.schemaVersion: 1 expected');
    int(s.revision, 'save.revision');
    int(s.createdAt, 'save.createdAt');
    const lastSeenAt = int(s.lastSeenAt, 'save.lastSeenAt');
    const maxSeenAt = int(s.maxSeenAt, 'save.maxSeenAt');
    if (lastSeenAt > maxSeenAt) throw new Invalid('save.lastSeenAt: must be <= maxSeenAt');
    const rng = obj(s.rng, 'save.rng', ['seed', 'state']);
    int(rng.seed, 'save.rng.seed', 0xffffffff);
    int(rng.state, 'save.rng.state', 0xffffffff);
    int(s.yenCents, 'save.yenCents');
    int(s.pendingOfflineCents, 'save.pendingOfflineCents');
    int(s.tickets, 'save.tickets');
    int(s.totalClicks, 'save.totalClicks');
    const inv = obj(s.investments, 'save.investments', INVESTMENT_IDS);
    for (const id of INVESTMENT_IDS) int(inv[id], `save.investments.${id}`, 100_000);
    const gacha = obj(s.gacha, 'save.gacha', ['pity', 'pulls', 'stars']);
    int(gacha.pity, 'save.gacha.pity', PITY_LIMIT - 1);
    int(gacha.pulls, 'save.gacha.pulls');
    const stars = obj(gacha.stars, 'save.gacha.stars', [], ASSOCIATE_IDS);
    for (const k of Object.keys(stars)) int(stars[k], `save.gacha.stars.${k}`, MAX_STARS, 1);
    const quests = obj(s.quests, 'save.quests', ['day', 'progress', 'claimed']);
    if (typeof quests.day !== 'string' || !DAY_RE.test(quests.day))
      throw new Invalid('save.quests.day: YYYY-MM-DD expected');
    const progress = obj(quests.progress, 'save.quests.progress', QUEST_IDS);
    const claimed = obj(quests.claimed, 'save.quests.claimed', QUEST_IDS);
    for (const q of QUEST_IDS) {
      int(progress[q], `save.quests.progress.${q}`, 1_000_000);
      bool(claimed[q], `save.quests.claimed.${q}`);
    }
    const friends = obj(s.friends, 'save.friends', FRIEND_IDS);
    for (const f of FRIEND_IDS) {
      const fr = obj(friends[f], `save.friends.${f}`, ['affinity', 'scenesSeen', 'visitsToday']);
      int(fr.affinity, `save.friends.${f}.affinity`, MAX_AFFINITY);
      int(fr.visitsToday, `save.friends.${f}.visitsToday`, 1000);
      if (!Array.isArray(fr.scenesSeen) || fr.scenesSeen.length > 3)
        throw new Invalid(`save.friends.${f}.scenesSeen: array expected`);
      fr.scenesSeen.forEach((n, i) => int(n, `save.friends.${f}.scenesSeen[${i}]`, 3, 1));
    }
    const backup = obj(s.backup, 'save.backup', ['lastExportAt', 'reminderDismissedAt']);
    nullableInt(backup.lastExportAt, 'save.backup.lastExportAt');
    nullableInt(backup.reminderDismissedAt, 'save.backup.reminderDismissedAt');
    const settings = obj(s.settings, 'save.settings', ['lang', 'sound', 'reducedMotion']);
    oneOf(settings.lang, 'save.settings.lang', ['fr', 'en', 'es']);
    bool(settings.sound, 'save.settings.sound');
    oneOf(settings.reducedMotion, 'save.settings.reducedMotion', ['auto', 'on', 'off']);
    // Return a structural deep copy so callers never share references with the input.
    return { ok: true, value: structuredClone(input) as SaveV1 };
  } catch (e) {
    return { ok: false, reason: e instanceof Invalid ? e.message : 'invalid save' };
  }
}

/** Validates a SaveV2: the v1 rules plus `gacha.last` and `quests.quizChoice`. Never throws. */
export function validateSaveV2(input: unknown): ValidationResult<SaveV2> {
  try {
    const s = obj(input, 'save', [
      'schemaVersion',
      'revision',
      'createdAt',
      'lastSeenAt',
      'maxSeenAt',
      'rng',
      'yenCents',
      'pendingOfflineCents',
      'tickets',
      'totalClicks',
      'investments',
      'gacha',
      'quests',
      'friends',
      'backup',
      'settings',
    ]);
    if (s.schemaVersion !== 2) throw new Invalid('save.schemaVersion: 2 expected');
    const gacha = obj(s.gacha, 'save.gacha', ['pity', 'pulls', 'stars', 'last']);
    const quests = obj(s.quests, 'save.quests', ['day', 'progress', 'claimed', 'quizChoice']);
    if (quests.quizChoice !== null) int(quests.quizChoice, 'save.quests.quizChoice', 3);
    if (gacha.last !== null) {
      const l = obj(gacha.last, 'save.gacha.last', [
        'id',
        'stars',
        'isNew',
        'wasted',
        'forced',
        'pull',
      ]);
      oneOf(l.id, 'save.gacha.last.id', ASSOCIATE_IDS);
      int(l.stars, 'save.gacha.last.stars', MAX_STARS, 1);
      bool(l.isNew, 'save.gacha.last.isNew');
      bool(l.wasted, 'save.gacha.last.wasted');
      bool(l.forced, 'save.gacha.last.forced');
      int(l.pull, 'save.gacha.last.pull', Number.MAX_SAFE_INTEGER, 1);
    }
    const { last: _last, ...g1 } = gacha;
    const { quizChoice: _q, ...q1 } = quests;
    void _last;
    void _q;
    const v1 = validateSaveV1({ ...s, schemaVersion: 1, gacha: g1, quests: q1 });
    if (!v1.ok) return v1;
    return { ok: true, value: structuredClone(input) as SaveV2 };
  } catch (e) {
    return { ok: false, reason: e instanceof Invalid ? e.message : 'invalid save' };
  }
}
