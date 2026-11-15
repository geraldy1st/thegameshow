import { createRng, nextFloat, type RngState } from './rng';

/** Isolated bike-run simulation (0.6.0 I1). No DOM, no storage, no GameFlow. */
export const BIKE = {
  lanes: 3,
  lengthM: 160,
  lives: 3,
  v0: 6.6,
  vmax: 9.4,
  accel: 0.11,
  laneTime: 0.25,
  reactionMargin: 0.2,
  maxDt: 0.05,
  firstRowM: 26,
  endClearM: 22,
  gapT0: 1.45,
  gapT1: 1.0,
  breatherEvery: 6,
  breatherT: 0.5,
  doubleP: 0.45,
  invuln: 0.6,
  laneW: 1.7,
  laneHit: 0.45,
  halfDepth: 0.3,
  maxCoins: 20,
  coinPickZ: 0.55,
  depths: { voiture: 3.4, scooter: 1.1, pieton: 0.5, travaux: 0.45 },
} as const;

export type Lane = 0 | 1 | 2;
export type ObstacleKind = keyof typeof BIKE.depths;
export type BikePhase = 'running' | 'paused' | 'success' | 'fail';

export type BikeObstacle = {
  id: number;
  row: number;
  lane: Lane;
  z: number;
  depth: number;
  kind: ObstacleKind;
  hit: boolean;
};

export type BikePickup = {
  id: number;
  lane: Lane;
  z: number;
  collected: boolean;
};

export type BikeRow = {
  index: number;
  z: number;
  occupied: readonly Lane[];
  free: readonly Lane[];
};

export type BikeInput = {
  left: boolean;
  right: boolean;
};

export type BikeRun = {
  runId: string;
  seed: number;
  phase: BikePhase;
  t: number;
  z: number;
  x: number;
  lane: Lane;
  laneFrom: Lane;
  laneT: number;
  lives: number;
  invuln: number;
  coins: number;
  rows: readonly BikeRow[];
  obstacles: readonly BikeObstacle[];
  pickups: readonly BikePickup[];
};

const LANES: readonly Lane[] = [0, 1, 2];
const KINDS: readonly ObstacleKind[] = ['voiture', 'scooter', 'pieton', 'travaux'];
const KIND_WEIGHTS = [0.28, 0.24, 0.24, 0.24] as const;

const timeToVmax = (BIKE.vmax - BIKE.v0) / BIKE.accel;
const distToVmax = BIKE.v0 * timeToVmax + 0.5 * BIKE.accel * timeToVmax * timeToVmax;

export const minGapTime = 2 * BIKE.laneTime + BIKE.reactionMargin;

/**
 * Measured minimum analytical slack (Crypto I1, seed 147938870): 0.1226 s between
 * obstacle exit (rear + halfDepth) and next-row entry (front − halfDepth), minus
 * lane-change time. The 0.20 s `BIKE.reactionMargin` used in minGapTime is a
 * conservative unused floor (gaps are ~1.09–1.74 s). The independent oracle
 * uses this measured 0.12 s (R-I1-01).
 */
export const ORACLE_REACTION_MARGIN = 0.12;

export function speedAt(t: number): number {
  return Math.min(BIKE.vmax, BIKE.v0 + BIKE.accel * Math.max(0, t));
}

/** Exact SI → km/h. HUD (later) shows Math.round(speedKmh(mps)). */
export function speedKmh(mps: number): number {
  return mps * 3.6;
}

export function timeToZ(z: number): number {
  const zz = Math.max(0, z);
  if (zz <= distToVmax) {
    return (-BIKE.v0 + Math.sqrt(BIKE.v0 * BIKE.v0 + 2 * BIKE.accel * zz)) / BIKE.accel;
  }
  return timeToVmax + (zz - distToVmax) / BIKE.vmax;
}

export function travelTime(z0: number, z1: number): number {
  return timeToZ(z1) - timeToZ(z0);
}

export function laneX(lane: Lane): number {
  return (lane - 1) * BIKE.laneW;
}

export function lerp(a: number, b: number, u: number): number {
  return a + (b - a) * u;
}

function clamp01(u: number): number {
  return u < 0 ? 0 : u > 1 ? 1 : u;
}

function asLane(n: number): Lane {
  return (n < 0 ? 0 : n > 2 ? 2 : n) as Lane;
}

