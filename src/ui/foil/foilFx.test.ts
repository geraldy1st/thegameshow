/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FOIL_SPEC_REST,
  FOIL_SWEEP_DURATION_MS,
  FOIL_SWEEP_FROM,
  FOIL_SWEEP_PERIOD_MS,
  FOIL_SWEEP_SPAN,
  clampTilt,
  createFoilFX,
  offsetsFromRect,
  pointerFoil,
  sweepSpec,
  type FoilSurface,
} from './foilFx';

function fakeEl(): FoilSurface['el'] & { props: Record<string, string> } {
  const props: Record<string, string> = {};
  return {
    props,
    style: {
      setProperty(name, value) {
        props[name] = value;
      },
    },
  };
}

function surface(kind: 2 | 3, el: FoilSurface['el']): FoilSurface {
  return { el, kind, cx: 0, cy: 0, pointerActive: false };
}

describe('sweepSpec / pointerFoil (pure)', () => {
  it('rests at FROM between 900 ms sweeps every 4 s', () => {
    expect(sweepSpec(0)).toBe(FOIL_SWEEP_FROM);
    expect(sweepSpec(FOIL_SWEEP_DURATION_MS / 2)).toBe(FOIL_SWEEP_FROM + FOIL_SWEEP_SPAN / 2);
    expect(sweepSpec(FOIL_SWEEP_DURATION_MS)).toBe(FOIL_SWEEP_FROM);
    expect(sweepSpec(FOIL_SWEEP_PERIOD_MS)).toBe(FOIL_SWEEP_FROM);
  });

  it('clamps tilt to ±8° and rests the 3★ band at 30%', () => {
    expect(clampTilt(99)).toBe(8);
    expect(clampTilt(-99)).toBe(-8);
    const rest = pointerFoil(0, 0);
    expect(rest.rx).toBe(0);
    expect(rest.ry).toBe(0);
    expect(rest.spec).toBe(FOIL_SPEC_REST);
  });

  it('offsetsFromRect uses a cached rect, not a live measure', () => {
    const rect = { left: 0, top: 0, width: 100, height: 100 };
    const mid = offsetsFromRect(rect, 50, 50);
    expect(mid.cx).toBe(0);
    expect(mid.cy).toBe(0);
  });
});

describe('FoilFX rAF (R-X10-05)', () => {
  const queue: FrameRequestCallback[] = [];
  const oriListeners: Array<(e: { gamma: number | null; beta: number | null }) => void> = [];
  let now = 0;
  let reduced = false;

  const fx = () =>
    createFoilFX({
      now: () => now,
      reduced: () => reduced,
      raf: (cb) => {
        queue.push(cb);
        return queue.length;
      },
      caf: () => {
        queue.length = 0;
      },
      onListenOrientation: (fn) => {
        oriListeners.push(fn);
        return () => {
          const i = oriListeners.indexOf(fn);
          if (i >= 0) oriListeners.splice(i, 1);
        };
      },
    });

  afterEach(() => {
    queue.length = 0;
    oriListeners.length = 0;
    now = 0;
    reduced = false;
    vi.restoreAllMocks();
  });

  const flush = (t: number) => {
    const cb = queue.shift();
    if (!cb) throw new Error('rAF empty');
    cb(t);
  };

  it('starts once and refuses when motion is reduced', () => {
    const a = fx();
    expect(a.start()).toBe(true);
    expect(a.running).toBe(true);
    const queued = queue.length;
    expect(a.start()).toBe(true);
    expect(queue.length).toBe(queued);

    reduced = true;
    const b = fx();
    expect(b.start()).toBe(false);
    expect(b.running).toBe(false);
  });

  it('writes the 2★ sweep and the 3★ rest band without layout reads', () => {
    const proto = HTMLElement.prototype;
    const spyRect = vi.spyOn(proto, 'getBoundingClientRect');
    const spyRects = vi.spyOn(proto, 'getClientRects');
    const a = fx();
    const two = fakeEl();
    const three = fakeEl();
    a.register(surface(2, two));
    a.register(surface(3, three));
    flush(0);
    expect(two.props['--spec']).toBe(`${FOIL_SWEEP_FROM}%`);
    expect(three.props['--spec']).toBe(`${FOIL_SPEC_REST.toFixed(1)}%`);
    expect(three.props['--rx']).toBe('0.00deg');
    flush(FOIL_SWEEP_DURATION_MS / 2);
    expect(Number.parseFloat(two.props['--spec'] ?? '')).toBeCloseTo(
      FOIL_SWEEP_FROM + FOIL_SWEEP_SPAN / 2,
      5,
    );
    expect(spyRect).not.toHaveBeenCalled();
    expect(spyRects).not.toHaveBeenCalled();
    a.stop();
  });

  it('applies pointer targets written outside the rAF, and orientation if it arrives alone', () => {
    const a = fx();
    const el = fakeEl();
    const s = surface(3, el);
    a.register(s);
    s.cx = 0.5;
    s.cy = -0.5;
    s.pointerActive = true;
    flush(0);
    const p = pointerFoil(0.5, -0.5);
    expect(el.props['--rx']).toBe(`${p.rx.toFixed(2)}deg`);
    expect(el.props['--spec']).toBe(`${p.spec.toFixed(1)}%`);

    s.pointerActive = false;
    oriListeners[0]!({ gamma: 45, beta: 45 });
    flush(16);
    expect(a.orientation.hasOri).toBe(true);
    expect(el.props['--spec']).toBe(`${FOIL_SPEC_REST.toFixed(1)}%`);
    expect(el.props['--ry']).toBe(`${(8).toFixed(2)}deg`);
  });

  it('stops the rAF when the last surface unregisters', () => {
    const a = fx();
    const el = fakeEl();
    const s = surface(3, el);
    a.register(s);
    expect(a.size).toBe(1);
    a.unregister(s);
    expect(a.size).toBe(0);
    expect(a.running).toBe(false);
    expect(queue.length).toBe(0);
  });
});
