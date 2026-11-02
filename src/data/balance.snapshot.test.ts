import { expect, it } from 'vitest';
import { BALANCE, OFFLINE_CAP_MS, STAT_IDS, xpNeed } from './balance';

// R15: the single snapshot of the values Geraldy validated "for now" (G-2, G-5 to G-7).
// Changing a value is a balancing decision: update this snapshot in the same commit.
it('freezes the validated v5 balance values', () => {
  expect({ BALANCE, OFFLINE_CAP_MS, stats: STAT_IDS, xp1: xpNeed(1) }).toMatchInlineSnapshot(`
    {
      "BALANCE": {
        "boost": {
          "durationMs": 5000,
          "hiddenTab": "lost",
          "maxGapMs": 60000,
          "minGapMs": 40000,
          "mult": 2,
          "periodMs": 2600,
          "reducedCursor": 0.5,
          "visibleMs": 12000,
          "zone": [
            0.35,
            0.65,
          ],
        },
        "energy": {
          "initial": 50,
          "max": 50,
          "perSecond": 1,
        },
        "fx": {
          "announceEveryMs": 5000,
          "floatMs": 1300,
          "poolSize": 30,
          "reducedMs": 1200,
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
        "work": {
          "creativityPerConversion": 1,
          "energyPerTap": 1,
          "joyMs": 4000,
          "maxTapsPerSecond": 15,
          "milestonePoints": 100,
          "noEnergyMessageMs": 5000,
          "pointsPerConversion": 100,
          "thinkBelowRatio": 0.2,
          "xpPerTap": 1,
          "yenPerConversion": 10,
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
