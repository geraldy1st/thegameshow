import { expect, it } from 'vitest';
import { BALANCE, OFFLINE_CAP_MS, STAT_IDS, xpNeed } from './balance';

// R15: the single snapshot of the values Geraldy validated "for now" (G-2, G-5 to G-7).
// Changing a value is a balancing decision: update this snapshot in the same commit.
it('freezes the validated v5 balance values', () => {
  expect({ BALANCE, OFFLINE_CAP_MS, stats: STAT_IDS, xp1: xpNeed(1) }).toMatchInlineSnapshot(`
    {
      "BALANCE": {
        "boost": {
          "hiddenTab": "lost",
        },
        "energy": {
          "initial": 50,
          "max": 50,
          "perSecond": 1,
        },
        "initialStats": 0,
        "metro": {
          "maxYenPerDay": 1000,
          "paidRunsPerDay": 5,
        },
        "profile": {
          "initialLevel": 1,
          "initialOutfit": "jean",
          "initialXp": 0,
        },
        "quiz": {
          "midnightRule": "end-day",
        },
      },
      "OFFLINE_CAP_MS": 28800000,
      "stats": [
        "bonheur",
        "social",
        "intel",
        "chance",
        "sante",
        "disc",
        "nego",
        "charisme",
        "crea",
        "repu",
      ],
      "xp1": 30,
    }
  `);
});
