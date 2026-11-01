import { forwardRef, useImperativeHandle, useRef } from 'react';
import { BALANCE } from '../../data/balance';

export interface FloatingHandle {
  spawn(text: string, x: number, y: number): void;
}

/**
 * Fixed pool of 20 nodes created on mount and recycled round-robin (ARCHITECTURE-LOT4 §8):
 * no node is ever added after mount, so nothing can leak. CSS animation 900 ms (600 ms fixed in
 * reduced motion, OD-T4), then hidden on animationend. aria-hidden: no announcement per tap.
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
    <div className="fx" aria-hidden="true">
      {Array.from({ length: BALANCE.fx.poolSize }, (_, i) => (
        <span
          key={i}
          className="pop num"
          hidden
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
