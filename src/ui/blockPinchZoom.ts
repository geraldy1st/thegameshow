/** R-052-04: block iOS Safari pinch-zoom. No JS double-tap guard (would risk dropping Aoi taps). */
export function blockPinchZoom(target: EventTarget = document): void {
  const stop = (e: Event) => {
    e.preventDefault();
  };
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend'] as const) {
    target.addEventListener(ev, stop, { passive: false });
  }
}
