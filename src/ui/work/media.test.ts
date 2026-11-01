import { describe, expect, it } from 'vitest';
import { shouldUseStill, type MediaEnv } from './media';

describe('useStill decision table (§6, GS-V5-52)', () => {
  const cases: Array<[string, MediaEnv, boolean]> = [
    ['nothing', { systemReduced: false, setting: 'auto', connection: {} }, false],
    ['system reduced', { systemReduced: true, setting: 'auto', connection: {} }, true],
    ['setting on', { systemReduced: false, setting: 'on', connection: {} }, true],
    ['setting off beats system', { systemReduced: true, setting: 'off', connection: {} }, false],
    ['save-data', { systemReduced: false, setting: 'auto', connection: { saveData: true } }, true],
    ['3g', { systemReduced: false, setting: 'auto', connection: { effectiveType: '3g' } }, true],
    ['4g', { systemReduced: false, setting: 'auto', connection: { effectiveType: '4g' } }, false],
    ['Safari, setting auto', { systemReduced: false, setting: 'auto' }, false],
    ['Safari, setting on', { systemReduced: false, setting: 'on' }, true],
  ];
  it.each(cases)('%s', (_n, env, still) => expect(shouldUseStill(env)).toBe(still));
});
