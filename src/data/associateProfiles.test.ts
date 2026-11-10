import { describe, expect, it } from 'vitest';
import { ASSOCIATES } from './balance';
import { ASSOCIATE_PROFILES } from './associateProfiles';

describe('associate gender (catalogue, not persisted)', () => {
  it('marks Haru, Yuu, Daichi, Jun, Omar as m and Kei, Lila, Nana, Noa as f', () => {
    const male = ['haru', 'yuu', 'daichi', 'jun', 'omar'];
    const female = ['kei', 'lila', 'nana', 'noa'];
    expect(ASSOCIATES.map((a) => a.id).sort()).toEqual([...male, ...female].sort());
    for (const id of male) expect(ASSOCIATE_PROFILES[id as 'omar'].gender).toBe('m');
    for (const id of female) expect(ASSOCIATE_PROFILES[id as 'kei'].gender).toBe('f');
  });
});
