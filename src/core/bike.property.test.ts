import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  BIKE,
  createRun,
  generateCourse,
  minGapTime,
  rowsAreReachable,
  step,
  travelTime,
  type BikeInput,
} from './bike';

const RUNS = { numRuns: 10_000, seed: 60 };

describe('bike course properties (fast-check, 10 000 seeds, R-060-11)', () => {
  it('every seed has a reachable clear lane from every origin lane of the previous row', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0xffffffff }), (seed) => {
        const course = generateCourse(seed);
        expect(rowsAreReachable(course.rows)).toBe(true);
        expect(course.pickups.length).toBeLessThanOrEqual(BIKE.maxCoins);
        const ids = new Set(course.pickups.map((p) => p.id));
        expect(ids.size).toBe(course.pickups.length);
        for (let i = 1; i < course.rows.length; i++) {
          const dt = travelTime(course.rows[i - 1]!.z, course.rows[i]!.z);
          expect(dt).toBeGreaterThanOrEqual(minGapTime - 1e-12);
          expect(course.rows[i]!.free.length).toBeGreaterThanOrEqual(1);
        }
        return true;
      }),
      RUNS,
    );
  });

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
              inputs.length * BIKE.maxDt + 1e-9,
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
