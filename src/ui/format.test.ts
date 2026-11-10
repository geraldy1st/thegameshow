import { describe, expect, it } from 'vitest';
import { formatPercent } from './format';

describe('formatPercent (DEF-GS-34, Intl fr-FR)', () => {
  it('uses a comma, not a dot, for 2.5 and 8.33 and 17.5', () => {
    expect(formatPercent(2.5)).toBe('2,5');
    expect(formatPercent(8.33)).toBe('8,33');
    expect(formatPercent(17.5)).toBe('17,5');
    expect(formatPercent(75)).toBe('75');
    expect(formatPercent(2.5)).not.toContain('.');
  });
});
