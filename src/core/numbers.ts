import { MAX_AMOUNT } from '../data/balance';

/** True for a finite, non-negative safe integer. */
export function isAmount(n: unknown): n is number {
  return typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
}

/** Saturating addition for stored amounts: never NaN, negative or above MAX_AMOUNT. */
export function addAmount(a: number, b: number): number {
  const sum = a + b;
  if (!Number.isFinite(sum) || sum >= MAX_AMOUNT) return MAX_AMOUNT;
  if (sum <= 0) return 0;
  return Math.floor(sum);
}

export const yenToCents = (yen: number): number => Math.min(MAX_AMOUNT, Math.round(yen * 100));
/** Display rule: floor to whole yen. */
export const centsToYen = (cents: number): number => Math.floor(cents / 100);
