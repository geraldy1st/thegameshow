/** Seeded PRNG (mulberry32). State is a uint32 stored in the save so reloads cannot reroll. */
export interface RngState {
  seed: number;
  state: number;
}

export function createRng(seed: number): RngState {
  const s = seed >>> 0;
  return { seed: s, state: s };
}

/** Returns a float in [0, 1) and the next state. Pure. */
export function nextFloat(rng: RngState): [number, RngState] {
  let t = (rng.state + 0x6d2b79f5) >>> 0;
  const nextState = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, { seed: rng.seed, state: nextState }];
}
