/**
 * Test harness (SPEC-ADDENDUM RES-11). Loaded ONLY in `vite build --mode test-harness`;
 * main.tsx guards the dynamic import with a compile-time constant so production builds
 * contain none of this code (checked by tools/check-no-test-hook.mjs).
 */
import type { StoreApi } from 'zustand/vanilla';
import type { ManualClock } from './core/clock';
import type { GameStoreState } from './store/gameStore';

export interface TestHook {
  now(): number;
  setNow(t: number): void;
  advance(ms: number): void;
  state(): GameStoreState['game'];
}

declare global {
  interface Window {
    __TGS_TEST__?: TestHook;
  }
}

export function installTestHook(store: StoreApi<GameStoreState>, clock: ManualClock): void {
  window.__TGS_TEST__ = {
    now: () => clock.now(),
    setNow: (t) => clock.set(t),
    advance: (ms) => {
      clock.advance(ms);
      store.getState().tick();
    },
    state: () => store.getState().game,
  };
}
