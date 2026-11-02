import { existsSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// Patch 0.4.3 P6 (GS-V5-89, R-P43-4, R-P43-15): real fades between Aoi's videos, measured
// frame by frame by __TGS_TEST__.fadeRecorder. Runs in Google Chrome only (project
// chrome-video): the bundled Chromium cannot decode H.264, so it would only see posters.
test.use({ baseURL: 'http://localhost:4181/thegameshow/' });
test.skip(
  !existsSync('/usr/bin/google-chrome') && !existsSync('/opt/google/chrome/chrome'),
  'Google Chrome is not installed: the H.264 fade cannot be measured',
);

type Frame = {
  t: number;
  coverage: number;
  decoding: number;
  layers: { state: string; opacity: number; playing: boolean; frames: number | null }[];
};

async function record(page: Page, energy: number, ms = 1800): Promise<Frame[]> {
  await page.evaluate(() => window.__TGS_TEST__!.fadeRecorder.start());
  await page.evaluate((n) => window.__TGS_TEST__!.setEnergy(n), energy);
  await page.waitForTimeout(ms);
  return page.evaluate(() => window.__TGS_TEST__!.fadeRecorder.stop() as Frame[]);
}

/** Duration of the incoming layer's opacity ramp (first frame > 0.02 to first frame ≥ 0.98). */
function fadeMs(frames: Frame[], state: string) {
  const op = (f: Frame) => f.layers.find((l) => l.state === state)?.opacity ?? 0;
  const a = frames.find((f) => op(f) > 0.02 && op(f) < 0.98);
  const b = frames.find((f) => a && f.t > a.t && op(f) >= 0.98);
  return a && b ? b.t - a.t : NaN;
}

for (const [from, to, energy] of [
  ['work', 'think', 5],
  ['think', 'work', 50],
] as const) {
  test(`${from} → ${to}: no bare frame, 400 ms fade, ≤ 2 decoding then 1`, async ({ page }) => {
    await page.goto('./#work');
    await page.waitForFunction(() => !!window.__TGS_TEST__?.state());
    if (from === 'think') {
      await page.evaluate(() => window.__TGS_TEST__!.setEnergy(5));
    }
    await expect(page.locator(`.work-bg video.front[data-state="${from}"]`)).toBeVisible();
    await page.waitForTimeout(1500);
    const frames = await record(page, energy);
    expect(frames.length).toBeGreaterThan(30);
    const minCov = Math.min(...frames.map((f) => f.coverage));
    expect(minCov).toBeGreaterThanOrEqual(0.99);
    // Fade measured on rAF timestamps; ± 50 ms plus one frame of sampling slack.
    const d = fadeMs(frames, to);
    expect(d).toBeGreaterThan(400 - 50 - 17);
    expect(d).toBeLessThan(400 + 50 + 17);
    expect(Math.max(...frames.map((f) => f.decoding))).toBeLessThanOrEqual(2);
    const last = frames.at(-1)!;
    expect(last.decoding).toBe(1);
    // The outgoing video is paused: its decoded frame count no longer moves.
    const out0 = frames.find((f) => f.t > last.t - 500)!.layers.find((l) => l.state === from);
    const out1 = last.layers.find((l) => l.state === from);
    if (out0 && out1) expect(out1.frames).toBe(out0.frames);
  });
}
