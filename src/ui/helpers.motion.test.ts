/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyReducedMotionSetting, prefersReducedMotion } from './helpers';

describe('prefersReducedMotion (Q-M8, R-X10-10, 6-column table)', () => {
  const mq = (reduce: boolean) =>
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: reduce && q.includes('prefers-reduced-motion: reduce'),
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
      onchange: null,
    }));

  afterEach(() => {
    delete document.documentElement.dataset.motion;
    vi.unstubAllGlobals();
  });

  const cases: Array<[string, 'auto' | 'on' | 'off', boolean, boolean]> = [
    ['auto + no-preference', 'auto', false, false],
    ['auto + reduce', 'auto', true, true],
    ['on + no-preference', 'on', false, true],
    ['on + reduce', 'on', true, true],
    ['off + no-preference', 'off', false, false],
    ['off + reduce (setting wins)', 'off', true, false],
  ];

  it.each(cases)('%s', (_n, setting, osReduce, expected) => {
    mq(osReduce);
    applyReducedMotionSetting(setting);
    expect(prefersReducedMotion()).toBe(expected);
  });
});
