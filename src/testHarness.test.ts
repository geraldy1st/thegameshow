// @vitest-environment jsdom
import tool from '../tools/check-no-test-hook.mjs?raw';
import { describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import { ManualClock } from './core/clock';
import type { GameStoreState } from './store/gameStore';
import { HARNESS_KEYS, installTestHook } from './testHarness';

describe('test harness keys (ARCHITECTURE-LOT4 §7 bis)', () => {
  it('installs exactly the controlled key list', () => {
    installTestHook({} as StoreApi<GameStoreState>, new ManualClock(0));
    expect(Object.keys(window.__TGS_TEST__ ?? {}).sort()).toEqual([...HARNESS_KEYS].sort());
    expect(HARNESS_KEYS).not.toContain('show');
    expect(HARNESS_KEYS).not.toContain('media');
  });

  it('every specific key is searched in the production build by check:no-test-hook', () => {
    const generic = ['now', 'setNow', 'advance', 'state', 'seed'];
    for (const k of HARNESS_KEYS.filter((k) => !generic.includes(k))) {
      expect(tool).toContain(`'${k}'`);
    }
  });
});
