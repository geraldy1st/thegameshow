// Budget gauge test (QA v1.3 §7, R16): copies dist/ to dist-budget-fake/ and injects into the
// home an incompressible fake image of 600 000 random bytes. Never written to public/ nor dist/.
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const OUT = 'dist-budget-fake';
rmSync(OUT, { recursive: true, force: true });
cpSync('dist', OUT, { recursive: true });
writeFileSync(`${OUT}/budget-fake.webp`, randomBytes(600_000));
const html = readFileSync(`${OUT}/index.html`, 'utf8');
const tag = '<img src="/thegameshow/budget-fake.webp" alt="" width="1" height="1">';
if (!html.includes('<div id="root">')) throw new Error('index.html: #root not found');
writeFileSync(`${OUT}/index.html`, html.replace('<div id="root">', `${tag}<div id="root">`));
console.log(`${OUT}/ ready with a 600 000-byte fake image`);
