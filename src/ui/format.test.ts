import { describe, expect, it } from 'vitest';
import { formatAppelRemain, formatPercent } from './format';

describe('formatPercent (DEF-GS-34, Intl fr-FR)', () => {
  it('uses a comma, not a dot, for 2.5 and 8.33 and 17.5', () => {
    expect(formatPercent(2.5)).toBe('2,5');
    expect(formatPercent(8.33)).toBe('8,33');
    expect(formatPercent(17.5)).toBe('17,5');
    expect(formatPercent(75)).toBe('75');
    expect(formatPercent(2.5)).not.toContain('.');
  });
});

describe('formatAppelRemain (R-052-02, ceil to the minute)', () => {
  const H = 3_600_000;
  const M = 60_000;
  it('covers the official limit values', () => {
    expect(formatAppelRemain(4 * H)).toBe('4 h 00 min'); // 4 h 00 min 00 s
    expect(formatAppelRemain(3 * H + 59 * M + 59_000)).toBe('4 h 00 min'); // 3 h 59 min 59 s
    expect(formatAppelRemain(H)).toBe('1 h 00 min'); // 1 h 00 min 00 s
    expect(formatAppelRemain(59 * M + 59_000)).toBe('1 h 00 min'); // 59 min 59 s
    expect(formatAppelRemain(60_000)).toBe('1 min'); // 60 s
    expect(formatAppelRemain(1_000)).toBe('1 min'); // 1 s — never « 0 min » while unavailable
    expect(formatAppelRemain(1)).toBe('1 min');
    expect(formatAppelRemain(0)).toBe('0 min'); // available
  });
  it('under 1 h uses « N min » without an hour part', () => {
    expect(formatAppelRemain(12 * M)).toBe('12 min');
  });
});
