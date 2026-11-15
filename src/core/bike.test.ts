import { describe, expect, it } from 'vitest';
import {
  BIKE,
  createRun,
  generateCourse,
  minGapTime,
  pause,
  resume,
  rowsAreReachable,
  speedAt,
  speedKmh,
  step,
  timeToZ,
  travelTime,
  type BikeInput,
  type BikeRun,
} from './bike';

const idle: BikeInput = { left: false, right: false };

const drive = (
  run: BikeRun,
  seconds: number,
  input: BikeInput = idle,
  dt = BIKE.maxDt,
): BikeRun => {
  let r = run;
  let left = seconds;
  while (left > 0 && r.phase === 'running') {
    const slice = Math.min(dt, left);
    r = step(r, slice, input);
    left -= slice;
  }
  return r;
};

describe('bike kinematics', () => {
  it('covers 160 m in about 20.68 s and never reaches vmax on the track', () => {
    const t = timeToZ(BIKE.lengthM);
    expect(t).toBeCloseTo(20.6789, 3);
    expect(speedAt(t)).toBeLessThan(BIKE.vmax);
    expect(speedKmh(speedAt(0))).toBeCloseTo(23.76, 2);
    expect(Math.round(speedKmh(speedAt(t)))).toBe(32);
  });

  it('clamps dt at 50 ms so a 100 ms frame does not jump or tunnel', () => {
    const a = createRun(1, 'run-a');
    const one = step(a, 0.1, idle);
    const two = step(a, BIKE.maxDt, idle);
    expect(one.t).toBeCloseTo(BIKE.maxDt, 10);
    expect(one.z).toBeCloseTo(two.z, 10);
    expect(one.z).toBeCloseTo(speedAt(0) * BIKE.maxDt, 10);
  });
});

describe('bike course generation', () => {
  it('always has a reachable clear lane and at most 20 unique coins', () => {
    for (const seed of [1, 2, 77, 1008, 42_424]) {
      const course = generateCourse(seed);
      expect(course.rows.length).toBeGreaterThan(3);
      expect(rowsAreReachable(course.rows)).toBe(true);
      expect(course.pickups.length).toBeLessThanOrEqual(BIKE.maxCoins);
      const ids = new Set(course.pickups.map((p) => p.id));
      expect(ids.size).toBe(course.pickups.length);
      for (const row of course.rows) {
        expect(row.occupied.length).toBeGreaterThanOrEqual(1);
        expect(row.occupied.length).toBeLessThanOrEqual(2);
        expect(row.free.length).toBe(BIKE.lanes - row.occupied.length);
        if (row.index < 3) expect(row.occupied.length).toBe(1);
      }
      for (let i = 1; i < course.rows.length; i++) {
        expect(travelTime(course.rows[i - 1]!.z, course.rows[i]!.z)).toBeGreaterThanOrEqual(
          minGapTime - 1e-12,
        );
      }
    }
  });

  it('is deterministic: the same seed yields the same course and the same trace', () => {
    const a = createRun(1008, 'a');
    const b = createRun(1008, 'b');
    expect(a.rows).toEqual(b.rows);
    expect(a.obstacles).toEqual(b.obstacles);
    expect(a.pickups).toEqual(b.pickups);
    const input: BikeInput = { left: true, right: false };
    let ra = a;
    let rb = b;
    for (let i = 0; i < 200; i++) {
      const steer: BikeInput = i % 7 === 0 ? input : idle;
      ra = step(ra, BIKE.maxDt, steer);
      rb = step(rb, BIKE.maxDt, steer);
    }
    expect({ ...ra, runId: '' }).toEqual({ ...rb, runId: '' });
  });
});

describe('bike step: lives, coins, pause', () => {
  it('counts a collision once and does not recount during invulnerability', () => {
    let before: BikeRun | null = null;
    let hit: BikeRun | null = null;
    for (let seed = 1; seed < 400 && !hit; seed++) {
      let r = createRun(seed, 'hit');
      for (let i = 0; i < 8 / BIKE.maxDt; i++) {
        const n = step(r, BIKE.maxDt, idle);
        if (n.lives < r.lives) {
          before = r;
          hit = n;
          break;
        }
        r = n;
      }
    }
    expect(hit).not.toBeNull();
    if (!hit || !before) return;
    expect(hit.lives).toBe(before.lives - 1);
    expect(hit.invuln).toBe(BIKE.invuln);
    expect(hit.obstacles.filter((o) => o.hit).length).toBe(
      before.obstacles.filter((o) => o.hit).length + 1,
    );
    const during = drive(hit, BIKE.invuln - BIKE.maxDt);
    expect(during.lives).toBe(hit.lives);
    expect(during.obstacles.filter((o) => o.hit).length).toBe(
      hit.obstacles.filter((o) => o.hit).length,
    );
  });

  it('collects each coin at most once and never more than 20', () => {
    let best: BikeRun | null = null;
    for (let seed = 1; seed <= 80; seed++) {
      const r = drive(createRun(seed, 'c'), 25);
      if (!best || r.coins > best.coins) best = r;
    }
    expect(best).not.toBeNull();
    if (!best) return;
    expect(best.coins).toBeLessThanOrEqual(BIKE.maxCoins);
    expect(best.pickups.filter((p) => p.collected).length).toBe(best.coins);
  });

  it('reaches success at 160 m when the player lasts, and fail at 0 lives', () => {
    const finished = drive(createRun(1, 'fin'), 30);
    expect(['success', 'fail']).toContain(finished.phase);
    if (finished.phase === 'success') {
      expect(finished.z).toBe(BIKE.lengthM);
      expect(finished.lives).toBeGreaterThan(0);
    }
    if (finished.phase === 'fail') expect(finished.lives).toBe(0);
  });

  it('pause freezes motion; resume does not catch up the paused duration', () => {
    const mid = drive(createRun(3, 'p'), 2);
    const halted = pause(mid);
    const later = drive({ ...halted, phase: 'running' }, 2); // would move if not paused
    expect(pause(mid).phase).toBe('paused');
    expect(step(halted, 1, idle)).toEqual(halted);
    const back = resume(halted);
    expect(back.phase).toBe('running');
    expect(back.z).toBe(mid.z);
    const after = step(back, BIKE.maxDt, idle);
    expect(after.z).toBeGreaterThan(mid.z);
    expect(after.z).toBeLessThan(later.z);
  });

  it('steers one lane at a time and ignores a change already in progress', () => {
    const start = createRun(4, 'steer');
    const left = step(start, BIKE.maxDt, { left: true, right: false });
    expect(left.lane).toBe(0);
    expect(left.laneT).toBeLessThan(BIKE.laneTime);
    const again = step(left, BIKE.maxDt, { left: true, right: false });
    expect(again.lane).toBe(0);
    const hold = drive(left, BIKE.laneTime, { left: true, right: false });
    expect(hold.lane).toBe(0);
  });
});
