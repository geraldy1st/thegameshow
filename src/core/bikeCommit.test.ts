import { describe, expect, it } from 'vitest';
import { createInitialState } from './state';
import { applyBikeCommit } from './bikeCommit';
import { applyDailyCapOnReplace } from './dailyCap';
import { MAX_STAT } from '../data/balance';
import { validateSaveV6 } from '../save/schema';

const T0 = Date.UTC(2026, 9, 25, 12, 0, 0);
const GID = '01234567-89ab-4def-8012-3456789abcde';
const RUN = '0a0a0a0a-0b0b-4c0c-8d0d-0e0e0e0e0e0e';
const RUN2 = '1a1a1a1a-1b1b-4c1c-8d1d-1e1e1e1e1e1e';

describe('applyDailyCapOnReplace', () => {
  it('is the single G-4 entry point and returns a result object', () => {
    const incoming = createInitialState(T0, 1, GID);
    const replaced = createInitialState(T0, 2, RUN);
    const r = applyDailyCapOnReplace(incoming, replaced, T0, [replaced]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.bike.day).toBe(incoming.bike.day);
  });
});

describe('applyBikeCommit', () => {
  it('on success increments counters, +1 to the three skills (also at 0 B), and writes a receipt', () => {
    const g = {
      ...createInitialState(T0, 1, GID),
      bike: { ...createInitialState(T0, 1, GID).bike, earnedTodayCents: 100_000 },
    };
    const r = applyBikeCommit(g, {
      runId: RUN,
      outcome: 'success',
      coins: 0,
      distanceM: 10,
      now: T0,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.paidCents).toBe(0);
    expect(r.next.bike.successes).toBe(1);
    expect(r.next.bike.failures).toBe(0);
    expect(r.next.stats.sante).toBe(1);
    expect(r.next.stats.bonheur).toBe(1);
    expect(r.next.stats.repu).toBe(1);
    expect(r.next.yenCents).toBe(g.yenCents);
    expect(validateSaveV6(r.next).ok).toBe(true);
  });
  it('caps each skill at 100 independently and records a failure without skill change', () => {
    const base = createInitialState(T0, 1, GID);
    const g = { ...base, stats: { ...base.stats, sante: MAX_STAT, bonheur: 99, repu: 0 } };
    const ok = applyBikeCommit(g, {
      runId: RUN,
      outcome: 'success',
      coins: 1,
      distanceM: 20,
      now: T0,
    });
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.next.stats.sante).toBe(100);
    expect(ok.next.stats.bonheur).toBe(100);
    expect(ok.next.stats.repu).toBe(1);
    const fail = applyBikeCommit(ok.next, {
      runId: RUN2,
      outcome: 'fail',
      coins: 1,
      distanceM: 8,
      now: T0 + 1,
    });
    expect(fail.ok).toBe(true);
    if (!fail.ok) return;
    expect(fail.next.bike.successes).toBe(1);
    expect(fail.next.bike.failures).toBe(1);
    expect(fail.next.stats).toEqual(ok.next.stats);
    expect(validateSaveV6(fail.next).ok).toBe(true);
  });
});
