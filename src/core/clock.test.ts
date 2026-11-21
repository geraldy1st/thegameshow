import { describe, expect, it } from 'vitest';
import { isCalendarDay, localDay } from './clock';

function utcExists(y: number, m: number, d: number): boolean {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function ymd(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

describe('isCalendarDay (DEF-GS-63, DEF-GS-64)', () => {
  it('accepts real civil days that some time zones skip at local midnight', () => {
    // These midnights do not exist locally in the named zones; the date itself is real.
    expect(isCalendarDay('1994-12-31')).toBe(true); // Pacific/Kiritimati
    expect(isCalendarDay('2011-12-30')).toBe(true); // Pacific/Apia
    expect(isCalendarDay('1993-08-21')).toBe(true); // Pacific/Kwajalein
  });

  it("rejects '1995-01-00' even under Pacific/Kiritimati (N19, DEF-GS-64)", () => {
    // Under Kiritimati, local `new Date(1995, 0, 0)` lands on 1995-01-01, so a
    // local construction that drops getDate() would wrongly accept this string.
    expect(isCalendarDay('1995-01-00')).toBe(false);
  });

  it('rejects years 0000–0099 (NV6-08)', () => {
    expect(isCalendarDay('0000-01-01')).toBe(false);
    expect(isCalendarDay('0099-12-31')).toBe(false);
    expect(isCalendarDay('0100-01-01')).toBe(true);
  });

  it('agrees with UTC Gregorian existence across every year 100–9999 (widened beyond 5 samples)', () => {
    const bad: string[] = [];
    for (let y = 100; y <= 9999; y++) {
      for (let m = 1; m <= 12; m++) {
        for (let d = 0; d <= 32; d++) {
          const s = ymd(y, m, d);
          if (isCalendarDay(s) !== utcExists(y, m, d)) bad.push(s);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('localDay still uses the device time zone', () => {
    const t = Date.UTC(2026, 10, 15, 0, 30); // 00:30 UTC on 15/11
    const expected = new Date(t);
    const p = (n: number) => String(n).padStart(2, '0');
    expect(localDay(t)).toBe(
      `${expected.getFullYear()}-${p(expected.getMonth() + 1)}-${p(expected.getDate())}`,
    );
  });
});
