/**
 * Test harness (SPEC-ADDENDUM RES-11). Loaded ONLY in `vite build --mode test-harness`;
 * main.tsx guards the dynamic import with a compile-time constant so production builds
 * contain none of this code (checked by tools/check-no-test-hook.mjs).
 */
import type { StoreApi } from 'zustand/vanilla';
import type { ManualClock } from './core/clock';
import { createRng } from './core/rng';
import { BALANCE } from './data/balance';
import type { GameStoreState } from './store/gameStore';
import type { BoostPhase } from './core/boost';
import { boostStore, forceShow, seedBoost } from './ui/work/boostStore';
import { setMediaOverride, type MediaOverride } from './ui/work/media';

/**
 * Controlled key list (ARCHITECTURE-LOT4 §7 bis): every key of `__TGS_TEST__` must be here, and
 * every specific key is searched in the minified production build by tools/check-no-test-hook.mjs.
 */
export const HARNESS_KEYS = [
  'now',
  'setNow',
  'advance',
  'state',
  'seed',
  'setTickets',
  'setPity',
  'setEnergy',
  'loadSave',
  'seedRng',
  'setVisibility',
  'setCursor',
  'boostShow',
  'boostPhase',
  'mediaOverride',
] as const;

export interface TestHook {
  now(): number;
  setNow(t: number): void;
  advance(ms: number): void;
  state(): GameStoreState['game'];
  /** Test build only (lot 2): reseed the draw PRNG, set tickets or pity, then persist. */
  seed(n: number): Promise<boolean>;
  setTickets(n: number): Promise<boolean>;
  setPity(n: number): Promise<boolean>;
  /** Test build only (lot 3, DEF-GS-14): set the energy (clamped 0..max) at the harness clock, then persist. */
  setEnergy(n: number): Promise<boolean>;
  /** Lot 4: validate, migrate and write `obj` through the normal compare-and-set; refuses an invalid object. */
  loadSave(obj: unknown): Promise<boolean>;
  /** Lot 4: seed of the boost rng (40-60 s gap); restarts the boost cycle at the harness clock. */
  seedRng(n: number): void;
  /** Lot 4: override document.visibilityState and fire visibilitychange. */
  setVisibility(v: 'visible' | 'hidden'): void;
  /** Lot 4: fix the gauge cursor (0..1), or null for the normal triangle wave. */
  setCursor(p: number | null): void;
  /** Lot 4: show the boost now. */
  boostShow(): void;
  /** Lot 4: current boost phase. */
  boostPhase(): BoostPhase;
  /** Lot 4: force reduced motion, Save-Data, effectiveType or a refused play(); null resets. */
  mediaOverride(o: MediaOverride | null): void;
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
    setEnergy: (n) =>
      patch({
        energy: {
          value: Math.max(0, Math.min(BALANCE.energy.max, Math.floor(n))),
          updatedAt: clock.now(),
        },
      }),
    loadSave: async (obj) => (await store.getState().importSave(JSON.stringify(obj))).ok,
    seedRng: (n) => seedBoost(n, clock.now()),
    setVisibility: (v) => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v });
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => v === 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    },
    setCursor: (p) => boostStore.setState({ cursor: p }),
    boostShow: () => {
      forceShow(clock.now());
    },
    boostPhase: () => boostStore.getState().boost.phase,
    mediaOverride: (o) => setMediaOverride(o),
  };
}
