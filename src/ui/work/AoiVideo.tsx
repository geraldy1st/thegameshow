import { playVideo } from './media';
import { useEffect, useRef, useState } from 'react';

export type AoiState = 'work' | 'think' | 'joy';
const STATES: readonly AoiState[] = ['work', 'think', 'joy'];
const base = `${import.meta.env.BASE_URL}game/work/`;
/** Opening frame for work, last frame for think / joy (§6). */
const stillOf = (s: AoiState) => `${base}aoi-${s}-${s === 'work' ? 'start' : 'end'}.webp`;
const posterOf = (s: AoiState) => `${base}aoi-${s}-start.webp`;
const srcOf = (s: AoiState) => `${base}aoi-${s}.mp4`;

/**
 * Aoi at her computer (ARCHITECTURE-LOT4 §6). Decoration only: a failed play, a slow network or
 * reduced motion never changes the gameplay.
 * - still: the WebP of the state, no video requested at all;
 * - otherwise one <video> per state, its `src` set on first use only (think / joy on demand),
 *   at most one play() per state change, a rejected play() keeps the poster (no retry);
 * - hidden tab: pause; leaving #work: every src removed and load() (no request left).
 */
export function AoiVideo({ state, still }: { state: AoiState; still: boolean }) {
  const refs = useRef<Partial<Record<AoiState, HTMLVideoElement | null>>>({});
  const [used, setUsed] = useState<readonly AoiState[]>([state]);

  // Adjusting state while rendering (React docs pattern): a state is mounted on first use.
  if (!still && !used.includes(state)) setUsed([...used, state]);

  useEffect(() => {
    if (still) return;
    for (const s of STATES) {
      const v = refs.current[s];
      if (!v) continue;
      if (s === state) {
        if (s !== 'work') v.currentTime = 0;
        if (document.visibilityState === 'visible') {
          try {
            void playVideo(v).catch(() => undefined);
          } catch {
            /* play() refused: the poster stays */
          }
        }
      } else if (!v.paused) v.pause();
    }
  }, [state, still, used]);

  useEffect(() => {
    if (still) return;
    const onVis = () => {
      const v = refs.current[state];
      if (!v) return;
      if (document.visibilityState === 'hidden') v.pause();
      else void playVideo(v).catch(() => undefined);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [state, still]);

  useEffect(() => {
    const videos = refs.current;
    return () => {
      for (const v of Object.values(videos)) {
        if (!v) continue;
        v.pause();
        v.removeAttribute('src');
        v.load();
      }
    };
  }, []);

  if (still) {
    return (
      <div className="work-bg" aria-hidden="true">
        <img className="ws on" src={stillOf(state)} alt="" width={480} height={884} />
      </div>
    );
  }
  return (
    <div className="work-bg" aria-hidden="true">
      {used.map((s) => (
        <video
          key={s}
          ref={(el) => {
            refs.current[s] = el;
          }}
          className={`ws ${s === state ? 'on' : ''}`}
          src={srcOf(s)}
          poster={posterOf(s)}
          muted
          playsInline
          loop={s !== 'joy'}
          preload={s === 'work' ? 'metadata' : 'none'}
          disablePictureInPicture
          tabIndex={-1}
        />
      ))}
    </div>
  );
}
