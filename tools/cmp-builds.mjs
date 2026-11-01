#!/usr/bin/env node
/* global window, indexedDB */
// §2.4 non-regression (R-LOT4-2, adopted from Crypto's recette-lot4/scripts/cmp-final.mjs): the same
// scenario played on two test-harness builds from the same lot 3 save; the final saves must match on
// every field except the bookkeeping ones and the lot 4 `work`.
// Usage: node tools/cmp-builds.mjs <reference dist-test> <candidate dist-test>
// Example: node tools/cmp-builds.mjs ../tgs-031/dist-test dist-test   (5894cb8 vs this branch)
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const [refDir, candDir] = process.argv.slice(2);
if (!refDir || !candDir) {
  console.error('usage: cmp-builds.mjs <reference dist-test> <candidate dist-test>');
  process.exit(2);
}
const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.mp4': 'video/mp4',
  '.woff2': 'font/woff2',
};
function serve(dir, port) {
  const root = resolve(dir);
  const server = createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname).replace(
      /^\/thegameshow\/?/,
      '',
    );
    if (p === '') p = 'index.html';
    try {
      res
        .writeHead(200, { 'content-type': TYPES[extname(p)] ?? 'application/octet-stream' })
        .end(readFileSync(join(root, p)));
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((ok) => server.listen(port, () => ok(server)));
}
const F = 'src/save/__fixtures__/recette-lot3/';
const v2 = JSON.parse(readFileSync(F + 'crypto-v2-midgame.json', 'utf8'));
const prev = JSON.parse(readFileSync(F + 'crypto-v2-midgame.previous.json', 'utf8'));
const marker = readFileSync(F + 'crypto-v2-midgame.marker.txt', 'utf8').trim();
const NOW = v2.maxSeenAt + 5 * 3_600_000;

const browser = await chromium.launch();
const out = [];
for (const [dir, port] of [
  [refDir, 4191],
  [candDir, 4192],
]) {
  const server = await serve(dir, port);
  const base = `http://localhost:${port}/thegameshow/`;
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    reducedMotion: 'reduce',
  });
  const p = await ctx.newPage();
  await p.goto(base + 'favicon.svg');
  await p.evaluate(
    ([slots, marker]) =>
      new Promise((r) => {
        localStorage.setItem('tgs-reveal-seen', marker);
        const q = indexedDB.open('thegameshow', 1);
        q.onupgradeneeded = () => q.result.createObjectStore('saves');
        q.onsuccess = () => {
          const tx = q.result.transaction('saves', 'readwrite');
          for (const [k, v] of Object.entries(slots)) tx.objectStore('saves').put(v, k);
          tx.oncomplete = () => (q.result.close(), r());
        };
      }),
    [{ current: v2, previous: prev }, marker],
  );
  await p.goto(base + `?now=${NOW}`);
  await p.waitForFunction(() => !!window.__TGS_TEST__?.state());
  await p.waitForTimeout(2600);
  await p.evaluate(() => window.__TGS_TEST__.seed(77));
  const rec = p.getByRole('button', { name: 'Récolter' });
  if (await rec.count()) await rec.first().click();
  const nav = p.getByRole('navigation');
  await nav.getByRole('button', { name: 'Associés' }).click();
  await p.waitForTimeout(500);
  await nav.getByRole('button', { name: 'Accueil' }).click();
  await p.evaluate(() => window.__TGS_TEST__.advance(60_000));
  await p.evaluate(() => window.__TGS_TEST__.flush?.());
  await p.waitForTimeout(1500);
  out.push(
    await p.evaluate(
      () =>
        new Promise((r) => {
          const q = indexedDB.open('thegameshow');
          q.onsuccess = () => {
            const g = q.result.transaction('saves').objectStore('saves').get('current');
            g.onsuccess = () => (q.result.close(), r(g.result));
          };
        }),
    ),
  );
  await ctx.close();
  await new Promise((ok) => server.close(ok));
}
await browser.close();
const BOOK = new Set(['schemaVersion', 'work', 'revision', 'lastSeenAt']);
const sortK = (o) =>
  Array.isArray(o)
    ? o.map(sortK)
    : o && typeof o === 'object'
      ? Object.fromEntries(
          Object.keys(o)
            .sort()
            .map((k) => [k, sortK(o[k])]),
        )
      : o;
const [a, c] = out;
const diff = Object.keys({ ...a, ...c }).filter(
  (k) => !BOOK.has(k) && JSON.stringify(sortK(a[k])) !== JSON.stringify(sortK(c[k])),
);
console.log(
  `versions ${a.schemaVersion} -> ${c.schemaVersion}, tickets ${a.tickets}/${c.tickets}, pity ${a.gacha.pity}/${c.gacha.pity}, yen ${a.yenCents}/${c.yenCents}`,
);
console.log(
  diff.length ? `§2.4 KO, fields differ: ${diff.join(', ')}` : '§2.4 OK: no field differs',
);
process.exit(diff.length ? 1 : 0);
