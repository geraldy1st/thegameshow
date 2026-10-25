import { describe, expect, it } from 'vitest';
import {
  ASSOCIATES,
  MAX_TICKETS_PER_DAY,
  PITY_LIMIT,
  RARITY_RATES,
  type Rarity,
} from '../data/balance';
import {
  effectiveThreeStarRate,
  pickInRarity,
  pull,
  pullsUntilGuarantee,
  rollRarity,
} from './gacha';
import { createRng, type RngState } from './rng';
import { createInitialState } from './state';
import type { GameState } from './types';

const T0 = Date.UTC(2026, 9, 25, 12, 0, 0);
const withTickets = (n: number, pity = 0, seed = 7): GameState => {
  const s = createInitialState(T0, seed);
  return { ...s, tickets: n, gacha: { ...s.gacha, pity } };
};

describe('raw rarity table (RES-1a, ethics rule 2)', () => {
  it('passes a chi-square against 70/25/5 on 100 000 rolls (alpha 0.01, df 2)', () => {
    let rng: RngState = createRng(20261025);
    const n = 100_000;
    const counts: Record<Rarity, number> = { 1: 0, 2: 0, 3: 0 };
    for (let i = 0; i < n; i++) {
      const [r, next] = rollRarity(rng);
      counts[r]++;
      rng = next;
    }
    const chi2 = ([1, 2, 3] as Rarity[]).reduce((sum, r) => {
      const e = n * RARITY_RATES[r];
      return sum + (counts[r] - e) ** 2 / e;
    }, 0);
    expect(chi2).toBeLessThan(9.21);
    for (const r of [1, 2, 3] as Rarity[])
      expect(Math.abs(counts[r] / n - RARITY_RATES[r])).toBeLessThan(0.01);
  });

  it('picks uniformly inside a rarity', () => {
    let rng = createRng(3);
    const counts: Record<string, number> = {};
    for (let i = 0; i < 40_000; i++) {
      const [a, next] = pickInRarity(1, rng);
      counts[a.id] = (counts[a.id] ?? 0) + 1;
      rng = next;
    }
    for (const id of ['haru', 'kei', 'lila', 'nana'])
      expect(counts[id]! / 40_000).toBeCloseTo(0.25, 1);
  });
});

describe('hard pity (RES-1)', () => {
  const rarityOf = (id: string) => ASSOCIATES.find((a) => a.id === id)!.rarity;

  it('pity 0: a normal pull', () => {
    const r = pull(withTickets(1, 0));
    if (!r.ok) throw new Error();
    expect(r.last.forced).toBe(false);
    expect(r.state.tickets).toBe(0);
  });
  it('pity 48: the 49th pull is not forced', () => {
    for (let seed = 1; seed < 200; seed++) {
      const r = pull(withTickets(1, 48, seed));
      if (!r.ok) throw new Error();
      expect(r.last.forced).toBe(false);
      expect(r.state.gacha.pity).toBe(rarityOf(r.last.id) === 3 ? 0 : 49);
    }
  });
  it('pity 49: the 50th pull is a forced 3-star and pity resets', () => {
    for (let seed = 1; seed < 200; seed++) {
      const r = pull(withTickets(1, 49, seed));
      if (!r.ok) throw new Error();
      expect(r.last.forced).toBe(true);
      expect(rarityOf(r.last.id)).toBe(3);
      expect(r.state.gacha.pity).toBe(0);
    }
  });
  it('pity 50 is impossible: pity never exceeds 49 on a long run', () => {
    let s = withTickets(10_000);
    for (let i = 0; i < 10_000; i++) {
      const r = pull(s);
      if (!r.ok) throw new Error();
      s = r.state;
      expect(s.gacha.pity).toBeLessThanOrEqual(PITY_LIMIT - 1);
    }
  });
  it('a natural 3-star at pity 49 is impossible to miss, and pity shows 1 pull left', () => {
    expect(pullsUntilGuarantee(49)).toBe(1);
    expect(pullsUntilGuarantee(0)).toBe(50);
  });
  it('refuses without a ticket and changes nothing', () => {
    expect(pull(withTickets(0)).ok).toBe(false);
  });
});

describe('100 000 pulls with a fixed seed (RES-1b, c)', () => {
  it('effective 3-star rate is ~5.42 % and no gap exceeds 50', () => {
    const theory = effectiveThreeStarRate();
    expect(theory).toBeCloseTo(0.0542, 3);
    let s = withTickets(100_000, 0, 424242);
    let threes = 0;
    let gap = 0;
    let maxGap = 0;
    for (let i = 0; i < 100_000; i++) {
      const r = pull(s);
      if (!r.ok) throw new Error();
      s = r.state;
      gap++;
      if (rarityOf(r.last.id) === 3) {
        threes++;
        maxGap = Math.max(maxGap, gap);
        gap = 0;
      }
    }
    expect(Math.abs(threes / 100_000 - theory)).toBeLessThan(0.003);
    expect(maxGap).toBeLessThanOrEqual(50);
    expect(s.gacha.pulls).toBe(100_000);
  });
  const rarityOf = (id: string) => ASSOCIATES.find((a) => a.id === id)!.rarity;
});

describe('duplicates', () => {
  it('+1 star per duplicate up to 5; beyond, no effect but the ticket is used', () => {
    let s = withTickets(5000);
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i++) {
      const before = s.gacha.stars;
      const r = pull(s);
      if (!r.ok) throw new Error();
      const had = before[r.last.id];
      expect(r.last.isNew).toBe(had === undefined);
      expect(r.last.stars).toBe(Math.min(5, (had ?? 0) + 1));
      expect(r.last.wasted).toBe(had === 5);
      expect(r.state.tickets).toBe(s.tickets - 1);
      seen.add(r.last.id);
      s = r.state;
    }
    expect(seen.size).toBe(9);
  });
  it('a pull after reload with the stored rng gives the same result (no reroll)', () => {
    const s = withTickets(3);
    const reloaded = JSON.parse(JSON.stringify(s)) as GameState;
    const a = pull(s);
    const b = pull(reloaded);
    expect(a.ok && b.ok && a.last).toEqual(b.ok && b.last);
  });
});

it('MAX_TICKETS_PER_DAY is 7', () => expect(MAX_TICKETS_PER_DAY).toBe(7));
