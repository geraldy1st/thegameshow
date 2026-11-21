/**
 * STUB — G-4 daily-cap merge and the `today` anchor (NV6-14 to NV6-21).
 *
 * Every path that replaces `current` (import, new game, restore, fallback)
 * must go through `applyDailyCapOnReplace`. The v1.6 policy (local `day` in
 * the anchor, MAX_TODAY_SKEW_DAYS, jour_actif, order vs min(maxSeenAt, now))
 * is intentionally not implemented here: it waits for Crypto's review of
 * NOTE-MIGRATION-V6 v1.6. Do not "fill in" a partial formula in this file.
 */
export function applyDailyCapOnReplace<T>(
  incoming: T,
  _replaced: T | null,
  _now: number,
  _localCopies: readonly T[] = [],
): T {
  void _localCopies;
  return incoming;
}
