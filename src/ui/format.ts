import { CALL_DURATION_MS } from '../core/appel';
import type { AssociateDef, BonusTarget } from '../data/balance';

const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const compact = new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 });
/** Percent points for UI (DEF-GS-34): 2.5 → « 2,5 », never a hand-rolled replace. */
const nfPct = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
export const formatPercent = (p: number): string => nfPct.format(p);

/** Unitless whole-number display (points, etc.). Compact above one million. */
export const formatAmount = (amount: number): string =>
  amount >= 1e6 ? compact.format(amount) : nf.format(amount);

/** Mirage: suffix the unit with a non-breaking space, e.g. « 100\u00a0B ». */
export const BUCK_SUFFIX = '\u00a0B';
export const formatBucks = (amount: number): string => `${formatAmount(amount)}${BUCK_SUFFIX}`;
/** Long form for aria-label: « 100\u00a0Buck ». */
export const formatBucksLong = (amount: number): string => `${nf.format(amount)}\u00a0Buck`;
export const formatRate = (bucksPerSecond: number): string => nf1.format(bucksPerSecond);

export function formatDuration(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(m / 60);
  return h ? `${h} h ${String(m % 60).padStart(2, '0')}` : `${m} min`;
}

/**
 * Single « X h Y min » formatter for the partner grid badge and the associate sheet
 * (R-052-02). Ceil to the minute; never « 0 min » while a remaining duration is > 0.
 * Under 1 h: « 12 min » (no hour part). Exact 0 ms (available): « 0 min ».
 */
export function formatAppelRemain(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0 min';
  const totalMin = Math.ceil(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')} min`;
  return `${totalMin} min`;
}

/** Official call length for the sheet line and the dialogue `{durée}` (R-052D-04). Never `formatAppelRemain`. */
export function callDurationLabel(rarity: AssociateDef['rarity']): string {
  return CALL_DURATION_MS[rarity] >= 60 * 60_000 ? '1 h' : '30 min';
}

/** Shared `{bonus}` label for the replica and the chip. No percentage (R-052D-04). */
export function callBonusLabel(target: BonusTarget): string {
  switch (target) {
    case 'save':
      return 'bonus Épargne ×2';
    case 'stock':
      return 'bonus Actions ×2';
    case 'estate':
      return 'bonus Immobilier ×2';
    case 'click':
      return 'bonus Clic ×2';
    case 'all':
      return 'bonus tous les revenus + clic ×2';
    default: {
      const exhaustive: never = target;
      return exhaustive;
    }
  }
}
