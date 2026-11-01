import { describe, expect, it } from 'vitest';
import { BALANCE } from '../data/balance';

/**
 * GS-V5-24 / R-LOT4-2: Crypto's independent 30-day work simulation (recette-lot4/scripts/worksim.mjs),
 * adopted as a regression test. It models the screen with the shipped balance (energy, tap cap,
 * boost timings) and checks that the boost adds at most 15 % to the points over 30 days, seed 77,
 * 100 ms steps. The "hoard" profile (R-LOT4-3: storing energy for the boost) is outside the spec
 * and is only recorded, not asserted against 1.15.
 */
type Profile = {
  sessions: number;
  sessionMin: number;
  rate: number;
  hit: number;
  reactS: number;
  strategy?: 'hoard';
};

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const { energy, boost, work } = BALANCE;
const STEP_S = 0.1;
const MAX = energy.max;
const REGEN = energy.perSecond * STEP_S;
const CAP = work.maxTapsPerSecond * STEP_S * work.energyPerTap;
const GAP_MIN = boost.minGapMs / 1000;
const GAP_SPAN = (boost.maxGapMs - boost.minGapMs) / 1000;
const VISIBLE = boost.visibleMs / 1000;
const DURATION = boost.durationMs / 1000;

function day(p: Profile, withBoost: boolean, R: () => number): number {
  let pts = 0;
  const steps = Math.round((p.sessionMin * 60) / STEP_S);
  for (let s = 0; s < p.sessions; s++) {
    let e: number = energy.initial;
    let next = GAP_MIN + GAP_SPAN * R();
    let shownAt = -1;
    let end = -1;
    let hitDone = false;
    for (let step = 0; step < steps; step++) {
      const t = step * STEP_S;
      e = Math.min(MAX, e + REGEN);
      if (withBoost && shownAt < 0 && t >= next) {
        shownAt = t;
        hitDone = false;
      }
      if (withBoost && shownAt >= 0 && !hitDone && t >= shownAt + p.reactS) {
        hitDone = true;
        if (R() < p.hit) end = t + DURATION;
        next = t + VISIBLE + GAP_MIN + GAP_SPAN * R();
        shownAt = -1;
      }
      if (withBoost && shownAt >= 0 && t >= shownAt + VISIBLE) {
        shownAt = -1;
        next = t + GAP_MIN + GAP_SPAN * R();
      }
      const boosted = t < end;
      let want = p.strategy === 'hoard' ? (boosted || e >= MAX ? CAP : 0) : p.rate * STEP_S;
      if (p.strategy === 'hoard' && !withBoost) want = CAP;
      const n = Math.min(want, e, CAP);
      e -= n;
      pts += n * (boosted ? boost.mult : 1);
    }
  }
  return pts;
}

function ratio(p: Profile, days = 30, seed = 77): number {
  const R1 = mulberry32(seed);
  const R2 = mulberry32(seed);
  let a = 0;
  let b = 0;
  for (let d = 0; d < days; d++) {
    a += day(p, true, R1);
    b += day(p, false, R2);
  }
  return a / b;
}

const IN_SPEC: Record<string, Profile> = {
  actif: { sessions: 3, sessionMin: 10, rate: 15, hit: 0.6, reactS: 2 },
  idle: { sessions: 1, sessionMin: 5, rate: 3, hit: 0.3, reactS: 4 },
  'reduced-motion': { sessions: 3, sessionMin: 10, rate: 15, hit: 1, reactS: 1 },
};

describe('GS-V5-24 work simulation, 30 days, seed 77 (Crypto, R-LOT4-2)', () => {
  for (const [name, p] of Object.entries(IN_SPEC)) {
    it(`${name}: boost adds at most 15 %`, () => {
      expect(ratio(p)).toBeLessThanOrEqual(1.15);
    });
  }
  it('hoard (out of spec, R-LOT4-3 open): recorded, above 1.15 with the current balance', () => {
    const r = ratio({ ...IN_SPEC['reduced-motion']!, strategy: 'hoard' });
    expect(r).toBeGreaterThan(1.15);
    expect(r).toBeCloseTo(1.72, 1);
  });
});