function pickKind(rng: RngState): [ObstacleKind, RngState] {
  const [u, next] = nextFloat(rng);
  let acc = 0;
  for (let i = 0; i < KINDS.length; i++) {
    acc += KIND_WEIGHTS[i]!;
    if (u < acc) return [KINDS[i]!, next];
  }
  return ['travaux', next];
}

function pickDistinctLanes(rng: RngState, count: 1 | 2): [Lane[], RngState] {
  const lanes: Lane[] = [0, 1, 2];
  let r = rng;
  for (let i = lanes.length - 1; i > 0; i--) {
    const [u, next] = nextFloat(r);
    r = next;
    const j = Math.floor(u * (i + 1));
    const tmp = lanes[i]!;
    lanes[i] = lanes[j]!;
    lanes[j] = tmp;
  }
  return [lanes.slice(0, count), r];
}

/**
 * Next row z such that travel time is at least max(gapT, minGapTime).
 * Integrates the accelerating motion (not the proto's v*gapT shortcut alone).
 */
function nextRowZ(z: number, gapT: number): number {
  const need = Math.max(gapT, minGapTime);
  const t1 = timeToZ(z) + need;
  // z(t) = v0 t + 1/2 a t^2 while below vmax (always true on this track).
  return BIKE.v0 * t1 + 0.5 * BIKE.accel * t1 * t1;
}

export type BikeCourse = {
  rows: readonly BikeRow[];
  obstacles: readonly BikeObstacle[];
  pickups: readonly BikePickup[];
};

export function generateCourse(seed: number): BikeCourse {
  let rng = createRng(seed);
  const rows: BikeRow[] = [];
  const obstacles: BikeObstacle[] = [];
  let z: number = BIKE.firstRowM;
  let index = 0;
  const lastZ = BIKE.lengthM - BIKE.endClearM;

  while (z <= lastZ) {
    const double =
      index >= 3 &&
      (() => {
        const [u, next] = nextFloat(rng);
        rng = next;
        return u < BIKE.doubleP;
      })();
    const count: 1 | 2 = double ? 2 : 1;
    const [occupied, nextRng] = pickDistinctLanes(rng, count);
    rng = nextRng;
    const free = LANES.filter((l) => !occupied.includes(l));
    rows.push({ index, z, occupied, free });
    for (const lane of occupied) {
      const [kind, next] = pickKind(rng);
      rng = next;
      obstacles.push({
        id: obstacles.length,
        row: index,
        lane,
        z,
        depth: BIKE.depths[kind],
        kind,
        hit: false,
      });
    }
    const p = clamp01(z / BIKE.lengthM);
    let gapT = lerp(BIKE.gapT0, BIKE.gapT1, p);
    if (index > 2 && (index + 1) % BIKE.breatherEvery === 0) gapT += BIKE.breatherT;
    const zNext = nextRowZ(z, gapT);
    if (zNext > lastZ) break;
    z = zNext;
    index += 1;
  }

  const pickups: BikePickup[] = [];
  for (const row of rows) {
    if (pickups.length >= BIKE.maxCoins) break;
    if (row.free.length === 0) continue;
    const [u, next] = nextFloat(rng);
    rng = next;
    if (u >= 0.7 && row.index > 0) continue;
    const [u2, next2] = nextFloat(rng);
    rng = next2;
    const lane = row.free[Math.floor(u2 * row.free.length)]!;
    // Sit the coin slightly before the row so it is on the clear lane, not inside an obstacle.
    const coinZ = Math.max(0, row.z - 2);
    pickups.push({ id: pickups.length, lane, z: coinZ, collected: false });
  }

  return { rows, obstacles, pickups };
}

/**
 * Independent of the generator's gapT / minGapTime floor (R-I1-01 / DEF-BT-11).
 * From every origin lane of row i−1, at least one free lane of row i is reachable
 * after leaving the deepest obstacle actually crossed (rear + halfDepth) and
 * before entering the next row (front − halfDepth), with
 * |Δlane| × laneTime + ORACLE_REACTION_MARGIN.
 */
export function courseIsReachable(course: BikeCourse): boolean {
  const { rows, obstacles } = course;
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1]!;
    const row = rows[i]!;
    if (row.free.length === 0) return false;
    const prevObs = obstacles.filter((o) => o.row === prev.index);
    const entryZ = row.z - BIKE.halfDepth;
    for (const origin of LANES) {
      const ok = row.free.some((dest) => {
        const lo = Math.min(origin, dest);
        const hi = Math.max(origin, dest);
        const crossed = prevObs.filter((o) => o.lane >= lo && o.lane <= hi);
        const exitZ = crossed.length
          ? prev.z + Math.max(...crossed.map((o) => o.depth)) + BIKE.halfDepth
          : prev.z;
        const available = travelTime(exitZ, entryZ);
        const need = Math.abs(dest - origin) * BIKE.laneTime + ORACLE_REACTION_MARGIN;
        return available + 1e-12 >= need;
      });
      if (!ok) return false;
    }
  }
  return true;
}

