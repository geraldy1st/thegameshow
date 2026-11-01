import { createStore } from 'zustand/vanilla';
import { createRng, type RngState } from '../../core/rng';
import {
  initBoost,
  tickBoost,
  touchAoi,
  hideTab,
  type BoostEvent,
  type BoostState,
} from '../../core/boost';

/**
 * Ephemeral boost state (ARCHITECTURE-LOT4 §4.2): never written to IndexedDB. Reset on every
 * entry to #work (reload or back on the screen: idle, next show in U(40 s, 60 s)).
 */
export interface BoostStoreState {
  boost: BoostState;
  visible: boolean;
  /** Harness only: fixed cursor position (null: the triangle wave). */
  cursor: number | null;
  rng: RngState;
}

const seed = () =>
  typeof crypto !== 'undefined' ? (crypto.getRandomValues(new Uint32Array(1))[0] ?? 1) : 1;

export const boostStore = createStore<BoostStoreState>()(() => {
  const rng = createRng(seed());
  return { boost: initBoost(0, rng), visible: true, cursor: null, rng };
});

export function resetBoost(now: number): void {
  const s = boostStore.getState();
  boostStore.setState({ boost: initBoost(now, s.boost.rng) });
}
export function seedBoost(seedValue: number, now: number): void {
  boostStore.setState({ boost: initBoost(now, createRng(seedValue)) });
}
export function tick(now: number): BoostEvent {
  const s = boostStore.getState();
  const r = tickBoost(s.boost, now, s.visible);
  if (r.state !== s.boost) boostStore.setState({ boost: r.state });
  return r.event;
}
export function touch(now: number, cursor?: number): BoostEvent {
  const s = boostStore.getState();
  const r = touchAoi(s.boost, now, s.visible, cursor ?? s.cursor ?? undefined);
  if (r.state !== s.boost) boostStore.setState({ boost: r.state });
  return r.event;
}
export function setVisible(visible: boolean): void {
  const s = boostStore.getState();
  boostStore.setState({ visible, boost: visible ? s.boost : hideTab(s.boost) });
}
/** Harness: show the boost now (as if nextShowAt was reached). */
export function forceShow(now: number): BoostEvent {
  const s = boostStore.getState();
  if (s.boost.phase === 'shown' || s.boost.phase === 'active') return null;
  boostStore.setState({ boost: { ...s.boost, phase: 'idle', nextShowAt: now } });
  return tick(now);
}
/** Consumes joyPending (joy after a successful boost ended with the tab visible). */
export function takeJoy(): boolean {
  const s = boostStore.getState();
  if (!s.boost.joyPending) return false;
  boostStore.setState({ boost: { ...s.boost, joyPending: false } });
  return true;
}
