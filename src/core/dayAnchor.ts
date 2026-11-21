/**
 * Shared civil-day anchor (DEF-BT-TA-03).
 *
 * Pure: no DOM, no storage, no bike/work/energy counters. The v6 bike cap,
 * the 0.7.0 work cap, and energy recharge all reuse these helpers so the
 * usable-instant bound, the 366-day skew, and `today` cannot drift apart.
 *
 * `incoming.maxSeenAt` / `incoming.day` must never be passed in as
 * observations (NV6-15 / L8).
 */
import { isCalendarDay, localDay } from './clock';

/** Inclusive ECMA-262 Date bound (NV6-16 / NV6-20). */
export const ECMA_DATE_MAX = 8.64e15;

/** Rule constant, not a schema field (NV6-20). */
export const MAX_TODAY_SKEW_DAYS = 366;

/** Finite integer timestamp in the ECMA Date range. */
export function isRepresentableInstant(t: unknown): t is number {
  return typeof t === 'number' && Number.isInteger(t) && t >= 0 && t <= ECMA_DATE_MAX;
}

/** `now` can be used to take a wall civil day; otherwise the write is refused (E9). */
export function isUsableNow(now: unknown): now is number {
  return isRepresentableInstant(now) && isCalendarDay(localDay(now));
}

export function addCivilDays(day: string, days: number): string {
  const y = Number(day.slice(0, 4));
  const m = Number(day.slice(5, 7));
  const d = Number(day.slice(8, 10));
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${String(dt.getUTCFullYear()).padStart(4, '0')}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())}`;
}

/** Inclusive: `day <= wallToday + MAX_TODAY_SKEW_DAYS`. */
export function isWithinSkew(day: string, wallToday: string): boolean {
  if (!isCalendarDay(day) || !isCalendarDay(wallToday)) return false;
  return day <= addCivilDays(wallToday, MAX_TODAY_SKEW_DAYS);
}

export function isUsableForAnchor(t: unknown, wallToday: string): boolean {
  if (!isRepresentableInstant(t)) return false;
  const day = localDay(t);
  return isCalendarDay(day) && isWithinSkew(day, wallToday);
}

export type DayObservation = {
  maxSeenAt?: unknown;
  day?: unknown;
};

/**
 * `today = max(wallToday, usable local maxSeenAt days, usable local civil days)`.
 * Observations must be local records only — never the incoming file (L8).
 */
export function computeToday(now: number, observations: readonly DayObservation[]): string {
  const wallToday = localDay(now);
  const observed: string[] = [wallToday];
  for (const r of observations) {
    if (isUsableForAnchor(r.maxSeenAt, wallToday)) {
      observed.push(localDay(r.maxSeenAt as number));
    }
    if (typeof r.day === 'string' && isCalendarDay(r.day) && isWithinSkew(r.day, wallToday)) {
      observed.push(r.day);
    }
  }
  return observed.reduce((a, b) => (a >= b ? a : b));
}

/** After G-4 / the anchor: clamp a timestamp to now, or replace an unusable one with now. */
export function clampInstantToNow(t: unknown, now: number): number {
  return isRepresentableInstant(t) ? Math.min(t, now) : now;
}
