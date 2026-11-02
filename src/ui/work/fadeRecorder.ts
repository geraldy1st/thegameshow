/**
 * Frame-by-frame recorder of Aoi's video layers (patch 0.4.3, R-P43-4). Test build only: it is
 * reached through `__TGS_TEST__.fade`, never imported by the app itself.
 * Each animation frame records, for every `.ws` layer, its computed opacity and whether it has
 * a picture to show (video with readyState ≥ 2, or a loaded poster / image), then the coverage
 * 1 − Π(1 − αᵢ) over the layers that have a picture: below 0.99, the bare background shows.
 */
export interface FadeLayer {
  state: string;
  opacity: number;
  picture: boolean;
  playing: boolean;
  hasSrc: boolean;
  frames: number | null;
}
export interface FadeFrame {
  t: number;
  coverage: number;
  decoding: number;
  layers: FadeLayer[];
}

export function createFadeRecorder() {
  const posters = new Map<string, HTMLImageElement>();
  const posterReady = (url: string) => {
    if (!url) return false;
    let img = posters.get(url);
    if (!img) {
      img = new Image();
      img.src = url;
      posters.set(url, img);
    }
    return img.complete && img.naturalWidth > 0;
  };
  let frames: FadeFrame[] = [];
  let raf = 0;
  const sample = () => {
    const layers: FadeLayer[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('.work-bg .ws')) {
      const opacity = Number(getComputedStyle(el).opacity);
      if (el instanceof HTMLVideoElement) {
        const decoded = el.readyState >= 2;
        layers.push({
          state: el.dataset.state ?? el.currentSrc,
          opacity,
          picture: decoded || posterReady(el.poster),
          playing: !el.paused && decoded,
          hasSrc: el.hasAttribute('src'),
          frames: el.getVideoPlaybackQuality?.().totalVideoFrames ?? null,
        });
      } else {
        const img = el as HTMLImageElement;
        layers.push({
          state: img.currentSrc,
          opacity,
          picture: img.complete && img.naturalWidth > 0,
          playing: false,
          hasSrc: true,
          frames: null,
        });
      }
    }
    const coverage = 1 - layers.reduce((a, l) => a * (l.picture ? 1 - l.opacity : 1), 1);
    frames.push({
      t: performance.now(),
      coverage,
      decoding: layers.filter((l) => l.playing).length,
      layers,
    });
    raf = requestAnimationFrame(sample);
  };
  return {
    start() {
      frames = [];
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(sample);
    },
    stop(): FadeFrame[] {
      cancelAnimationFrame(raf);
      return frames;
    },
  };
}
