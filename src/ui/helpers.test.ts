import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { markRevealSeen, revealPending } from './helpers';

describe('reveal marker (DEF-GS-11)', () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  const save = { createdAt: 1000 };
  it('a never-seen last draw is pending', () => {
    expect(revealPending(save, { pull: 3 })).toBe(true);
  });
  it('a seen draw of the same save is not pending', () => {
    markRevealSeen(save, 3);
    expect(revealPending(save, { pull: 3 })).toBe(false);
  });
  it('a marker from another save (same pull number) does not hide the reveal', () => {
    markRevealSeen({ createdAt: 2000 }, 3);
    expect(revealPending(save, { pull: 3 })).toBe(true);
  });
  it('a lot 2 numeric marker counts as seen and is rewritten', () => {
    store.set('tgs-reveal-seen', '3');
    expect(revealPending(save, { pull: 3 })).toBe(false);
    expect(store.get('tgs-reveal-seen')).toBe('1000:3');
  });
  it('no save or no draw is never pending', () => {
    expect(revealPending(null, { pull: 1 })).toBe(false);
    expect(revealPending(save, null)).toBe(false);
  });
});
