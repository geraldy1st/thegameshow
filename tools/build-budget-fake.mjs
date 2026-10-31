// Budget gauge test (QA v1.3 §7, R16): copies dist/ to dist-budget-fake/ and injects into the
// home an incompressible fake image of about 600 000 bytes: a VALID PNG of random pixels (stored,
// not deflated), so the browser downloads it fully (random bytes in a .webp were aborted by the
// decoder on CI and counted only ~70 KB). Never written to public/ nor dist/.
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { deflateSync, crc32 } from 'node:zlib';

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td) >>> 0);
  return Buffer.concat([len, td, crc]);
}
function noisePng(w, h) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const rows = [];
  for (let y = 0; y < h; y++) rows.push(Buffer.from([0]), randomBytes(w * 3));
  const idat = deflateSync(Buffer.concat(rows), { level: 0 });
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const OUT = 'dist-budget-fake';
rmSync(OUT, { recursive: true, force: true });
cpSync('dist', OUT, { recursive: true });
const png = noisePng(448, 448);
if (png.length < 600_000) throw new Error(`fake image too small: ${png.length}`);
writeFileSync(`${OUT}/budget-fake.png`, png);
const html = readFileSync(`${OUT}/index.html`, 'utf8');
const tag = '<img src="/thegameshow/budget-fake.png" alt="" width="1" height="1">';
if (!html.includes('<div id="root">')) throw new Error('index.html: #root not found');
writeFileSync(`${OUT}/index.html`, html.replace('<div id="root">', `${tag}<div id="root">`));
console.log(`${OUT}/ ready with a ${png.length}-byte fake image`);
