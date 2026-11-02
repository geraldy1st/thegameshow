import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pullMany } from '../../core/gacha';
import { createInitialState } from '../../core/state';
import { TEN_KEY, readTenMarker, writeTenMarker } from './tenMarker';

const T0 = new Date(2026, 10, 2, 12, 0, 0).getTime();
function drawn() {
  const g = { ...createInitialState(T0, 9), tickets: 10 };
  const r = pullMany(g, 10);
  if (!r.ok) throw new Error('refused');
  return r;
}

describe('×10 marker (R-P43-3)', () => {
  let store: Map<string, string>;
  let setItem: (k: string, v: string) => void;
  beforeEach(() => {
    store = new Map();
    setItem = (k, v) => void store.set(k, v);
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => setItem(k, v),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('valid marker: the ten results come back', () => {
    const { state, results } = drawn();
    writeTenMarker(state, results);
    expect(readTenMarker(state)).toEqual(results);
  });

  it.each([
    [
      'falsified id',
      (r: ReturnType<typeof drawn>['results']) =>
        r.map((x, i) => (i === 9 ? { ...x, id: 'zzz' } : x)),
    ],
    [
      'falsified stars',
      (r: ReturnType<typeof drawn>['results']) =>
        r.map((x, i) => (i === 9 ? { ...x, stars: 5 } : x)),
    ],
    [
      'falsified forced',
      (r: ReturnType<typeof drawn>['results']) =>
        r.map((x, i) => (i === 9 ? { ...x, forced: !x.forced } : x)),
    ],
    ['truncated', (r: ReturnType<typeof drawn>['results']) => r.slice(1)],
    [
      'gap in pull numbers',
      (r: ReturnType<typeof drawn>['results']) =>
        r.map((x, i) => (i === 3 ? { ...x, pull: 99 } : x)),
    ],
    [
      'shifted (not ending at last)',
      (r: ReturnType<typeof drawn>['results']) => r.map((x) => ({ ...x, pull: x.pull - 1 })),
    ],
  ])('%s: refused, fallback to the last draw', (_l, mutate) => {
    const { state, results } = drawn();
    writeTenMarker(state, mutate(results) as typeof results);
    expect(readTenMarker(state)).toBeNull();
  });

  it('invalid JSON, other game (createdAt), no last draw: refused', () => {
    const { state, results } = drawn();
    localStorage.setItem(TEN_KEY, '{not json');
    expect(readTenMarker(state)).toBeNull();
    writeTenMarker({ createdAt: state.createdAt + 1 }, results);
    expect(readTenMarker(state)).toBeNull();
    writeTenMarker(state, results);
    expect(readTenMarker({ ...state, gacha: { ...state.gacha, last: null } })).toBeNull();
  });

  it('a later single draw invalidates the marker', () => {
    const { state, results } = drawn();
    writeTenMarker(state, results);
    const later = { ...state, gacha: { ...state.gacha, last: { ...results[9]!, pull: 11 } } };
    expect(readTenMarker(later)).toBeNull();
  });

  it('setItem throwing is tolerated', () => {
    const { state, results } = drawn();
    setItem = () => {
      throw new DOMException('full', 'QuotaExceededError');
    };
    expect(() => writeTenMarker(state, results)).not.toThrow();
    expect(readTenMarker(state)).toBeNull();
  });
});
