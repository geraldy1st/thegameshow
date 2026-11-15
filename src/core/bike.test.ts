import { describe, expect, it } from 'vitest';
import {
  BIKE,
  courseIsReachable,
  ORACLE_REACTION_MARGIN,
  courseClearPath,
  createRun,
  generateCourse,
  laneX,
  minGapTime,
  nextRowZ,
  pause,
  resume,
  speedAt,
  speedKmh,
  step,
  timeToZ,
  travelTime,
  type BikeInput,
  type BikeObstacle,
  type BikePickup,
  type BikeRun,
  type Lane,
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
    // Literal 0.05 s (B02): must not read BIKE.maxDt, or a 50→100 ms mutant stays green.
    expect(one.t).toBeCloseTo(0.05, 10);
    expect(one.z).toBeCloseTo(two.z, 10);
    expect(one.z).toBeCloseTo(speedAt(0) * 0.05, 10);
    expect(step(a, 0.05, idle).z).toBeCloseTo(one.z, 10);
  });
});

describe('bike course generation', () => {
  it('always has a reachable clear lane and at most 20 unique coins', () => {
    for (const seed of [1, 2, 77, 1008, 42_424]) {
      const course = generateCourse(seed);
      expect(course.rows.length).toBeGreaterThan(3);
      expect(courseIsReachable(course)).toBe(true);
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

  it('the third life loss fails the run immediately (B20)', () => {
    const dt = 0.05;
    const z0 = 10;
    const t0 = timeToZ(z0);
    const r = bare({
      z: z0,
      t: t0,
      lives: 1,
      invuln: 0,
      obstacles: [obst(1, z0 + 0.1, 3.4)],
    });
    const n = step(r, dt, idle);
    expect(n.lives).toBe(0);
    expect(n.phase).toBe('fail');
  });

  it('ignores a new steer while a lane change is already in progress (B25)', () => {
    const start = bare();
    const right = step(start, BIKE.maxDt, { left: false, right: true });
    expect(right.lane).toBe(2);
    expect(right.laneFrom).toBe(1);
    expect(right.laneT).toBeLessThan(BIKE.laneTime);
    const mid = step(right, BIKE.maxDt, { left: true, right: false });
    expect(mid.lane).toBe(2);
    expect(mid.laneFrom).toBe(1);
    expect(mid.laneT).toBeGreaterThan(right.laneT);
  });

  it('pause has no effect outside the running phase (B29)', () => {
    for (const phase of ['success', 'fail', 'paused'] as const) {
      const r = bare({ phase, lives: phase === 'fail' ? 0 : BIKE.lives });
      expect(pause(r)).toEqual(r);
      expect(pause(r).phase).toBe(phase);
    }
  });
});

const bare = (overrides: Partial<BikeRun> = {}): BikeRun => ({
  runId: 't',
  seed: 0,
  phase: 'running',
  t: 0,
  z: 0,
  x: laneX(1),
  lane: 1,
  laneFrom: 1,
  laneT: BIKE.laneTime,
  lives: BIKE.lives,
  invuln: 0,
  coins: 0,
  rows: [],
  obstacles: [],
  pickups: [],
  ...overrides,
});

const obst = (
  lane: Lane,
  z: number,
  depth: number = BIKE.depths.voiture,
  kind: BikeObstacle['kind'] = 'voiture',
): BikeObstacle => ({ id: 0, row: 0, lane, z, depth, kind, hit: false });

describe('bike step: clamps, collisions, coins, resume (R-I1 / DEF-GS-49)', () => {
  it('treats a non-finite dt as 0 so the run can still end (DEF-GS-49)', () => {
    const a = createRun(1, 'nan');
    for (const dt of [NaN, Infinity, -Infinity]) {
      const s = step(a, dt, idle);
      expect(Number.isFinite(s.t)).toBe(true);
      expect(Number.isFinite(s.z)).toBe(true);
      expect(s.t).toBe(0);
      expect(s.z).toBe(0);
      expect(s.phase).toBe('running');
    }
    // A later finite step still advances, so the run is not stuck.
    const later = step(step(a, NaN, idle), 0.05, idle);
    expect(later.t).toBeCloseTo(0.05, 10);
    expect(later.z).toBeGreaterThan(0);
  });

  it('reaches success on the exact 160 m step, not only past it (B21)', () => {
    const z0 = 159.9;
    const t = timeToZ(z0);
    const need = (BIKE.lengthM - z0) / speedAt(t);
    expect(need).toBeGreaterThan(0);
    expect(need).toBeLessThan(0.05);
    const done = step(bare({ z: z0, t }), need, idle);
    expect(done.phase).toBe('success');
    expect(done.z).toBe(160);
  });

  it('does not count a hit when the swept interval only touches the obstacle edge (B04)', () => {
    const z0 = 10;
    const t = timeToZ(z0);
    const dt = 0.05;
    const z1 = z0 + speedAt(t) * dt;
    // b === c: max(z0,z1)+halfDepth equals obst.z (open interval, no hit).
    const front = bare({
      z: z0,
      t,
      obstacles: [obst(1, z1 + BIKE.halfDepth, 3.4)],
    });
    expect(step(front, dt, idle).lives).toBe(BIKE.lives);
    // a === d: min(z0,z1)−halfDepth equals obst.z+depth.
    const rear = bare({
      z: z0,
      t,
      obstacles: [obst(1, z0 - BIKE.halfDepth - 3.4, 3.4)],
    });
    expect(step(rear, dt, idle).lives).toBe(BIKE.lives);
  });

  it('counts a hit on the exact lane band edge (B09)', () => {
    const dt = 0.05;
    const edge = BIKE.laneW * BIKE.laneHit;
    const u = edge / BIKE.laneW;
    const laneT1 = u * BIKE.laneTime;
    const laneT0 = laneT1 - dt;
    const r = bare({
      z: 10,
      t: timeToZ(10),
      lane: 2,
      laneFrom: 1,
      laneT: laneT0,
      obstacles: [obst(1, 9, 4)],
    });
    const s = step(r, dt, idle);
    expect(s.x).toBeCloseTo(laneX(1) + edge, 10);
    expect(s.lives).toBe(BIKE.lives - 1);
  });

  it('does not collect a coin farther than 0.55 m in z (B26)', () => {
    const z0 = 10;
    const t = timeToZ(z0);
    const dt = 0.05;
    const z1 = z0 + speedAt(t) * dt;
    const far: BikePickup = { id: 0, lane: 1, z: z1 + 1.0, collected: false };
    const missed = step(bare({ z: z0, t, pickups: [far] }), dt, idle);
    expect(missed.coins).toBe(0);
    expect(missed.pickups[0]!.collected).toBe(false);
    // Inside the 0.55 m window (exact 0.55 is too close to float error).
    const close: BikePickup = { id: 0, lane: 1, z: z1 + 0.5, collected: false };
    const got = step(bare({ z: z0, t, pickups: [close] }), dt, idle);
    expect(got.coins).toBe(1);
  });

  it('places every coin on a clear lane, never inside an obstacle (B27)', () => {
    for (let seed = 0; seed < 400; seed++) {
      const course = generateCourse(seed);
      expect(course.pickups.length).toBe(BIKE.maxCoins);
      for (const p of course.pickups) {
        for (const o of course.obstacles) {
          if (o.lane !== p.lane) continue;
          expect(p.z < o.z || p.z > o.z + o.depth).toBe(true);
        }
        // Approach, mid-gap, row.z-2, or filler on the clear path in the
        // approach to a row — never inside an obstacle (already checked).
        const onClearApproach = course.rows.some((row, i) => {
          const prevZ = i === 0 ? 0 : course.rows[i - 1]!.z;
          return row.free.includes(p.lane) && p.z > prevZ && p.z < row.z;
        });
        expect(onClearApproach).toBe(true);
      }
    }
  });

  it('resuming mid lane-change continues from the saved progress (R-I1-04, no 1.36 m snap)', () => {
    const start = createRun(4, 'steer');
    const mid = step(start, 0.05, { left: true, right: false });
    expect(mid.laneT).toBeCloseTo(0.05, 10);
    expect(mid.laneT).toBeLessThan(BIKE.laneTime);
    const halted = pause(mid);
    const back = resume(halted);
    expect(back.phase).toBe('running');
    expect(back.x).toBe(mid.x);
    expect(back.laneT).toBe(mid.laneT);
    expect(back.lane).toBe(mid.lane);
    expect(back.laneFrom).toBe(mid.laneFrom);
    const after = step(back, 0.05, idle);
    const continued = step(mid, 0.05, idle);
    expect(after.x).toBeCloseTo(continued.x, 10);
    // The old snap (laneT = laneTime on resume) teleports ~1.36 m on the next step.
    expect(Math.abs(after.x - laneX(mid.lane))).toBeGreaterThan(1);
  });
});

describe('bike reachability oracle (R-I1-01, depth-aware)', () => {
  it('accepts generated courses and rejects a halved-gap mutant (B13)', () => {
    for (const seed of [1, 2, 77, 1008, 42_424, 147938870]) {
      expect(courseIsReachable(generateCourse(seed))).toBe(true);
    }
    // Tight two-row course: front-to-front is still >= minGapTime (0.70 s), but after
    // a voiture depth a two-lane change cannot clear ORACLE_REACTION_MARGIN (B13 class).
    const z0 = 26;
    const t1 = timeToZ(z0) + minGapTime;
    const z1 = BIKE.v0 * t1 + 0.5 * BIKE.accel * t1 * t1;
    expect(travelTime(z0, z1)).toBeGreaterThanOrEqual(minGapTime - 1e-12);
    const tight = {
      rows: [
        { index: 0, z: z0, occupied: [0, 1] as Lane[], free: [2] as Lane[] },
        { index: 1, z: z1, occupied: [1, 2] as Lane[], free: [0] as Lane[] },
      ],
      obstacles: [
        obst(0, z0, BIKE.depths.voiture),
        { ...obst(1, z0, BIKE.depths.voiture), id: 1 },
        { ...obst(1, z1, BIKE.depths.voiture), id: 2, row: 1 },
        { ...obst(2, z1, BIKE.depths.voiture), id: 3, row: 1 },
      ],
      pickups: [],
    };
    expect(courseIsReachable(tight)).toBe(false);
  });

  it('rejects a two-lane gap with 0.05 s slack, below the 0.12 s floor (N05)', () => {
    // available = 2 × laneTime + 0.05 s. Margin 0.12 → need 0.55 (rejected).
    // Margin 0 (N05) → need 0.50 (accepted). The generator's tightest slack
    // (0.1226 s) is already above the floor, so this mid-band course is what
    // gives the oracle real slack to fail N05.
    expect(ORACLE_REACTION_MARGIN).toBe(0.12);
    const z0 = 26;
    const slack = 0.05;
    const destNeed = 2 * BIKE.laneTime + slack;
    const exitZ = z0 + BIKE.depths.voiture + BIKE.halfDepth;
    let lo = exitZ;
    let hi = exitZ + 30;
    for (let i = 0; i < 60; i++) {
      const midZ = (lo + hi) / 2;
      if (travelTime(exitZ, midZ) < destNeed) lo = midZ;
      else hi = midZ;
    }
    const entryZ = (lo + hi) / 2;
    const z1 = entryZ + BIKE.halfDepth;
    const mid = {
      rows: [
        { index: 0, z: z0, occupied: [0, 1] as Lane[], free: [2] as Lane[] },
        { index: 1, z: z1, occupied: [1, 2] as Lane[], free: [0] as Lane[] },
      ],
      obstacles: [
        obst(0, z0, BIKE.depths.voiture),
        { ...obst(1, z0, BIKE.depths.voiture), id: 1 },
        { ...obst(1, z1, BIKE.depths.voiture), id: 2, row: 1 },
        { ...obst(2, z1, BIKE.depths.voiture), id: 3, row: 1 },
      ],
      pickups: [],
    };
    expect(travelTime(exitZ, z1 - BIKE.halfDepth)).toBeLessThan(
      2 * BIKE.laneTime + ORACLE_REACTION_MARGIN,
    );
    expect(travelTime(exitZ, z1 - BIKE.halfDepth)).toBeGreaterThan(2 * BIKE.laneTime);
    expect(courseIsReachable(mid)).toBe(false);
  });
});

describe('historical I1 survivors (Crypto 50da75b)', () => {
  it('does not recount an already-hit obstacle after invulnerability ends (B05)', () => {
    const z0 = 10;
    const hit = step(
      bare({ z: z0, t: timeToZ(z0), obstacles: [obst(1, z0 + 0.05, 20)] }),
      0.05,
      idle,
    );
    expect(hit.lives).toBe(BIKE.lives - 1);
    expect(hit.obstacles[0]!.hit).toBe(true);
    const after = drive(hit, BIKE.invuln + 0.1);
    expect(after.lives).toBe(hit.lives);
    expect(after.z).toBeLessThan(z0 + 0.05 + 20);
    expect(after.obstacles[0]!.hit).toBe(true);
  });

  it('ignores a second obstacle while invulnerable (B07)', () => {
    const z0 = 10;
    const first = obst(1, z0 + 0.05, 1);
    const second: BikeObstacle = { ...obst(1, z0 + 2, 3), id: 1 };
    const hit = step(bare({ z: z0, t: timeToZ(z0), obstacles: [first, second] }), 0.05, idle);
    expect(hit.lives).toBe(BIKE.lives - 1);
    expect(hit.invuln).toBe(BIKE.invuln);
    expect(hit.obstacles.filter((o) => o.hit).map((o) => o.id)).toEqual([0]);
    const during = drive(hit, BIKE.invuln - 0.05);
    expect(during.invuln).toBeGreaterThan(0);
    expect(during.z).toBeGreaterThan(second.z);
    expect(during.lives).toBe(hit.lives);
    expect(during.obstacles.filter((o) => o.hit).map((o) => o.id)).toEqual([0]);
  });

  it('counts at most one collision per step (B08)', () => {
    const z0 = 10;
    const a = obst(1, z0 + 0.05, 3.4);
    const b: BikeObstacle = { ...obst(1, z0 + 0.1, 3.4), id: 1 };
    const n = step(bare({ z: z0, t: timeToZ(z0), obstacles: [a, b] }), 0.05, idle);
    expect(n.lives).toBe(BIKE.lives - 1);
    expect(n.obstacles.filter((o) => o.hit)).toHaveLength(1);
    expect(n.invuln).toBe(BIKE.invuln);
  });

  it('nextRowZ uses minGapTime when gapT is smaller (B11)', () => {
    const z = BIKE.firstRowM;
    expect(travelTime(z, nextRowZ(z, 0.01))).toBeCloseTo(minGapTime, 10);
    expect(travelTime(z, nextRowZ(z, 1.45))).toBeCloseTo(1.45, 10);
  });

  it('minGapTime is two lane changes plus the reaction margin (B12)', () => {
    expect(minGapTime).toBe(2 * BIKE.laneTime + BIKE.reactionMargin);
    expect(minGapTime).toBeCloseTo(0.7, 10);
  });

  it('stops collecting at 20 coins even if more pickups overlap (B17)', () => {
    const z0 = 10;
    const pickups: BikePickup[] = Array.from({ length: 21 }, (_, i) => ({
      id: i,
      lane: 1,
      z: z0,
      collected: false,
    }));
    const n = step(bare({ z: z0, t: timeToZ(z0), pickups }), 0, idle);
    expect(n.coins).toBe(20);
    expect(n.pickups.filter((p) => p.collected)).toHaveLength(20);
    expect(n.pickups.filter((p) => !p.collected)).toHaveLength(1);
  });

  it('never exposes negative lives (B30)', () => {
    const n = step(
      bare({
        z: 10,
        t: timeToZ(10),
        lives: 0,
        obstacles: [obst(1, 10.05, 3.4)],
      }),
      0.05,
      idle,
    );
    expect(n.lives).toBe(0);
    expect(n.phase).toBe('fail');
  });

  it('the generation-cap break is reached: every seed places exactly 20 coins (B19, R-I1-02)', () => {
    for (let seed = 0; seed < 20_000; seed++) {
      const course = generateCourse(seed);
      expect(course.pickups.length).toBe(BIKE.maxCoins);
      const ids = new Set(course.pickups.map((p) => p.id));
      expect(ids.size).toBe(BIKE.maxCoins);
    }
    // Without `if (pickups.length >= BIKE.maxCoins) break`, the same seeds
    // would exceed 20 (approach + mid-gap + row slots). That is how B19 dies.
  });

  it('a 20-coin course can be fully collected on its clear path (R-I1-02)', () => {
    const follow = (start: BikeRun): BikeRun => {
      const path = courseClearPath(start.rows);
      const targetLane = (r: BikeRun) => {
        const i = start.rows.findLastIndex((row) => row.z <= r.z);
        if (i < 0) return path[0]!;
        const next = i + 1 < path.length ? i + 1 : i;
        if (next === i) return path[i]!;
        const lo = Math.min(path[i]!, path[next]!);
        const hi = Math.max(path[i]!, path[next]!);
        const crossed = start.obstacles.filter(
          (o) => o.row === start.rows[i]!.index && o.lane >= lo && o.lane <= hi,
        );
        const exitZ = crossed.length
          ? start.rows[i]!.z + Math.max(...crossed.map((o) => o.depth)) + BIKE.halfDepth
          : start.rows[i]!.z;
        return r.z >= exitZ ? path[next]! : path[i]!;
      };
      let r = start;
      while (r.phase === 'running') {
        const target = targetLane(r);
        let input = idle;
        if (r.laneT >= BIKE.laneTime && target !== r.lane) {
          input = target < r.lane ? { left: true, right: false } : { left: false, right: true };
        }
        r = step(r, BIKE.maxDt, input);
      }
      return r;
    };
    let collected = 0;
    let runs = 0;
    const seeds = [
      1,
      2,
      77,
      1008,
      42_424,
      147938870,
      0,
      7,
      99,
      2026,
      ...Array.from({ length: 190 }, (_, i) => 2000 + i),
    ];
    for (const seed of seeds) {
      const done = follow(createRun(seed, 'collect'));
      runs += 1;
      expect(done.lives, `seed=${seed} died`).toBeGreaterThan(0);
      expect(done.coins, `seed=${seed}`).toBe(BIKE.maxCoins);
      expect(done.pickups.filter((p) => p.collected)).toHaveLength(BIKE.maxCoins);
      collected += done.coins;
    }
    expect(runs).toBe(200);
    expect(collected).toBe(200 * BIKE.maxCoins);
  });
});
