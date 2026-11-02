import { playVideo } from './media';
import { useEffect, useRef, useState, type CSSProperties } from 'react';

export type AoiState = 'work' | 'think' | 'joy';
const base = `${import.meta.env.BASE_URL}game/work/`;
/** Opening frame for work, last frame for think / joy (§6). */
const stillOf = (s: AoiState) => `${base}aoi-${s}-${s === 'work' ? 'start' : 'end'}.webp`;
const posterOf = (s: AoiState) => `${base}aoi-${s}-start.webp`;
const srcOf = (s: AoiState) => `${base}aoi-${s}.mp4`;

/** Patch 0.4.3 (P6, R-P43-4): fade length and the longest wait for the incoming picture. */
export const FADE_MS = 400;
export const IMAGE_WAIT_MS = 1200;

/**
 * Aoi at her computer (ARCHITECTURE-LOT4 §6). Decoration only: a failed play, a slow network or
 * reduced motion never changes the gameplay.
 * - still: the WebP of the state, no video requested at all, instant switch;
 * - patch 0.4.3 (P6): crossfade without a bare frame. The outgoing layer stays opaque until
 *   the incoming one has a picture (`loadeddata` / `playing`, or its decoded poster, at most
 *   IMAGE_WAIT_MS); the incoming layer then fades in on top in FADE_MS, after which the
 *   outgoing one is paused. At most 2 <video> elements exist (so at most 2 with a src): the
 *   front one and either the fading / last outgoing one or the incoming one. A state change
 *   during a fade waits for the fade to end;
 * - a rejected play() keeps the poster (no retry);
 * - hidden tab: pause; leaving #work: every src removed and load() (no request left).
 */
export function AoiVideo({ state, still }: { state: AoiState; still: boolean }) {
  const refs = useRef<Partial<Record<AoiState, HTMLVideoElement | null>>>({});
  const [front, setFront] = useState<AoiState>(state);
  /** Fading out under `front` (still opaque) until the fade ends. */
  const [back, setBack] = useState<AoiState | null>(null);
  /** Last outgoing layer, paused and transparent, kept for a quick return. */
  const [spare, setSpare] = useState<AoiState | null>(null);
  // One stable callback ref per state: React only runs its cleanup when the element really
  // goes away (state dropped or #work left), so no request is left behind.
  const refFns = useRef<Partial<Record<AoiState, (el: HTMLVideoElement | null) => () => void>>>({});
  const refFor = (s: AoiState) =>
    (refFns.current[s] ??= (el) => {
      refs.current[s] = el;
      return () => {
        if (refs.current[s] === el) refs.current[s] = null;
        if (!el) return;
        el.pause();
        el.removeAttribute('src');
        el.load();
      };
    });
  const pending = !still && !back && state !== front ? state : null;
  const mounted: AoiState[] = [front];
  const second = back ?? pending ?? spare;
  if (second && second !== front) mounted.push(second);

  // The still picture is instant: the video layers follow the state directly.
  if (still && (front !== state || back)) {
    setFront(state);
    setBack(null);
  }

  // Front layer playing (first mount, and after each promotion).
  useEffect(() => {
    if (still) return;
    const v = refs.current[front];
    if (v && v.paused && document.visibilityState === 'visible') {
      try {
        void playVideo(v).catch(() => undefined);
      } catch {
        /* play() refused: the poster stays */
      }
    }
  }, [front, still]);

  // Incoming layer: start it, then promote it once it has a picture.
  useEffect(() => {
    if (!pending) return;
    const v = refs.current[pending];
    if (!v) return;
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      setBack(front);
      setSpare(null);
      setFront(pending);
    };
    if (pending !== 'work') v.currentTime = 0;
    if (document.visibilityState === 'visible') {
      try {
        void playVideo(v).catch(() => undefined);
      } catch {
        /* play() refused: the poster stays */
      }
    }
    const events = ['loadeddata', 'playing'] as const;
    if (v.readyState >= 2) queueMicrotask(go);
    else events.forEach((e) => v.addEventListener(e, go));
    const img = new Image();
    img.src = posterOf(pending);
    img.decode().then(go, () => undefined);
    const timer = setTimeout(go, IMAGE_WAIT_MS);
    return () => {
      done = true;
      events.forEach((e) => v.removeEventListener(e, go));
      clearTimeout(timer);
    };
  }, [pending, front]);

  // End of the fade: the outgoing layer is paused and becomes the transparent spare.
  useEffect(() => {
    if (!back) return;
    const id = setTimeout(() => {
      refs.current[back]?.pause();
      setSpare(back);
      setBack(null);
    }, FADE_MS + 50);
    return () => clearTimeout(id);
  }, [back]);

  useEffect(() => {
    if (still) return;
    const onVis = () => {
      const v = refs.current[front];
      if (!v) return;
      if (document.visibilityState === 'hidden') v.pause();
      else void playVideo(v).catch(() => undefined);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [front, still]);

  if (still) {
    return (
      <div className="work-bg" aria-hidden="true">
        <img className="ws on" src={stillOf(state)} alt="" width={480} height={884} />
      </div>
    );
  }
  return (
    <div
      className="work-bg"
      aria-hidden="true"
      style={{ '--ws-fade': `${FADE_MS}ms` } as CSSProperties}
    >
      {mounted.map((s) => (
        <video
          key={s}
          ref={refFor(s)}
          className={`ws ${s === front ? 'on front' : s === back ? 'on' : ''}`}
          data-state={s}
          src={srcOf(s)}
          poster={posterOf(s)}
          muted
          playsInline
          loop={s !== 'joy'}
          preload={s === 'work' ? 'metadata' : 'auto'}
          disablePictureInPicture
          tabIndex={-1}
        />
      ))}
    </div>
  );
}
