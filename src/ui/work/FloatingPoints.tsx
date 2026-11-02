import { forwardRef, useImperativeHandle, useRef, type CSSProperties } from 'react';
import { BALANCE } from '../../data/balance';

export interface FloatingHandle {
  spawn(text: string, x: number, y: number): void;
}

/**
 * Fixed pool created on mount and recycled round-robin (ARCHITECTURE-LOT4 §8): no node is ever
 * added after mount, so nothing can leak. Patch 0.4.3 (P4, R-P43-2): 30 nodes, which covers
 * 15 accepted taps per sliding second over the 1 300 ms float; durations come from
 * BALANCE.fx through CSS variables (1 200 ms fixed in reduced motion, offset by --k so points
 * do not stack). aria-hidden: no announcement per tap.
 */
export const FloatingPoints = forwardRef<FloatingHandle>(function FloatingPoints(_p, ref) {
  const nodes = useRef<Array<HTMLSpanElement | null>>([]);
  const next = useRef(0);
  useImperativeHandle(ref, () => ({
    spawn(text, x, y) {
      const el = nodes.current[next.current];
      next.current = (next.current + 1) % BALANCE.fx.poolSize;
      if (!el) return;
      el.textContent = text;
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.hidden = false;
      el.classList.remove('go');
      void el.offsetWidth; // restart the animation on a recycled node
      el.classList.add('go');
    },
  }));
  return (
    <div
      className="fx"
      aria-hidden="true"
      data-pool={BALANCE.fx.poolSize}
      style={
        {
          '--float-ms': `${BALANCE.fx.floatMs}ms`,
          '--float-still-ms': `${BALANCE.fx.reducedMs}ms`,
        } as CSSProperties
      }
    >
      {Array.from({ length: BALANCE.fx.poolSize }, (_, i) => (
        <span
          key={i}
          className="pop num"
          hidden
          style={{ '--k': i % 3 } as CSSProperties}
          ref={(el) => {
            nodes.current[i] = el;
          }}
          onAnimationEnd={(e) => {
            e.currentTarget.hidden = true;
            e.currentTarget.classList.remove('go');
          }}
        />
      ))}
    </div>
  );
});
