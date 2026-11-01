#!/usr/bin/env node
/* global window, indexedDB */
// GS-V5-65 end to end across two builds on the SAME origin (OD-18 v1.3):
//   lot 4 save (v4)  --open with 0.3.2-->  v3 + backup-before-downgrade-v4  --open with lot 4-->  v4, work restored.
// Usage: node tools/gs-v5-65-cross.mjs <dist-test of 0.3.2> <dist-test of lot 4> [chromium|webkit]
// Both directories are test-harness builds (`?now=` freezes the clock). Nothing is deployed.
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { chromium, webkit } from '@playwright/test';

const [hotfixDir, lot4Dir, engine = 'chromium'] = process.argv.slice(2);
if (!hotfixDir || !lot4Dir) {
  console.error('usage: gs-v5-65-cross.mjs <0.3.2 dist-test> <lot 4 dist-test> [chromium|webkit]');
  process.exit(2);
}
const PORT = 4190;
const BASE = `http://localhost:${PORT}/thegameshow/`;
const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.mp4': 'video/mp4',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

function serve(dir) {
  const root = resolve(dir);
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', BASE);
    let p = decodeURIComponent(url.pathname).replace(/^\/thegameshow\/?/, '');
    if (p === '' || p === '__seed') p = p === '__seed' ? '' : 'index.html';
    if (url.pathname.endsWith('__seed')) {
      res.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><title>seed</title>');
      return;
    }
    try {
      const body = readFileSync(join(root, p));
      res
        .writeHead(200, { 'content-type': TYPES[extname(p)] ?? 'application/octet-stream' })
        .end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((ok) => server.listen(PORT, () => ok(server)));
}
const idb = (page, fn, arg) => page.evaluate(fn, arg);
const seedFn = ({ slots }) =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open('thegameshow', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('saves');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const tx = req.result.transaction('saves', 'readwrite');
      for (const [k, v] of Object.entries(slots)) tx.objectStore('saves').put(v, k);
      tx.oncomplete = () => (req.result.close(), resolve());
    };
  });
const getFn = (key) =>
  new Promise((resolve) => {
    const req = indexedDB.open('thegameshow', 1);
    req.onsuccess = () => {
      const g = req.result.transaction('saves').objectStore('saves').get(key);
      g.onsuccess = () => (req.result.close(), resolve(g.result));
    };
  });
const BOOK = new Set(['schemaVersion', 'revision', 'lastSeenAt', 'maxSeenAt', 'work']);
const v3 = (o) =>
  JSON.stringify(
    Object.fromEntries(
      Object.entries(o)
        .filter(([k]) => !BOOK.has(k))
        .sort(),
    ),
  );

const dir = 'src/save/__fixtures__/gs-v5-65';
let failures = 0;
for (const f of readdirSync(dir).sort()) {
  const fx = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const v4 = fx.slots.current;
  const profile = mkdtempSync(join(tmpdir(), 'gs65-'));
  const ctx = await (engine === 'webkit' ? webkit : chromium).launchPersistentContext(profile, {
    viewport: { width: 360, height: 640 },
  });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const check = (ok, what) => {
    if (!ok) failures++;
    console.log(`${ok ? 'OK ' : 'KO '} ${f}: ${what}`);
  };
  let server = await serve(hotfixDir);
  await page.goto(`${BASE}__seed`);
  await idb(page, seedFn, fx);
  await page.goto(`${BASE}?now=${v4.maxSeenAt}`);
  const t0 = Date.now();
  let cur;
  while (Date.now() - t0 < 10000 && (cur = await idb(page, getFn, 'current'))?.schemaVersion !== 3)
    await page.waitForTimeout(100);
  const kept = await idb(page, getFn, 'backup-before-downgrade-v4');
  check(
    cur.schemaVersion === 3 && cur.work === undefined && v3(cur) === v3(v4),
    '0.3.2: v3 fields deep-equal, work dropped',
  );
  check(
    JSON.stringify(kept) === JSON.stringify(v4),
    '0.3.2: raw v4 kept in backup-before-downgrade-v4',
  );
  await page.goto('about:blank');
  await new Promise((ok) => server.close(ok));
  server = await serve(lot4Dir);
  await page.goto(`${BASE}?now=${v4.maxSeenAt}`);
  await page.waitForFunction(() => !!window.__TGS_TEST__?.state());
  const g = await page.evaluate(() => window.__TGS_TEST__.state());
  check(
    g.schemaVersion === 4 && JSON.stringify(g.work) === JSON.stringify(v4.work) && v3(g) === v3(v4),
    'lot 4 again: work restored, v3 fields unchanged',
  );
  check(errors.length === 0, `no page error (${errors.join(' | ')})`);
  await ctx.close();
  await new Promise((ok) => server.close(ok));
  rmSync(profile, { recursive: true, force: true });
}
console.log(failures ? `GS-V5-65 cross-build: ${failures} KO` : 'GS-V5-65 cross-build: all OK');
process.exit(failures ? 1 : 0);
