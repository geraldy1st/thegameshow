import { describe, expect, it } from 'vitest';
import { BALANCE } from '../data/balance';
import { rechargeEnergy } from './energy';
import { createInitialState } from './state';

const T0 = Date.UTC(2026, 9, 31, 12, 0, 0);
const at = (value: number, updatedAt = T0) => ({
  ...createInitialState(T0, 1),
  energy: { value, updatedAt },
});

describe('energy recharge (GS-V5-10)', () => {
  it('recharges perSecond per whole second, capped at max', () => {
    expect(rechargeEnergy(at(10), T0 + 5_900).energy).toEqual({ value: 15, updatedAt: T0 + 5_000 });
    expect(rechargeEnergy(at(10), T0 + 3_600_000).energy.value).toBe(BALANCE.energy.max);
  });
  it('does nothing when the clock moved back', () => {
    const g = { ...at(10, T0 + 10_000), maxSeenAt: T0 + 10_000 };
    expect(rechargeEnergy(g, T0).energy).toEqual({ value: 10, updatedAt: T0 + 10_000 });
  });
  it('clips a stored value above the max', () => {
    expect(rechargeEnergy(at(80), T0 - 1).energy.value).toBe(BALANCE.energy.max);
  });
});
