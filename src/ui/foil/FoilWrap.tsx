import {
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useRef,
} from 'react';
import { prefersReducedMotion } from '../helpers';
import '../foil.css';
import {
  FOIL_DRAG_THRESHOLD_PX,
  FOIL_SPEC_REST,
  FOIL_SWEEP_FROM,
  cacheRect,
  foilFx,
  offsetsFromRect,
  type FoilKind,
  type FoilSurface,
} from './foilFx';

export function FoilWrap({
  rarity,
  obtained,
  children,
}: {
  rarity: number;
  obtained: boolean;
  children: ReactNode;
}): ReactNode {
  const kind: FoilKind | null = rarity === 2 || rarity === 3 ? rarity : null;
  const reduced = prefersReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<FoilSurface | null>(null);
  const rectRef = useRef<DOMRect | null>(null);
  const originRef = useRef<{ x: number; y: number } | null>(null);
  const draggedRef = useRef(false);

  const show = Boolean(obtained && kind);

  useEffect(() => {
    if (!show || reduced || !ref.current || !kind) return;
    const surface: FoilSurface = {
      el: ref.current,
      kind,
      cx: 0,
      cy: 0,
      pointerActive: false,
    };
    surfaceRef.current = surface;
    const recache = () => {
      if (ref.current) rectRef.current = cacheRect(ref.current);
    };
    recache();
    foilFx.register(surface);
    window.addEventListener('resize', recache);
    window.addEventListener('scroll', recache, true);
    return () => {
      foilFx.unregister(surface);
      window.removeEventListener('resize', recache);
      window.removeEventListener('scroll', recache, true);
      surfaceRef.current = null;
    };
  }, [show, reduced, kind]);

  if (!show || !kind) return children;

  const recache = () => {
    if (ref.current) rectRef.current = cacheRect(ref.current);
  };

  const track = (e: PointerEvent<HTMLDivElement>, activate: boolean) => {
    if (reduced || kind !== 3) return;
    const surface = surfaceRef.current;
    if (!surface) return;
    if (!rectRef.current) recache();
    const rect = rectRef.current;
    if (!rect) return;
    const { cx, cy } = offsetsFromRect(rect, e.clientX, e.clientY);
    surface.cx = cx;
    surface.cy = cy;
    if (activate) surface.pointerActive = true;
  };

  const onPointerEnter = (e: PointerEvent<HTMLDivElement>) => {
    recache();
    track(e, false);
    if (!reduced && kind === 3 && surfaceRef.current) {
      // Hover follows the pointer (desktop). Touch waits for a move past the threshold.
      if (e.pointerType !== 'touch') surfaceRef.current.pointerActive = true;
    }
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    recache();
    originRef.current = { x: e.clientX, y: e.clientY };
    draggedRef.current = false;
    track(e, false);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (originRef.current) {
      const dx = e.clientX - originRef.current.x;
      const dy = e.clientY - originRef.current.y;
      if (dx * dx + dy * dy >= FOIL_DRAG_THRESHOLD_PX * FOIL_DRAG_THRESHOLD_PX) {
        draggedRef.current = true;
        track(e, true);
        return;
      }
    }
    track(e, surfaceRef.current?.pointerActive ?? false);
  };

  const endPointer = () => {
    originRef.current = null;
    const surface = surfaceRef.current;
    if (surface) {
      surface.pointerActive = false;
      surface.cx = 0;
      surface.cy = 0;
    }
  };

  const onClickCapture = (e: MouseEvent<HTMLDivElement>) => {
    if (!draggedRef.current) return;
    draggedRef.current = false;
    e.preventDefault();
    e.stopPropagation();
  };

  const restSpec = kind === 3 ? FOIL_SPEC_REST : FOIL_SWEEP_FROM;

  return (
    <div
      ref={ref}
      className={`foil${reduced ? ' foil-still' : ''}`}
      data-foil={kind}
      data-testid="foil-wrap"
      style={
        {
          '--spec': `${restSpec}%`,
          '--rx': '0deg',
          '--ry': '0deg',
          '--foil-a': '210deg',
        } as CSSProperties
      }
      onPointerEnter={onPointerEnter}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerLeave={endPointer}
      onPointerCancel={endPointer}
      onPointerUp={endPointer}
      onClickCapture={onClickCapture}
    >
      {children}
      {!reduced && (
        <>
          <span className="foil-holo" aria-hidden="true" />
          <span className="foil-spec" aria-hidden="true" />
        </>
      )}
    </div>
  );
}
