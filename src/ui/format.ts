import { CALL_DURATION_MS } from '../core/appel';
import type { AssociateDef, BonusTarget } from '../data/balance';

const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
/** Percent points for UI (DEF-GS-34): 2.5 → « 2,5 », never a hand-rolled replace. */
const nfPct = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
export const formatPercent = (p: number): string => nfPct.format(p);

/** Locales with their own compact suffixes. « B » is reserved for Buck. */
export type FormatLocale = 'fr' | 'en' | 'es';

const GROUPING: Record<FormatLocale, Intl.NumberFormat> = {
  fr: nf,
  en: new Intl.NumberFormat('en', { maximumFractionDigits: 0 }),
  es: new Intl.NumberFormat('es', { maximumFractionDigits: 0 }),
};
const COMPACT_NUM: Record<FormatLocale, Intl.NumberFormat> = {
  fr: new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }),
  en: new Intl.NumberFormat('en', { maximumFractionDigits: 1 }),
  es: new Intl.NumberFormat('es', { maximumFractionDigits: 1 }),
};
/** Billions are always « Md » so the symbol « B » never means a short scale. */
const COMPACT: Record<FormatLocale, readonly { min: number; div: number; suffix: string }[]> = {
  fr: [
    { min: 1e12, div: 1e12, suffix: 'Bn' },
    { min: 1e9, div: 1e9, suffix: 'Md' },
    { min: 1e6, div: 1e6, suffix: 'M' },
  ],
  en: [
    { min: 1e12, div: 1e12, suffix: 'T' },
    { min: 1e9, div: 1e9, suffix: 'Md' },
    { min: 1e6, div: 1e6, suffix: 'M' },
  ],
  es: [
    { min: 1e12, div: 1e12, suffix: 'T' },
    { min: 1e9, div: 1e9, suffix: 'Md' },
    { min: 1e6, div: 1e6, suffix: 'M' },
  ],
};

/**
 * Unitless amount. Compact above one million. Never uses « B » (reserved for Buck).
 * Default locale is French (the only UI dictionary today).
 */
export function fmt(amount: number, locale: FormatLocale = 'fr'): string {
  const n = Number.isFinite(amount) ? amount : 0;
  const abs = Math.abs(n);
  for (const { min, div, suffix } of COMPACT[locale]) {
    if (abs >= min) {
      return `${COMPACT_NUM[locale].format(n / div)}\u00a0${suffix}`;
    }
  }
  return GROUPING[locale].format(Math.round(n));
}

/** Unitless whole-number display (points, etc.). Same rules as `fmt`. */
export const formatAmount = (amount: number, locale: FormatLocale = 'fr'): string =>
  fmt(amount, locale);

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
