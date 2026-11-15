import { describe, expect, it } from 'vitest';
import { INITIAL } from '../data/balance';
import { createInitialState } from '../core/state';
import { centsToBucks } from '../core/numbers';
import {
  BUCK_SUFFIX,
  fmt,
  formatAmount,
  formatBucks,
  formatBucksLong,
  type FormatLocale,
} from './format';

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

describe('fmt compact suffixes (billions are Md; B is only Buck)', () => {
  const locales: FormatLocale[] = ['fr', 'en', 'es'];

  it('uses Md for 10^9 in fr, en and es, never the letter B', () => {
    expect(fmt(1_000_000_000, 'fr')).toBe('1\u00a0Md');
    expect(fmt(1_000_000_000, 'en')).toBe('1\u00a0Md');
    expect(fmt(1_000_000_000, 'es')).toBe('1\u00a0Md');
    expect(fmt(1_500_000_000, 'fr')).toBe('1,5\u00a0Md');
    expect(fmt(1_500_000_000, 'en')).toBe('1.5\u00a0Md');
  });

  it('uses M above one million and does not compact below', () => {
    expect(fmt(1_000_000, 'fr')).toBe('1\u00a0M');
    expect(fmt(999_999, 'fr')).toBe('999\u202f999');
    expect(fmt(1_000_000, 'en')).toBe('1\u00a0M');
  });

  it('uses a non-B suffix for 10^12 in every locale', () => {
    expect(fmt(1_000_000_000_000, 'fr')).toBe('1\u00a0Bn');
    expect(fmt(1_000_000_000_000, 'en')).toBe('1\u00a0T');
    expect(fmt(1_000_000_000_000, 'es')).toBe('1\u00a0T');
  });

  it('never uses B as a compact abbreviation, in any locale', () => {
    const samples = [1, 1_000, 1_000_000, 1_000_000_000, 1_000_000_000_000, 1.5e9];
    for (const locale of locales) {
      for (const n of samples) {
        const out = fmt(n, locale);
        const suffix = out.split('\u00a0').at(-1) ?? out;
        expect(suffix, `${locale} ${n} -> ${out}`).not.toBe('B');
        expect(
          out.endsWith('B') && !out.endsWith('Md') && !out.endsWith('Bn'),
          `${locale} ${n}`,
        ).toBe(false);
      }
    }
  });

  it('formatAmount delegates to fmt; formatBucks still suffixes NBSP + B', () => {
    expect(formatAmount(1_000_000_000)).toBe(fmt(1_000_000_000));
    expect(formatBucks(1_000_000_000)).toBe('1\u00a0Md\u00a0B');
    expect(formatAmount(1_000_000_000)).not.toContain('B');
  });
});
