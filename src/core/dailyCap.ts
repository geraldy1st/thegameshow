/**
 * G-4 daily-cap merge and the `today` anchor (NV6-14 to NV6-21, note v1.6/v1.7).
 *
 * Every path that replaces `current` (import, new game, restore, fallback,
 * first writer persist after migration) must go through `applyDailyCapOnReplace`.
 * There is no second implementation. The `min(maxSeenAt, now)` clamp lives
 * *inside* this function, after the anchor (6c is forbidden).
 *
 * Day arithmetic is delegated to the shared `dayAnchor` module (DEF-BT-TA-03).
 */
import { isCalendarDay, localDay } from './clock';
import { clampInstantToNow, computeToday, isUsableNow } from './dayAnchor';

export { MAX_TODAY_SKEW_DAYS, ECMA_DATE_MAX, isUsableNow, computeToday } from './dayAnchor';

/** Frozen by Geraldy, 15/11/2026 21:09 Atlantic/Canary. */
export const BUCK_CAP_SCOPE: 'device' | 'gameId' = 'device';

export const DAILY_CAP_CENTS = 100_000;

export type CapSource = {
  schemaVersion?: number;
  gameId?: string;
  maxSeenAt?: unknown;
  lastSeenAt?: unknown;
  bike?: { day: string; earnedTodayCents: number } | null;
};

export type DailyCapOk<T> = {
  ok: true;
  value: T;
  today: string;
  wallToday: string;
  remainingCents: number;
};
export type DailyCapErr = { ok: false; reason: 'unusable-now' };
export type DailyCapResult<T> = DailyCapOk<T> | DailyCapErr;

export function remainingCents(earned: number): number {
  return Math.max(0, DAILY_CAP_CENTS - earned);
}

function isV6Source(
  s: CapSource,
): s is CapSource & { bike: { day: string; earnedTodayCents: number } } {
  return (
    s.schemaVersion === 6 &&
    s.bike !== null &&
    typeof s.bike === 'object' &&
    typeof s.bike.day === 'string' &&
    typeof s.bike.earnedTodayCents === 'number'
  );
}

function sameCapScope(source: CapSource, incoming: CapSource): boolean {
  if (BUCK_CAP_SCOPE === 'device') return true;
  return source.gameId === incoming.gameId;
}

/**
 * Apply the v1.6 today anchor and G-4 merge, then clamp timestamps.
 * `localCopies` must include readable path copies (backup-before-reset,
 * backup-before-import, previous, …). `incoming` timestamps/days never
 * enter the anchor (do not "fix" E2/E3 by reopening L8).
 */
export function applyDailyCapOnReplace<T extends CapSource>(
  incoming: T,
  replaced: CapSource | null,
  now: number,
  localCopies: readonly CapSource[] = [],
): DailyCapResult<T> {
  if (!isUsableNow(now)) return { ok: false, reason: 'unusable-now' };

  const locals: CapSource[] = [];
  if (replaced) locals.push(replaced);
  for (const c of localCopies) locals.push(c);

  const wallToday = localDay(now);
  const today = computeToday(
    now,
    locals.map((r) => ({
      maxSeenAt: r.maxSeenAt,
      day: r.bike && typeof r.bike === 'object' ? r.bike.day : undefined,
    })),
  );

  const incBike = isV6Source(incoming)
    ? { ...incoming.bike }
    : {
        day: typeof incoming.bike?.day === 'string' ? incoming.bike.day : wallToday,
        earnedTodayCents:
          typeof incoming.bike?.earnedTodayCents === 'number' ? incoming.bike.earnedTodayCents : 0,
      };

  if (isCalendarDay(incBike.day) && incBike.day > today) {
    incBike.day = today;
  }
  if (isCalendarDay(incBike.day) && incBike.day < today) {
    incBike.day = today;
    incBike.earnedTodayCents = 0;
  }

  let highToday = 0;
  const sources: {
    rec: CapSource;
    bike: { day: string; earnedTodayCents: number };
    isLocal: boolean;
  }[] = [{ rec: incoming, bike: incBike, isLocal: false }];
  for (const S of locals) {
    if (!isV6Source(S)) continue;
    sources.push({ rec: S, bike: S.bike, isLocal: true });
  }

  for (const { rec, bike, isLocal } of sources) {
    if (!sameCapScope(rec, incoming)) continue;
    if (!isCalendarDay(bike.day)) continue;
    const jourActif = bike.day === today || (isLocal && wallToday <= bike.day);
    if (jourActif) highToday = Math.max(highToday, bike.earnedTodayCents);
  }

  const nextBike = {
    ...(incoming.bike && typeof incoming.bike === 'object' ? incoming.bike : incBike),
    day: today,
    earnedTodayCents: highToday,
  };

  const value = {
    ...incoming,
    maxSeenAt: clampInstantToNow(incoming.maxSeenAt, now),
    lastSeenAt: clampInstantToNow(
      incoming.lastSeenAt === undefined ? incoming.maxSeenAt : incoming.lastSeenAt,
      now,
    ),
    bike: nextBike,
  } as T;

  return {
    ok: true,
    value,
    today,
    wallToday,
    remainingCents: remainingCents(highToday),
  };
}

/** D1 at the wall only (no current replacement). Used by return-clock oracles. */
export function remainingAtWall(
  day: string,
  earnedTodayCents: number,
  now: number,
): { day: string; earnedTodayCents: number; remainingCents: number } {
  const wall = localDay(now);
  if (isCalendarDay(day) && day < wall) {
    return { day: wall, earnedTodayCents: 0, remainingCents: remainingCents(0) };
  }
  return { day, earnedTodayCents, remainingCents: remainingCents(earnedTodayCents) };
}
