import { describe, expect, it } from 'vitest';
import { QUEST_IDS, QUESTS } from '../data/balance';
import { QUIZ } from '../data/quiz';
import { localDay } from './clock';
import { buy, click } from './economy';
import { pull } from './gacha';
import { settle } from './idle';
import {
  answerQuiz,
  canClaim,
  claimQuest,
  markSceneSeen,
  quizIndex,
  rollDay,
  unlockedScenes,
  visitFriend,
} from './quests';
import { createInitialState } from './state';
import type { GameState } from './types';

const T0 = new Date(2026, 9, 25, 12, 0, 0).getTime(); // local noon
const DAY = 86_400_000;
const fresh = () => createInitialState(T0, 11);

function completeAll(s: GameState): GameState {
  s = answerQuiz(s, 0);
  s = { ...s, yenCents: 10_000_000 };
  for (let i = 0; i < 3; i++) {
    const r = buy(s, 'save');
    if (r.ok) s = r.state;
  }
  s = visitFriend(s, 'ren').state;
  for (let i = 0; i < 100; i++) s = click(s);
  return s;
}

describe('daily quests (RES-6)', () => {
  it('every quest can be completed and claimed once: 7 tickets', () => {
    let s = completeAll(fresh());
    for (const q of QUEST_IDS) expect(canClaim(s, q)).toBe(true);
    const t = s.tickets;
    for (const q of QUEST_IDS) s = claimQuest(claimQuest(s, q), q); // double claim = idempotent
    expect(s.tickets - t).toBe(7);
  });
  it('an unfinished quest cannot be claimed', () => {
    const s = fresh();
    expect(claimQuest(s, 'click')).toBe(s);
  });
  it('the quiz is validated by answering, right or wrong, once per day', () => {
    const s = answerQuiz(fresh(), 3);
    expect(s.quests.progress.quiz).toBe(1);
    expect(answerQuiz(s, 0)).toBe(s);
  });
  it('the question of the day is deterministic', () => {
    expect(quizIndex('2026-10-25', 1)).toBe(quizIndex('2026-10-25', 1));
    const all = new Set(Array.from({ length: 60 }, (_, i) => quizIndex(localDay(T0 + i * DAY), 1)));
    expect(all.size).toBeGreaterThan(5);
    expect(Math.max(...all)).toBeLessThan(QUIZ.length);
  });
  it('a new day resets progress with no penalty, a skipped day loses nothing', () => {
    const s = claimQuest(completeAll(fresh()), 'click');
    const later = rollDay(s, T0 + 3 * DAY);
    expect(later.quests.day).toBe(localDay(T0 + 3 * DAY));
    expect(later.quests.claimed.click).toBe(false);
    expect(later.quests.quizChoice).toBeNull();
    expect(later.tickets).toBe(s.tickets);
    expect(later.friends.ren.affinity).toBe(s.friends.ren.affinity);
    expect(later.friends.ren.visitsToday).toBe(0);
  });
  it('the quest day never goes back (clock rolled back to yesterday)', () => {
    const s = claimQuest(completeAll(fresh()), 'click');
    const back = rollDay(s, T0 - DAY);
    expect(back).toBe(s);
    expect(canClaim(back, 'click')).toBe(false);
  });
  it('midnight during a session resets once', () => {
    let s = claimQuest(completeAll(fresh()), 'click');
    const midnight = new Date(2026, 9, 26, 0, 0, 1).getTime();
    s = rollDay(s, midnight);
    const again = rollDay(s, midnight + 1000);
    expect(again).toBe(s);
  });
});

describe('friends', () => {
  it('+5 affinity per visit, 3 counted per friend per day, every visit counts for the quest', () => {
    let s = fresh();
    for (let i = 0; i < 5; i++) s = visitFriend(s, 'mio').state;
    expect(s.friends.mio.affinity).toBe(15);
    expect(s.quests.progress.visit).toBe(QUESTS.visit.goal);
    s = rollDay(s, T0 + DAY);
    s = visitFriend(s, 'mio').state;
    expect(s.friends.mio.affinity).toBe(20);
  });
  it('affinity is capped at 100; only scene 1 exists (threshold 20)', () => {
    let s = fresh();
    expect(unlockedScenes(s, 'sora')).toEqual([]);
    for (let d = 0; d < 40; d++) {
      s = rollDay(s, T0 + d * DAY);
      for (let i = 0; i < 3; i++) s = visitFriend(s, 'sora').state;
    }
    expect(s.friends.sora.affinity).toBe(100);
    expect(unlockedScenes(s, 'sora')).toEqual([1]);
    s = markSceneSeen(s, 'sora', 1);
    expect(markSceneSeen(s, 'sora', 2)).toBe(s);
    expect(s.friends.sora.scenesSeen).toEqual([1]);
  });
});

describe('30-day economy simulation (GS-CA16)', () => {
  it('no blocking, tickets <= 3 + 7 x days, no negative value, a 3-star within reach', () => {
    let s = fresh();
    let now: number;
    let earned = 0;
    let firstThree: number | null = null;
    for (let day = 0; day < 30; day++) {
      now = T0 + day * DAY;
      s = settle(rollDay(s, now), now).state;
      s = answerQuiz(s, day % 4);
      for (let i = 0; i < 150; i++) s = click(s);
      for (const id of ['save', 'stock', 'estate', 'save'] as const) {
        const r = buy(s, id);
        if (r.ok) s = r.state;
      }
      s = visitFriend(s, (['ren', 'mio', 'sora'] as const)[day % 3]!).state;
      for (const q of QUEST_IDS) {
        const before = s.tickets;
        s = claimQuest(s, q);
        earned += s.tickets - before;
      }
      while (s.tickets > 0) {
        const r = pull(s);
        if (!r.ok) break;
        s = r.state;
        if (firstThree === null && r.last.id.match(/jun|omar/)) firstThree = r.last.pull;
      }
      // An hour of play then away until the next day (8 h cap).
      now += 3_600_000;
      s = settle(s, now).state;
      for (const v of [s.yenCents, s.tickets, s.gacha.pity, s.totalClicks])
        expect(Number.isInteger(v) && v >= 0).toBe(true);
    }
    expect(earned).toBeLessThanOrEqual(7 * 30);
    expect(s.gacha.pulls).toBeLessThanOrEqual(3 + 7 * 30);
    expect(s.gacha.pulls).toBeGreaterThan(100); // the daily loop is never blocked
    expect(firstThree).not.toBeNull();
    expect(firstThree!).toBeLessThanOrEqual(50);
  });
});
