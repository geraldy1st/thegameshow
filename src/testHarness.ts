/**
 * Test harness (SPEC-ADDENDUM RES-11). Loaded ONLY in `vite build --mode test-harness`;
 * main.tsx guards the dynamic import with a compile-time constant so production builds
 * contain none of this code (checked by tools/check-no-test-hook.mjs).
 */
import type { StoreApi } from 'zustand/vanilla';
import type { ManualClock } from './core/clock';
import { createRng } from './core/rng';
import type { GameStoreState } from './store/gameStore';

export interface TestHook {
  now(): number;
  setNow(t: number): void;
  advance(ms: number): void;
  state(): GameStoreState['game'];
  /** Test build only (lot 2): reseed the draw PRNG, set tickets or pity, then persist. */
  seed(n: number): Promise<boolean>;
  setTickets(n: number): Promise<boolean>;
  setPity(n: number): Promise<boolean>;
}

declare global {
  interface Window {
    __TGS_TEST__?: TestHook;
  }
}

export function installTestHook(store: StoreApi<GameStoreState>, clock: ManualClock): void {
  const patch = (p: Partial<NonNullable<GameStoreState['game']>>) => {
    const g = store.getState().game;
    if (!g) return Promise.resolve(false);
    store.setState({ game: { ...g, ...p } });
    return store.getState().flush();
  };
  window.__TGS_TEST__ = {
    now: () => clock.now(),
    setNow: (t) => clock.set(t),
    advance: (ms) => {
      clock.advance(ms);
      store.getState().tick();
    },
    state: () => store.getState().game,
    seed: (n) => patch({ rng: createRng(n) }),
    setTickets: (n) => patch({ tickets: n }),
    setPity: (n) => {
      const g = store.getState().game;
      return g ? patch({ gacha: { ...g.gacha, pity: n } }) : Promise.resolve(false);
    },
  };
}
