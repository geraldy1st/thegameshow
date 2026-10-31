import { describe, expect, it } from 'vitest';
import { ROUTES, parseRoute } from './router';

describe('parseRoute (GS-V5-04)', () => {
  it('maps every known hash to its screen', () => {
    for (const r of ROUTES) expect(parseRoute(`#${r}`)).toBe(r);
  });
  it('sends an empty or unknown hash home', () => {
    for (const h of ['', '#', '#house', '#HOME', '#invest/1', '#<img>'])
      expect(parseRoute(h)).toBe('home');
  });
});
