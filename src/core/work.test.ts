import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { BALANCE, MAX_LEVEL, QUESTS, xpNeed } from '../data/balance';
import { WORK_CURSOR_MAX } from '../data/workTexts';
import {
  boostMult,
  cursorAt,
  hideTab,
  initBoost,
  isDoubled,
  secondsLeft,
  tickBoost,
  touchAoi,
  type BoostState,
} from './boost';
import { convert } from './conversion';
import { addXp } from './level';
import { createRng } from './rng';
import { createInitialState } from './state';
import { acceptTap } from './tapLimiter';
import { clickValuePoints, normalizeWorkMode, tap } from './work';
import type { GameState } from './types';

const T0 = Date.UTC(2026, 10, 1, 10, 0, 0);
const fresh = (): GameState => createInitialState(T0, 1);
const withEnergy = (g: GameState, value: number): GameState => ({
  ...g,
  energy: { value, updatedAt: T0 },
});

describe('tap limiter (15 per sliding second)', () => {
  it('accepts 15 in (now − 1000, now] and refuses the 16th without recording it', () => {
    let w: readonly number[] = [];
    for (let i = 0; i < 15; i++) w = acceptTap(w, T0).window;
    const r = acceptTap(w, T0 + 999);
    expect(r.accepted).toBe(false);
    expect(r.window).toHaveLength(15);
    expect(acceptTap(w, T0 + 1000).accepted).toBe(true);
  });
});

describe('tap (GS-V5-46, 47, 58)', () => {
  it('costs 1 energy, gives clickVal points, +1 XP, +1 totalClicks, +1 « clic »', () => {
    const r = tap(fresh(), [], T0);
    if (!r.accepted) throw new Error('refused');
    expect(r.gained).toBe(clickValuePoints(fresh()));
    expect(r.state.energy.value).toBe(49);
    expect(r.state.work).toEqual({
      mode: 'roman',
      points: 1,
      pointsTotal: 1,
      cursor: 6,
      taps: 1,
    });
    expect(r.state.profile.xp).toBe(1);
    expect(r.state.totalClicks).toBe(1);
    expect(r.state.quests.progress.click).toBe(1);
    expect(r.state.yenCents).toBe(fresh().yenCents);
  });
  it('energy 1 → accepted then 0; energy 0 → refused, nothing changes', () => {
    const r1 = tap(withEnergy(fresh(), 1), [], T0);
    expect(r1.accepted && r1.state.energy.value).toBe(0);
    const r0 = tap(r1.state, r1.window, T0);
    expect(r0.accepted).toBe(false);
    expect(!r0.accepted && r0.reason).toBe('energy');
    expect(r0.state.work).toEqual(r1.state.work);
    expect(r0.state.quests.progress.click).toBe(1);
  });
  it('recharge 1/s applies before a tap; none when the clock goes back', () => {
    const g = { ...withEnergy(fresh(), 0), maxSeenAt: T0 };
    expect(tap(g, [], T0 + 1000).accepted).toBe(true);
    expect(tap(g, [], T0 - 5000).accepted).toBe(false);
  });
  it('the boost doubles points, never XP, taps or the quest', () => {
    const r = tap(fresh(), [], T0, 2);
    if (!r.accepted) throw new Error('refused');
    expect(r.state.work.points).toBe(2);
    expect(r.state.profile.xp).toBe(1);
    expect(r.state.work.taps).toBe(1);
    expect(r.state.quests.progress.click).toBe(1);
  });
  it('level up exactly at xpNeed(level), xp back to 0, the tap is paid at the old level', () => {
    const g = { ...fresh(), profile: { level: 1, xp: xpNeed(1) - 1 } };
    const r = tap(g, [], T0);
    if (!r.accepted) throw new Error('refused');
    expect(r.levelUp).toBe(true);
    expect(r.gained).toBe(1);
    expect(r.state.profile).toEqual({ level: 2, xp: 0 });
    expect(clickValuePoints(r.state)).toBe(2);
    expect(addXp({ ...g, profile: { level: MAX_LEVEL, xp: 0 } }, 10_000).state.profile.level).toBe(
      MAX_LEVEL,
    );
  });
  it('« clic » quest goal is reached by taps only and stays capped', () => {
    let g = { ...fresh(), energy: { value: 50, updatedAt: T0 } };
    let w: readonly number[] = [];
    let t = T0;
    for (let i = 0; i < QUESTS.click.goal + 5; i++) {
      if (i % 15 === 0) t += 1000;
      g = { ...g, energy: { value: 50, updatedAt: t } };
      const r = tap(g, w, t);
      g = r.state;
      w = r.window;
    }
    expect(g.quests.progress.click).toBe(QUESTS.click.goal);
    expect(g.totalClicks).toBe(QUESTS.click.goal + 5);
  });
  it('detects a 100-point milestone of pointsTotal', () => {
    const g = { ...fresh(), work: { ...fresh().work, pointsTotal: 99, points: 99 } };
    const r = tap(g, [], T0);
    expect(r.accepted && r.milestone).toBe(true);
  });
  it('Travailler gains touch no quest other than « clic » (no quiz cap entry)', () => {
    const r = tap(fresh(), [], T0);
    const { click, ...others } = r.state.quests.progress;
    expect(click).toBe(1);
    const { click: _c, ...before } = fresh().quests.progress;
    void _c;
    expect(others).toEqual(before);
  });
  it('cursor stays in bounds (property, 1 000 cases)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: WORK_CURSOR_MAX }), (cursor) => {
        const g = { ...fresh(), work: { ...fresh().work, cursor } };
        const r = tap(g, [], T0);
        return r.state.work.cursor >= 0 && r.state.work.cursor <= WORK_CURSOR_MAX;
      }),
      { numRuns: 1000, seed: 77 },
    );
  });
  it('normalizeWorkMode (0.4.2, R-P42-4): presse → roman, cursor 0, the rest untouched', () => {
    const w = { ...fresh().work, cursor: 42, points: 7, pointsTotal: 900, taps: 55 };
    const presse = { ...fresh(), totalClicks: 55, work: { ...w, mode: 'presse' as const } };
    const n = normalizeWorkMode(presse);
    expect(n.work).toEqual({ ...w, mode: 'roman', cursor: 0 });
    expect({ ...n, work: null }).toEqual({ ...presse, work: null });
    const roman = { ...fresh(), work: { ...w, mode: 'roman' as const } };
    expect(normalizeWorkMode(roman)).toBe(roman); // same object: nothing to write
  });
});

