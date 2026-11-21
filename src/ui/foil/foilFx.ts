/**
 * Rare-card holographic foil (R-X10-05).
 * One rAF writes custom properties only. Layout is measured outside the loop
 * (pointerenter / pointerdown / resize / scroll) and never in the frame callback.
 * Device orientation is listened for if the event arrives on its own — the
 * permission prompt API is never called.
 */

import { prefersReducedMotion } from '../helpers';

export const FOIL_SWEEP_PERIOD_MS = 4000;
export const FOIL_SWEEP_DURATION_MS = 900;
export const FOIL_TILT_MAX = 8;
export const FOIL_SPEC_REST = 30;
export const FOIL_SWEEP_FROM = -40;
export const FOIL_SWEEP_SPAN = 180;
export const FOIL_DRAG_THRESHOLD_PX = 10;

export type FoilKind = 2 | 3;

export type FoilSurface = {
  el: { style: { setProperty: (name: string, value: string) => void } };
  kind: FoilKind;
  /** Pointer offset from centre, written outside the rAF. */
  cx: number;
  cy: number;
  pointerActive: boolean;
};

export type FoilFxOptions = {
  now?: () => number;
  reduced?: () => boolean;
  raf?: (cb: FrameRequestCallback) => number;
  caf?: (id: number) => void;
  onListenOrientation?: (
    fn: (e: { gamma: number | null; beta: number | null }) => void,
  ) => () => void;
};

export function sweepSpec(elapsedMs: number): number {
  const ph = ((elapsedMs % FOIL_SWEEP_PERIOD_MS) + FOIL_SWEEP_PERIOD_MS) % FOIL_SWEEP_PERIOD_MS;
  if (ph >= FOIL_SWEEP_DURATION_MS) return FOIL_SWEEP_FROM;
  return FOIL_SWEEP_FROM + (ph / FOIL_SWEEP_DURATION_MS) * FOIL_SWEEP_SPAN;
}

export function clampTilt(n: number): number {
  const v = Math.max(-FOIL_TILT_MAX, Math.min(FOIL_TILT_MAX, n));
  return v === 0 ? 0 : v;
}

export function pointerFoil(
  cx: number,
  cy: number,
): { rx: number; ry: number; spec: number; foilA: number } {
  const rx = clampTilt(-cy * FOIL_TILT_MAX);
  const ry = clampTilt(cx * FOIL_TILT_MAX);
  return { rx, ry, spec: FOIL_SPEC_REST + cx * 60, foilA: 200 + ry * 6 };
}

/** Measure a surface. Call from pointer / resize / scroll handlers, never from the rAF. */
export function cacheRect(el: Element): DOMRect {
  return el.getBoundingClientRect();
}

export function offsetsFromRect(
  rect: { left: number; top: number; width: number; height: number },
  clientX: number,
  clientY: number,
): { cx: number; cy: number } {
  const cx = (clientX - (rect.left + rect.width / 2)) / Math.max(40, rect.width);
  const cy = (clientY - (rect.top + rect.height / 2)) / Math.max(40, rect.height);
  return { cx, cy };
}

function applyThree(
  el: FoilSurface['el'],
  rx: number,
  ry: number,
  spec: number,
  foilA: number,
): void {
  el.style.setProperty('--rx', `${rx.toFixed(2)}deg`);
  el.style.setProperty('--ry', `${ry.toFixed(2)}deg`);
  el.style.setProperty('--spec', `${spec.toFixed(1)}%`);
  el.style.setProperty('--foil-a', `${foilA.toFixed(1)}deg`);
}

export function createFoilFX(opts: FoilFxOptions = {}) {
  const now = opts.now ?? (() => performance.now());
  const reduced = opts.reduced ?? prefersReducedMotion;
  const raf = opts.raf ?? ((cb) => requestAnimationFrame(cb));
  const caf = opts.caf ?? ((id) => cancelAnimationFrame(id));
  const surfaces = new Set<FoilSurface>();
  let rafId = 0;
  let t0: number | undefined;
  let running = false;
  let hasOri = false;
  let oriRx = 0;
  let oriRy = 0;
  let unlistenOri: (() => void) | undefined;

  const onOri = (e: { gamma: number | null; beta: number | null }) => {
    if (e.gamma == null || e.beta == null) return;
    hasOri = true;
    oriRy = clampTilt((e.gamma / 45) * FOIL_TILT_MAX);
    oriRx = clampTilt(((e.beta - 45) / 45) * FOIL_TILT_MAX);
  };

  const attachOri = () => {
    if (unlistenOri) return;
    if (opts.onListenOrientation) {
      unlistenOri = opts.onListenOrientation(onOri);
      return;
    }
    if (typeof window === 'undefined') return;
    const handler = (e: Event) => {
      const oe = e as DeviceOrientationEvent;
      onOri({ gamma: oe.gamma, beta: oe.beta });
    };
    window.addEventListener('deviceorientation', handler, { passive: true });
    unlistenOri = () => window.removeEventListener('deviceorientation', handler);
  };

  const detachOri = () => {
    unlistenOri?.();
    unlistenOri = undefined;
    hasOri = false;
    oriRx = 0;
    oriRy = 0;
  };

  const frame: FrameRequestCallback = (t) => {
    if (reduced()) {
      stop();
      return;
    }
    if (!surfaces.size) {
      stop();
      return;
    }
    if (t0 === undefined) t0 = typeof t === 'number' ? t : now();
    const elapsed = (typeof t === 'number' ? t : now()) - t0;
    const sweep = sweepSpec(elapsed);
    for (const s of surfaces) {
      if (s.kind === 2) {
        s.el.style.setProperty('--spec', `${sweep}%`);
        continue;
      }
      if (s.pointerActive) {
        const p = pointerFoil(s.cx, s.cy);
        applyThree(s.el, p.rx, p.ry, p.spec, p.foilA);
      } else if (hasOri) {
        applyThree(s.el, oriRx, oriRy, FOIL_SPEC_REST, 200 + oriRy * 6);
      } else {
        applyThree(s.el, 0, 0, FOIL_SPEC_REST, 210);
      }
    }
    rafId = raf(frame);
  };

  function start(): boolean {
    if (reduced()) {
      stop();
      return false;
    }
    attachOri();
    if (!running) {
      running = true;
      t0 = undefined;
      rafId = raf(frame);
    }
    return true;
  }

  function stop(): void {
    if (rafId) caf(rafId);
    rafId = 0;
    running = false;
    t0 = undefined;
    if (!surfaces.size) detachOri();
  }

  function register(surface: FoilSurface): void {
    surfaces.add(surface);
    start();
  }

  function unregister(surface: FoilSurface): void {
    surfaces.delete(surface);
    if (!surfaces.size) stop();
  }

  return {
    start,
    stop,
    register,
    unregister,
    get size() {
      return surfaces.size;
    },
    get running() {
      return running;
    },
    /** Test hook: last orientation flags (no layout). */
    get orientation() {
      return { hasOri, oriRx, oriRy };
    },
  };
}

export const foilFx = createFoilFX();
