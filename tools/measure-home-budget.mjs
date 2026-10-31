/* global window */
// Home budget (GS-V5-02, QA v1.3 §7, D7): sum of transferSize (encodedBodySize when 0) of the
// navigation and every resource loaded until performance.mark('tgs:home-ready') + 500 ms.
// Production build served gzip like Pages, Chromium, empty cache, new context, 360x640,
// no service worker, prefers-reduced-motion: no-preference. 1 KB = 1 000 bytes (R16).
// Usage: node tools/measure-home-budget.mjs [dir=dist] [--expect-fail]
import { chromium } from '@playwright/test';
import { serveGzip } from './serve-gzip.mjs';

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith('--')) ?? 'dist';
const expectFail = args.includes('--expect-fail');
const LIMIT = 500_000;

const server = await serveGzip(dir);
const { port } = server.address();
const browser = await chromium.launch();
let total;
let rows;
try {
  const context = await browser.newContext({
    viewport: { width: 360, height: 640 },
    serviceWorkers: 'block',
    reducedMotion: 'no-preference',
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${port}/thegameshow/`);
  await page.waitForFunction(
    () => performance.getEntriesByName('tgs:home-ready').length > 0,
    null,
    {
      timeout: 30_000,
    },
  );
  await page.waitForLoadState('load');
  await page.waitForTimeout(500);
  rows = await page.evaluate(() =>
    [
      ...performance.getEntriesByType('navigation'),
      ...performance.getEntriesByType('resource'),
    ].map((e) => ({
      name: e.name.replace(window.location.origin, ''),
      bytes: e.transferSize || e.encodedBodySize,
    })),
  );
  total = rows.reduce((s, r) => s + r.bytes, 0);
  if (errors.length) throw new Error(`page errors: ${errors.join(' | ')}`);
} finally {
  await browser.close();
  server.close();
}
for (const r of rows.sort((a, b) => b.bytes - a.bytes))
  console.log(`${String(r.bytes).padStart(8)}  ${r.name}`);
const over = total > LIMIT;
console.log(
  `home budget: ${total} bytes (${(total / 1000).toFixed(1)} KB) / ${LIMIT} — ${over ? 'OVER' : 'OK'}`,
);
if (expectFail) {
  if (!over) {
    console.error('FAIL: the gauge did not catch the 600 KB fake image');
    process.exit(1);
  }
  console.log('OK: the gauge fails as expected on the fake build');
} else if (over) process.exit(1);
