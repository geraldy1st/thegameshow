import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  BIKE,
  courseIsReachable,
  createRun,
  generateCourse,
  step,
  type BikeInput,
  type BikeRun,
} from './bike';

const RUNS = { numRuns: 10_000, seed: 60 };
const idle: BikeInput = { left: false, right: false };
const STEERS: readonly BikeInput[] = [
  idle,
  { left: true, right: false },
  { left: false, right: true },
];

/** Hit-free path to 160 m, independent of the generator (R-I1-01 simulation oracle). */
function hasHitFreePath(seed: number, dt = 0.05): boolean {
  const start = createRun(seed, 'oracle');
  const lives0 = start.lives;
  const seen = new Set<string>();
  const queue: BikeRun[] = [start];
  const keyOf = (r: BikeRun): string => {
    const lt = r.laneT >= BIKE.laneTime ? 's' : r.laneT.toFixed(4);
    return `${r.t.toFixed(4)}|${r.lane}|${r.laneFrom}|${lt}|${r.lives}`;
  };
  seen.add(keyOf(start));
  let qi = 0;
  while (qi < queue.length) {
    const r = queue[qi]!;
    qi += 1;
    if (r.phase === 'success') return true;
    if (r.phase !== 'running') continue;
    for (const input of STEERS) {
      const n = step(r, dt, input);
      if (n.lives < lives0) continue;
      const k = keyOf(n);
      if (seen.has(k)) continue;
      seen.add(k);
      queue.push(n);
    }
  }
  return false;
}

describe('bike course properties (fast-check, 10 000 seeds, R-I1-01)', () => {
  it('every seed is reachable by the depth-aware analytical oracle (kills B13)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0xffffffff }), (seed) => {
        const course = generateCourse(seed);
        expect(courseIsReachable(course)).toBe(true);
        expect(course.pickups.length).toBeLessThanOrEqual(BIKE.maxCoins);
        const ids = new Set(course.pickups.map((p) => p.id));
        expect(ids.size).toBe(course.pickups.length);
        for (const row of course.rows) {
          expect(row.free.length).toBeGreaterThanOrEqual(1);
        }
        return true;
      }),
      RUNS,
    );
  });

  it('at least 1 000 seeds have a hit-free path under the real step (simulation oracle)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0xffffffff }), (seed) => {
        expect(hasHitFreePath(seed)).toBe(true);
        return true;
      }),
      { numRuns: 1_000, seed: 62 },
    );
  }, 120_000);

  it('the same seed and input trace is deterministic and dt is capped', () => {
    const steer = fc.record({
      left: fc.boolean(),
      right: fc.boolean(),
    }) as fc.Arbitrary<BikeInput>;
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 0xffffffff }),
        fc.array(steer, { minLength: 20, maxLength: 80 }),
        fc.float({ min: Math.fround(0), max: Math.fround(0.2), noNaN: true }),
        (seed, inputs, rawDt) => {
          let a = createRun(seed, 'a');
          let b = createRun(seed, 'b');
          expect(a.obstacles).toEqual(b.obstacles);
          for (const input of inputs) {
            a = step(a, rawDt, input);
            b = step(b, rawDt, input);
            expect(a.t - (a.phase === 'running' ? 0 : 0)).toBeLessThanOrEqual(
              inputs.length * 0.05 + 1e-9,
            );
          }
          expect({ ...a, runId: '' }).toEqual({ ...b, runId: '' });
          return true;
        },
      ),
      { numRuns: 200, seed: 61 },
    );
  });
});