describe('conversion (GS-V5-48)', () => {
  it('n × 100 + r pts → n × 10 ¥ in exact cents, r kept, +1 Créativité per conversion', () => {
    const g = { ...fresh(), work: { ...fresh().work, points: 1234, pointsTotal: 1234 } };
    const r = convert(g);
    expect(r.yen).toBe(120);
    expect(r.state.yenCents).toBe(g.yenCents + 12_000);
    expect(r.state.work.points).toBe(34);
    expect(r.state.work.pointsTotal).toBe(1234);
    expect(r.state.stats.crea).toBe(1);
  });
  it('below 100 points nothing changes; Créativité capped at 100', () => {
    const g = { ...fresh(), work: { ...fresh().work, points: 99, pointsTotal: 99 } };
    expect(convert(g)).toEqual({ state: g, yen: 0 });
    const full = {
      ...fresh(),
      stats: { ...fresh().stats, crea: 100 },
      work: { ...fresh().work, points: 100, pointsTotal: 100 },
    };
    expect(convert(full).state.stats.crea).toBe(100);
  });
  it('property: yen and rest are exact (1 000 cases)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10 ** 9 }), (points) => {
        const g = { ...fresh(), work: { ...fresh().work, points, pointsTotal: points } };
        const r = convert(g);
        return (
          r.yen === Math.floor(points / 100) * 10 &&
          r.state.work.points === points % 100 &&
          r.state.yenCents === g.yenCents + r.yen * 100
        );
      }),
      { numRuns: 1000, seed: 77 },
    );
  });
});

