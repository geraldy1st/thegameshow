const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const compact = new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 });
/** Percent points for UI (DEF-GS-34): 2.5 → « 2,5 », never a hand-rolled replace. */
const nfPct = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
export const formatPercent = (p: number): string => nfPct.format(p);

/** Whole yen; compact above one million (long form goes into aria-label). */
export const formatYen = (yen: number): string =>
  yen >= 1e6 ? compact.format(yen) : nf.format(yen);
export const formatYenLong = (yen: number): string => `${nf.format(yen)} yens`;
export const formatRate = (yenPerSecond: number): string => nf1.format(yenPerSecond);

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
