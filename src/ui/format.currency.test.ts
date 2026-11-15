import { describe, expect, it } from 'vitest';
import { INITIAL } from '../data/balance';
import { createInitialState } from '../core/state';
import { centsToBucks } from '../core/numbers';
import { BUCK_SUFFIX, formatAmount, formatBucks, formatBucksLong } from './format';

describe('Buck display and persisted yenCents exception', () => {
  it('formats amounts with a non-breaking space before B (Mirage)', () => {
    expect(BUCK_SUFFIX).toBe('\u00a0B');
    expect(formatBucks(100)).toBe('100\u00a0B');
    expect(formatBucks(0)).toBe('0\u00a0B');
    expect(formatBucksLong(100)).toBe('100\u00a0Buck');
    expect(formatAmount(100)).toBe('100');
    expect(formatAmount(100)).not.toContain('B');
  });

  it('keeps the persisted save field yenCents (v5→v6 / existing saves)', () => {
    const s = createInitialState(0, 1);
    expect(s.yenCents).toBe(INITIAL.yen * 100);
    expect(centsToBucks(s.yenCents)).toBe(INITIAL.yen);
    expect(formatBucks(centsToBucks(s.yenCents))).toBe('120\u00a0B');
    const json = JSON.stringify(s);
    expect(json).toContain('"yenCents"');
    expect(json).not.toContain('"bucksCents"');
    expect('yenCents' in s).toBe(true);
    expect('bucksCents' in s).toBe(false);
  });

  it('keeps frozen balance keys that seed yenCents (R-P43-6)', async () => {
    const { BALANCE, INITIAL, CLICK_BASE_YEN } = await import('../data/balance');
    expect(INITIAL).toEqual({ yen: 120, tickets: 3 });
    expect(CLICK_BASE_YEN).toBe(1);
    expect(BALANCE.work.yenPerConversion).toBe(10);
    expect(BALANCE.metro.maxYenPerDay).toBe(1000);
  });
});