describe('boost machine (GS-V5-51)', () => {
  const start = (): BoostState => initBoost(T0, createRng(7));
  const shown = (): BoostState => tickBoost({ ...start(), nextShowAt: T0 }, T0, true).state;
  it('draws the gap in [40 000, 60 000] ms (1 000 draws, fixed seed)', () => {
    let rng = createRng(77);
    for (let i = 0; i < 1000; i++) {
      const s = initBoost(0, rng);
      expect(s.nextShowAt).toBeGreaterThanOrEqual(BALANCE.boost.minGapMs);
      expect(s.nextShowAt).toBeLessThanOrEqual(BALANCE.boost.maxGapMs);
      rng = s.rng;
    }
  });
  it('idle → shown at nextShowAt, never while the tab is hidden', () => {
    const s = start();
    expect(tickBoost(s, s.nextShowAt - 1, true).state.phase).toBe('idle');
    expect(tickBoost(s, s.nextShowAt, false).state.phase).toBe('idle');
    expect(tickBoost(s, s.nextShowAt, true)).toMatchObject({
      state: { phase: 'shown', shownAt: s.nextShowAt, hideAt: s.nextShowAt + 12_000 },
      event: 'shown',
    });
  });
  // 0.4.2 D3 (R-P42-1, R-P42-3): [0.349,'miss'] and [0.651,'miss'] become « no event, state
  // unchanged »; the gauge then stays until 12 000 ms and the multiplier stays x1.
  it.each([0.35, 0.5, 0.65])('shown → p = %s (in the zone, bounds included) → hit', (p) => {
    const r = touchAoi(shown(), T0 + 100, true, p);
    expect(r.event).toBe('hit');
    expect(r.state).toMatchObject({ phase: 'active', boostEnd: T0 + 100 + 5000 });
    expect(boostMult(r.state, T0 + 100 + 4999)).toBe(2);
    expect(boostMult(r.state, T0 + 100 + 5000)).toBe(1);
  });
  it.each([0.349, 0.651, 0, 1])('shown → p = %s (off the zone) → no event, unchanged', (p) => {
    const s = shown();
    const r = touchAoi(s, T0 + 100, true, p);
    expect(r.event).toBeNull();
    expect(r.state).toBe(s);
    expect(boostMult(r.state, T0 + 100)).toBe(1);
    // Many off-zone touches: the gauge is still shown at 11 999 ms, cooldown at 12 000 ms.
    let st = r.state;
    for (let t = T0 + 200; t < T0 + 12_000; t += 250) st = touchAoi(st, t, true, p).state;
    expect(tickBoost(st, T0 + 11_999, true).state.phase).toBe('shown');
    expect(tickBoost(st, T0 + 12_000, true)).toMatchObject({
      state: { phase: 'cooldown' },
      event: 'expired',
    });
  });
  it('shown 11 999 ms visible, hidden at 12 000 without a miss message', () => {
    expect(tickBoost(shown(), T0 + 11_999, true).state.phase).toBe('shown');
    expect(tickBoost(shown(), T0 + 12_000, true)).toMatchObject({
      state: { phase: 'cooldown' },
      event: 'expired',
    });
  });
  it('active doubles while now < boostEnd, then cooldown + joyPending', () => {
    const a = touchAoi(shown(), T0, true, 0.5).state;
    expect(isDoubled(a, T0 + 4999)).toBe(true);
    expect(boostMult(a, T0 + 5000)).toBe(1);
    expect(secondsLeft(a, T0 + 1)).toBe(5);
    const end = tickBoost(a, T0 + 5000, true);
    expect(end).toMatchObject({ state: { phase: 'cooldown', joyPending: true }, event: 'ended' });
    expect(end.state.nextShowAt - (T0 + 5000)).toBeGreaterThanOrEqual(40_000);
  });
  it('tab hidden during active: wall clock, no joy at the end (G-5 lost)', () => {
    const a = hideTab(touchAoi(shown(), T0, true, 0.5).state);
    expect(isDoubled(a, T0 + 4999)).toBe(true);
    expect(tickBoost(a, T0 + 6000, true).state.joyPending).toBe(false);
  });
  it('no stacking: touching during active changes nothing; outside shown no event', () => {
    const a = touchAoi(shown(), T0, true, 0.5).state;
    expect(touchAoi(a, T0 + 100, true, 0.5).state).toEqual(a);
    expect(touchAoi(start(), T0, true, 0.5).event).toBeNull();
  });
  it('cursor is a 2.6 s triangle wave', () => {
    const s = shown();
    expect(cursorAt(s, T0)).toBe(0);
    expect(cursorAt(s, T0 + 1300)).toBe(1);
    expect(cursorAt(s, T0 + 650)).toBeCloseTo(0.5);
    expect(cursorAt(s, T0 + 2600)).toBe(0);
  });
});
