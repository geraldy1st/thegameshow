import { describe, expect, it } from 'vitest';
import { HOUR_MS, INITIAL, MAX_AMOUNT, OFFLINE_CAP_MS } from '../data/balance';
import { ManualClock, localDay } from './clock';
import { buy, click, clickValueYen, incomeCentsPerSecond, nextCostYen } from './economy';
import { collectOffline, settle } from './idle';
import { addAmount } from './numbers';
import { createRng, nextFloat } from './rng';
import { createInitialState } from './state';
import type { GameState } from './types';

const T0 = Date.UTC(2026, 9, 25, 12, 0, 0);
const fresh = () => createInitialState(T0, 42);
const withLevels = (s: GameState, save: number, stock = 0, estate = 0): GameState => ({
  ...s,
  investments: { save, stock, estate },
});

describe('initial state (RES-7e)', () => {
  it('matches the spec, not the mockup demo values', () => {
    const s = fresh();
    expect(s.yenCents).toBe(INITIAL.yen * 100);
    expect(s.tickets).toBe(3);
    expect(s.investments).toEqual({ save: 0, stock: 0, estate: 0 });
    expect(Object.values(s.friends).map((f) => f.affinity)).toEqual([0, 0, 0]);
    expect(s.gacha).toEqual({ pity: 0, pulls: 0, stars: {}, last: null });
    expect(s.revision).toBe(0);
  });
});

describe('rng', () => {
  it('is deterministic for a seed and stays in [0,1)', () => {
    let a = createRng(7);
    let b = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const [x, na] = nextFloat(a);
      const [y, nb] = nextFloat(b);
      expect(x).toBe(y);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      a = na;
      b = nb;
    }
  });
});

describe('click and investments', () => {
  it('a click earns 1 yen at start', () => {
    const s = click(fresh());
    expect(clickValueYen(fresh())).toBe(1);
    expect(s.yenCents).toBe(12100);
    expect(s.totalClicks).toBe(1);
  });
  it('costs follow base x growth^level, rounded up', () => {
    expect(nextCostYen('save', 0)).toBe(50);
    expect(nextCostYen('save', 1)).toBe(58); // 57.5 -> 58
    expect(nextCostYen('stock', 0)).toBe(250);
    expect(nextCostYen('stock', 1)).toBe(293); // 292.5
    expect(nextCostYen('estate', 0)).toBe(2000);
    expect(nextCostYen('estate', 1)).toBe(2400);
  });
  it('buying deducts the cost and refuses when short', () => {
    const r = buy(fresh(), 'save');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.state.yenCents).toBe(7000);
      expect(r.state.investments.save).toBe(1);
    }
    expect(buy(fresh(), 'estate')).toEqual({ ok: false, reason: 'insufficient' });
  });
  it('income per second uses per-level rates', () => {
    expect(incomeCentsPerSecond(withLevels(fresh(), 1, 1, 1))).toBeCloseTo(60 + 250 + 1400);
  });
  it('partner bonus multiplies income (Jun 3 stars = +24% all)', () => {
    const s = {
      ...withLevels(fresh(), 10),
      gacha: { pity: 0, pulls: 1, stars: { jun: 3 as const }, last: null },
    };
    expect(incomeCentsPerSecond(s)).toBeCloseTo(600 * 1.24);
  });
});

