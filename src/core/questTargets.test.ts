import { describe, expect, it } from 'vitest';
import { QUESTS, QUEST_IDS, type QuestId } from '../data/balance';
import { createInitialState } from './state';
import { QUEST_TARGET, pendingQuests, pendingQuestsFor, questPending } from './questTargets';
import type { GameState } from './types';

/** R-P42-7: exhaustive truth table over the 5 quests (2^5 progress states). */
function withDone(done: ReadonlySet<QuestId>): GameState {
  const g = createInitialState(Date.UTC(2026, 10, 1), 7);
  const progress = { ...g.quests.progress };
  for (const id of QUEST_IDS) progress[id] = done.has(id) ? QUESTS[id].goal : 0;
  return { ...g, quests: { ...g.quests, progress } };
}

describe('pendingQuestsFor (patch 0.4.2, point 2)', () => {
  it('destinations (H1)', () => {
    expect(QUEST_TARGET).toEqual({
      quiz: { kind: 'quiz' },
      save: { kind: 'screen', route: 'invest' },
      invest: { kind: 'screen', route: 'invest' },
      visit: { kind: 'screen', route: 'friends' },
      click: { kind: 'screen', route: 'work' },
    });
  });
  for (let mask = 0; mask < 1 << QUEST_IDS.length; mask++) {
    const done = new Set(QUEST_IDS.filter((_, i) => mask & (1 << i)));
    it(`done = {${[...done].join(',')}}`, () => {
      const g = withDone(done);
      const todo = (id: QuestId) => !done.has(id);
      expect(pendingQuests(g)).toEqual(QUEST_IDS.filter(todo));
      expect(pendingQuestsFor('invest', g).length > 0).toBe(todo('save') || todo('invest'));
      expect(pendingQuestsFor('friends', g).length > 0).toBe(todo('visit'));
      expect(pendingQuestsFor('work', g).length > 0).toBe(todo('click'));
    });
  }
  it('H3: finished but unclaimed is not « à faire »; one short of the goal is', () => {
    const g = withDone(new Set());
    const near = { ...g, quests: { ...g.quests, progress: { ...g.quests.progress, click: 99 } } };
    expect(questPending(near, 'click')).toBe(true);
    const full = { ...g, quests: { ...g.quests, progress: { ...g.quests.progress, click: 100 } } };
    expect(questPending(full, 'click')).toBe(false);
    expect(full.quests.claimed.click).toBe(false);
  });
});
