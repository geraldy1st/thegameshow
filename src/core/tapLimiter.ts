import { BALANCE } from '../data/balance';

/**
 * Sliding window of 1 s (ARCHITECTURE-LOT4 §3): a tap at `now` is accepted when fewer than
 * `maxTapsPerSecond` accepted taps lie in (now − 1000, now]. A refused tap is not recorded.
 * Pure: returns the new window (timestamps of accepted taps, at most 15).
 */
export type TapWindow = readonly number[];

export function acceptTap(
  window: TapWindow,
  now: number,
): { accepted: boolean; window: TapWindow } {
  const max = BALANCE.work.maxTapsPerSecond;
  // A clock moved back keeps only taps not in the future of `now`.
  const recent = window.filter((t) => t > now - 1000 && t <= now);
  if (recent.length >= max) return { accepted: false, window: recent };
  return { accepted: true, window: [...recent, now] };
}