/** @deprecated tautological front-to-front check; use courseIsReachable. */
export function rowsAreReachable(rows: readonly BikeRow[]): boolean {
  return courseIsReachable({ rows, obstacles: [], pickups: [] });
}

export function createRun(seed: number, runId: string): BikeRun {
  const course = generateCourse(seed);
  return {
    runId,
    seed,
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
    rows: course.rows,
    obstacles: course.obstacles,
    pickups: course.pickups,
  };
}

export function pause(run: BikeRun): BikeRun {
  if (run.phase !== 'running') return run;
  return { ...run, phase: 'paused' };
}

/** Resume with held inputs cleared: the caller passes a fresh input on the next step. */
export function resume(run: BikeRun): BikeRun {
  if (run.phase !== 'paused') return run;
  // R-I1-04: pause freezes a lane change in progress; resume continues from saved laneT
  // (no snap, no teleport). Held inputs are cleared by the caller on the next step.
  return { ...run, phase: 'running' };
}

function changing(run: BikeRun): boolean {
  return run.laneT < BIKE.laneTime;
}

function applySteer(run: BikeRun, input: BikeInput): BikeRun {
  if (changing(run)) return run;
  if (input.left === input.right) return run;
  if (input.left && run.lane > 0) {
    const next = asLane(run.lane - 1);
    return { ...run, laneFrom: run.lane, lane: next, laneT: 0 };
  }
  if (input.right && run.lane < 2) {
    const next = asLane(run.lane + 1);
    return { ...run, laneFrom: run.lane, lane: next, laneT: 0 };
  }
  return run;
}

function overlapsZ(z0: number, z1: number, obst: BikeObstacle): boolean {
  const a = Math.min(z0, z1) - BIKE.halfDepth;
  const b = Math.max(z0, z1) + BIKE.halfDepth;
  const c = obst.z;
  const d = obst.z + obst.depth;
  return a < d && b > c;
}

function inLane(x: number, lane: Lane): boolean {
  return Math.abs(x - laneX(lane)) <= BIKE.laneW * BIKE.laneHit;
}

export function step(run: BikeRun, dt: number, input: BikeInput): BikeRun {
  if (run.phase !== 'running') return run;
  // DEF-GS-49: NaN / ±Infinity must not corrupt t/z (the run would never end).
  const bounded = Number.isFinite(dt) ? Math.min(BIKE.maxDt, Math.max(0, dt)) : 0;
  const next = applySteer(run, input);
  const z0 = next.z;
  const t1 = next.t + bounded;
  const z1 = z0 + speedAt(next.t) * bounded;
  const laneT = next.laneT + bounded;
  const u = clamp01(laneT / BIKE.laneTime);
  const x = lerp(laneX(next.laneFrom), laneX(next.lane), u);
  const invuln = Math.max(0, next.invuln - bounded);

  let lives = next.lives;
  let inv = invuln;
  const obstacles = next.obstacles.map((o) => ({ ...o }));
  if (inv <= 0) {
    for (const o of obstacles) {
      if (o.hit) continue;
      if (!overlapsZ(z0, z1, o)) continue;
      if (!inLane(x, o.lane)) continue;
      o.hit = true;
      lives -= 1;
      inv = BIKE.invuln;
      break;
    }
  }

  const pickups = next.pickups.map((p) => ({ ...p }));
  let coins = next.coins;
  for (const p of pickups) {
    if (p.collected || coins >= BIKE.maxCoins) continue;
    if (Math.abs(p.z - z1) > BIKE.coinPickZ) continue;
    if (Math.abs(x - laneX(p.lane)) > 0.5) continue;
    p.collected = true;
    coins += 1;
  }

  let phase: BikePhase = next.phase;
  let z = z1;
  if (lives <= 0) {
    phase = 'fail';
    z = z1;
  } else if (z1 >= BIKE.lengthM) {
    phase = 'success';
    z = BIKE.lengthM;
  }

  return {
    ...next,
    phase,
    t: t1,
    z,
    x,
    laneT,
    lives: Math.max(0, lives),
    invuln: inv,
    coins,
    obstacles,
    pickups,
  };
}
