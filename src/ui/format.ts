const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const compact = new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 });

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
