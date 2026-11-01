import { BALANCE } from '../data/balance';
import { nextFloat, type RngState } from './rng';

/**
 * Power boost state machine (ARCHITECTURE-LOT4 §5). Pure, in memory only (D2): every decision
 * depends on `now` only; timers and requestAnimationFrame only redraw.
 */
export type BoostPhase = 'idle' | 'shown' | 'active' | 'cooldown';
export interface BoostState {
  phase: BoostPhase;
  nextShowAt: number;
  shownAt: number;
  hideAt: number;
  boostEnd: number;
  joyPending: boolean;
  endedHidden: boolean;
  rng: RngState;
}
export type BoostEvent = 'shown' | 'hit' | 'miss' | 'expired' | 'ended' | null;

function gap(rng: RngState): [number, RngState] {
  const { minGapMs, maxGapMs } = BALANCE.boost;
  const [f, next] = nextFloat(rng);
  return [minGapMs + Math.floor(f * (maxGapMs - minGapMs + 1)), next];
}

/** Fresh machine (load, or back on the screen): idle, next show in U(40 s, 60 s). */
export function initBoost(now: number, rng: RngState): BoostState {
  const [g, r] = gap(rng);
  return {
    phase: 'idle',
    nextShowAt: now + g,
    shownAt: 0,
    hideAt: 0,
    boostEnd: 0,
    joyPending: false,
    endedHidden: false,
    rng: r,
  };
}

function toCooldown(s: BoostState, now: number, patch: Partial<BoostState> = {}): BoostState {
  // cooldown draws the next show at once and then behaves like idle: no stacking (§5).
  const [g, r] = gap(s.rng);
  return { ...s, ...patch, phase: 'cooldown', nextShowAt: now + g, rng: r };
}

/** Triangle wave position of the cursor, 0..1, period 2.6 s (§5). */
export function cursorAt(s: BoostState, now: number): number {
  const { periodMs } = BALANCE.boost;
  const x = ((((now - s.shownAt) % periodMs) + periodMs) % periodMs) / periodMs;
  return x < 0.5 ? x * 2 : 2 - x * 2;
}

export const inZone = (p: number): boolean =>
  p >= BALANCE.boost.zone[0] && p <= BALANCE.boost.zone[1];

/** `isDoubled(t) ⇔ phase = active ∧ t < boostEnd` (§3). */
export const isDoubled = (s: BoostState, now: number): boolean =>
  s.phase === 'active' && now < s.boostEnd;

export const boostMult = (s: BoostState, now: number): number =>
  isDoubled(s, now) ? BALANCE.boost.mult : 1;

/** Time-driven transitions. `visible` = the tab is visible. */
export function tickBoost(
  s: BoostState,
  now: number,
  visible: boolean,
): { state: BoostState; event: BoostEvent } {
  switch (s.phase) {
    case 'idle':
    case 'cooldown':
      if (visible && now >= s.nextShowAt) {
        return {
          state: { ...s, phase: 'shown', shownAt: now, hideAt: now + BALANCE.boost.visibleMs },
          event: 'shown',
        };
      }
      return { state: s, event: null };
    case 'shown':
      if (now >= s.hideAt) return { state: toCooldown(s, now), event: 'expired' };
      return { state: s, event: null };
    case 'active': {
      const endedHidden = s.endedHidden || !visible;
      if (now >= s.boostEnd) {
        return {
          state: toCooldown(s, now, { joyPending: !endedHidden, endedHidden: false }),
          event: 'ended',
        };
      }
      return { state: endedHidden === s.endedHidden ? s : { ...s, endedHidden }, event: null };
    }
  }
}

/**
 * Touch on Aoi (or « Activer le boost » with `cursor` = 0.5 in reduced-motion). Outside
 * `shown`: nothing happens (help message, no penalty).
 */
export function touchAoi(
  s0: BoostState,
  now: number,
  visible: boolean,
  cursor?: number,
): { state: BoostState; event: BoostEvent } {
  const t = tickBoost(s0, now, visible);
  const s = t.state;
  if (s.phase !== 'shown') return t;
  const p = cursor ?? cursorAt(s, now);
  if (inZone(p)) {
    return {
      state: {
        ...s,
        phase: 'active',
        boostEnd: now + BALANCE.boost.durationMs,
        endedHidden: !visible,
        joyPending: false,
      },
      event: 'hit',
    };
  }
  return { state: toCooldown(s, now), event: 'miss' };
}

/** The tab became hidden: an active boost ends without « joy » (G-5 'lost'). */
export function hideTab(s: BoostState): BoostState {
  return s.phase === 'active' ? { ...s, endedHidden: true } : s;
}

/** Whole seconds left, `ceil((boostEnd − now) / 1000)` (§5). */
export const secondsLeft = (s: BoostState, now: number): number =>
  s.phase === 'active' ? Math.max(0, Math.ceil((s.boostEnd - now) / 1000)) : 0;