describe('idle settlement (RES-5)', () => {
  const base = () => withLevels(fresh(), 10); // 6 yen/s = 600 cents/s

  it('credits elapsed time silently under 60 s', () => {
    const r = settle(base(), T0 + 1000);
    expect(r.gainCents).toBe(600);
    expect(r.deferred).toBe(false);
    expect(r.state.yenCents).toBe(12000 + 600);
    expect(r.state.lastSeenAt).toBe(T0 + 1000);
  });
  it('defers long absences to the welcome-back screen, collected once', () => {
    const r = settle(base(), T0 + 5 * 60_000);
    expect(r.deferred).toBe(true);
    expect(r.state.pendingOfflineCents).toBe(600 * 300);
    expect(r.state.yenCents).toBe(12000);
    const c = collectOffline(r.state);
    expect(c.yenCents).toBe(12000 + 180_000);
    expect(collectOffline(c)).toBe(c);
  });
  it('caps offline gains at 8 h', () => {
    const r = settle(base(), T0 + 30 * HOUR_MS);
    expect(r.creditedMs).toBe(OFFLINE_CAP_MS);
    expect(r.gainCents).toBe(600 * 8 * 3600);
  });
  it('clock rollback: gain 0 and lastSeenAt not advanced, then resumes normally', () => {
    const s = settle(base(), T0 + 10_000).state; // max = T0+10s
    const back = settle(s, T0 - HOUR_MS);
    expect(back.clockRollback).toBe(true);
    expect(back.gainCents).toBe(0);
    expect(back.state).toBe(s);
    const again = settle(back.state, T0 + 11_000);
    expect(again.gainCents).toBe(600);
  });
  it('no double counting: 1 s ticks + catch-up equal a single settlement', () => {
    const clock = new ManualClock(T0);
    let ticked = base();
    for (let i = 0; i < 30; i++) {
      clock.advance(1000);
      ticked = settle(ticked, clock.now()).state;
    }
    clock.advance(5 * 60_000); // tab hidden 5 min
    ticked = collectOffline(settle(ticked, clock.now()).state);
    ticked = settle(ticked, clock.now()).state; // extra call at same instant adds nothing
    const single = collectOffline(settle(base(), clock.now()).state);
    expect(ticked.yenCents).toBe(single.yenCents);
  });
  it('matches the formula within 1 unit for arbitrary durations (< 2^53)', () => {
    let rng = createRng(1);
    for (let i = 0; i < 500; i++) {
      const [u, n] = nextFloat(rng);
      rng = n;
      const ms = Math.floor(u * 10 * HOUR_MS);
      const s = withLevels(fresh(), 3, 2, 1);
      const expected = (incomeCentsPerSecond(s) * Math.min(ms, OFFLINE_CAP_MS)) / 1000;
      expect(Math.abs(settle(s, T0 + ms).gainCents - expected)).toBeLessThanOrEqual(1);
    }
  });
});

describe('numbers (RES-4)', () => {
  it('saturate at MAX_SAFE_INTEGER and never go negative or NaN', () => {
    expect(addAmount(MAX_AMOUNT, 1)).toBe(MAX_AMOUNT);
    expect(addAmount(1, Infinity)).toBe(MAX_AMOUNT);
    expect(addAmount(5, -10)).toBe(0);
    const huge = { ...withLevels(fresh(), 1e12, 1e12, 1e12) };
    const r = settle(huge, T0 + OFFLINE_CAP_MS);
    expect(Number.isSafeInteger(r.state.pendingOfflineCents)).toBe(true);
  });
  it('30-day idle/click simulation keeps values finite, non-negative and monotone', () => {
    const clock = new ManualClock(T0);
    let s = fresh();
    let prevTotal = 0;
    for (let day = 0; day < 30; day++) {
      for (let i = 0; i < 200; i++) s = click(s);
      for (const id of ['save', 'stock', 'estate'] as const) {
        let r = buy(s, id);
        while (r.ok) {
          s = r.state;
          r = buy(s, id);
        }
      }
      clock.advance(HOUR_MS * 24);
      s = collectOffline(settle(s, clock.now()).state);
      const total = s.investments.save + s.investments.stock + s.investments.estate;
      expect(total).toBeGreaterThanOrEqual(prevTotal);
      prevTotal = total;
      expect(Number.isSafeInteger(s.yenCents) && s.yenCents >= 0).toBe(true);
    }
    expect(prevTotal).toBeGreaterThan(0);
  });
});

describe('local day', () => {
  it('formats YYYY-MM-DD', () => {
    expect(localDay(T0)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
