/* global document */
// Travailler entry budget (GS-V5-55, OD-10, R-L4-4, R-L4-13). Production build served gzip like
// Pages, Chromium, empty cache, 360x640, no service worker. Bytes = CDP encodedDataLength of every
// finished response, 206 Range responses included. 1 KB = 1 000 bytes.
//   default : from the home (cache warm): delta between tgs:home-ready and the end of the
//             Travailler measurement (canplaythrough of the visible video, or the still picture
//             loaded, then 1 s without network). Limit 200 000 (150 000 with --still).
//   --direct: cold load of #work, everything until the same end. Limit 530 000.
//   --still : prefers-reduced-motion: reduce (still pictures, no video).
// Usage: node tools/measure-budget.mjs [dir=dist] --screen work [--still] [--direct] [--expect-fail]
import { chromium } from '@playwright/test';
import { serveGzip } from './serve-gzip.mjs';

const args = process.argv.slice(2);
const dir = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--screen') ?? 'dist';
const screen = args[args.indexOf('--screen') + 1];
if (screen !== 'work') {
  console.error('usage: --screen work (the home budget is tools/measure-home-budget.mjs)');
  process.exit(2);
}
const still = args.includes('--still');
const direct = args.includes('--direct');
const expectFail = args.includes('--expect-fail');
const LIMIT = direct ? 530_000 : still ? 150_000 : 200_000;

const server = await serveGzip(dir);
const { port } = server.address();
const base = `http://127.0.0.1:${port}/thegameshow/`;
// Google Chrome, not Playwright's Chromium: the latter has no H.264 decoder and would never reach
// canplaythrough (Chrome is preinstalled on the GitHub ubuntu runners).
const browser = await chromium.launch({ channel: process.env.BUDGET_CHANNEL ?? 'chrome' });
const rows = [];
let total;
try {
  const context = await browser.newContext({
    viewport: { width: 360, height: 640 },
    serviceWorkers: 'block',
    reducedMotion: still ? 'reduce' : 'no-preference',
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: false });
  const urls = new Map();
  let counting = direct;
  let lastActivity = Date.now();
  let inflight = 0;
  cdp.on('Network.requestWillBeSent', (e) => {
    urls.set(e.requestId, e.request.url.replace(base, '/'));
    inflight++;
    lastActivity = Date.now();
  });
  const done = (e, bytes) => {
    inflight = Math.max(0, inflight - 1);
    lastActivity = Date.now();
    if (counting && bytes > 0) rows.push({ name: urls.get(e.requestId) ?? '?', bytes });
  };
  cdp.on('Network.loadingFinished', (e) => done(e, e.encodedDataLength));
  cdp.on('Network.loadingFailed', (e) => done(e, 0));

  if (direct) {
    await page.goto(`${base}#work`);
  } else {
    await page.goto(base);
    await page.waitForFunction(() => performance.getEntriesByName('tgs:home-ready').length > 0);
    await page.waitForLoadState('load');
    // Home settled: start counting at the tile press.
    while (inflight > 0 || Date.now() - lastActivity < 1000) await page.waitForTimeout(100);
    counting = true;
    await page.getByRole('button', { name: 'Travailler', exact: true }).click();
  }
  await page.waitForFunction(() => performance.getEntriesByName('tgs:work-ready').length > 0);
  await page.waitForFunction(
    (isStill) => {
      if (isStill) {
        const img = document.querySelector('.work-bg img.ws.on');
        return !!img && img.complete;
      }
      const v = document.querySelector('.work-bg video.ws.on');
      return !!v && v.readyState >= 4; // HAVE_ENOUGH_DATA, i.e. canplaythrough
    },
    still,
    { timeout: 30_000 },
  );
  if (still && (await page.locator('video[src]').count()) > 0)
    throw new Error('--still: a video source is mounted');
  while (inflight > 0 || Date.now() - lastActivity < 1000) await page.waitForTimeout(100);
  total = rows.reduce((s, r) => s + r.bytes, 0);
  if (errors.length) throw new Error(`page errors: ${errors.join(' | ')}`);
} finally {
  await browser.close();
  server.close();
}
for (const r of rows.sort((a, b) => b.bytes - a.bytes))
  console.log(`${String(r.bytes).padStart(8)}  ${r.name}`);
const over = total > LIMIT;
const label = `work${still ? ' --still' : ''}${direct ? ' --direct' : ''}`;
console.log(
  `${label} budget: ${total} bytes (${(total / 1000).toFixed(1)} KB) / ${LIMIT} — ${over ? 'OVER' : 'OK'}`,
);
if (!direct && !still && total > 190_000)
  console.log('NOTE: above 190 KB: switch to CRF 33 (OD-8, R-L4-13)');
if (expectFail) {
  if (!over) {
    console.error('FAIL: the gauge did not catch the 600 KB fake video');
    process.exit(1);
  }
  console.log('OK: the gauge fails as expected on the fake build');
} else if (over) process.exit(1);
