import { describe, expect, it } from 'vitest';
import type { BonusTarget } from '../data/balance';
import { callBonusLabel, callDurationLabel, formatAppelRemain, formatPercent } from './format';

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

describe('callDurationLabel / callBonusLabel (R-052D-04)', () => {
  it('prints 30 min for 1★/2★ and 1 h for 3★, never « 1 h 00 min »', () => {
    expect(callDurationLabel(1)).toBe('30 min');
    expect(callDurationLabel(2)).toBe('30 min');
    expect(callDurationLabel(3)).toBe('1 h');
    expect(callDurationLabel(3)).not.toBe('1 h 00 min');
  });

  it('maps every BonusTarget with no percentage', () => {
    const expected: Record<BonusTarget, string> = {
      save: 'bonus Épargne ×2',
      stock: 'bonus Actions ×2',
      estate: 'bonus Immobilier ×2',
      click: 'bonus Clic ×2',
      all: 'bonus tous les revenus + clic ×2',
    };
    for (const target of Object.keys(expected) as BonusTarget[]) {
      expect(callBonusLabel(target)).toBe(expected[target]);
      expect(callBonusLabel(target)).not.toMatch(/%/);
    }
  });
});
