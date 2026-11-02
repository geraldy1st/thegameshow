import { expect, it } from 'vitest';
import * as M from './balance';

/**
 * Patch 0.4.3 (R-P43-6): only BALANCE.fx may change. Everything else exported by the balance
 * module (rates, pity, costs, quests, BALANCE without fx) must hash exactly as on dea1985.
 */
const stable = (v: unknown): string =>
  Array.isArray(v)
    ? `[${v.map(stable).join(',')}]`
    : v && typeof v === 'object'
      ? `{${Object.keys(v)
          .sort()
          .map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`)
          .join(',')}}`
      : JSON.stringify(v);

async function balanceHashWithoutFx(mod: typeof M): Promise<string> {
  const rest = Object.fromEntries(Object.entries(mod.BALANCE).filter(([k]) => k !== 'fx'));
  const all = { ...mod, BALANCE: rest, xpNeed: [1, 2, 3, 10].map(mod.xpNeed) };
  const bytes = new TextEncoder().encode(stable(all));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const DEA1985 = '6abe5f255bd7119cc0081f454f8a8d0cfcd7fa4b205ad22d9d80cbb63a3b3cd4';

it('R-P43-6: the balance without fx is byte-identical to dea1985', async () => {
  expect(await balanceHashWithoutFx(M)).toBe(DEA1985);
});

it('R-P43-6 mutation: a changed rarity rate changes the hash', async () => {
  const mutated = { ...M, RARITY_RATES: { ...M.RARITY_RATES, 3: 0.06 } } as typeof M;
  expect(await balanceHashWithoutFx(mutated)).not.toBe(DEA1985);
});

it('R-P43-2: the pool covers a sliding 1 s cap of 15 taps over the whole float', () => {
  const cap = M.BALANCE.work.maxTapsPerSecond;
  const longest = Math.max(M.BALANCE.fx.floatMs, M.BALANCE.fx.reducedMs);
  expect(M.BALANCE.fx.poolSize).toBeGreaterThanOrEqual(cap * Math.ceil(longest / 1000));
});
