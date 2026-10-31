// R16: the 600 KB fake image of the budget gauge test must never reach a deployable build.
// Fails if dist/ contains a `budget-fake*` file or any file larger than the home budget
// (500 KB, 1 KB = 1 000 bytes).
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] ?? 'dist';
const LIMIT = 500_000;
if (!existsSync(dir)) {
  console.error(`${dir}/ not found: run the production build first`);
  process.exit(1);
}
const bad = [];
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else if (/budget-fake/i.test(f)) bad.push(`${p}: budget gauge fake file`);
    else if (st.size > LIMIT) bad.push(`${p}: ${st.size} bytes > ${LIMIT}`);
  }
};
walk(dir);
if (bad.length) {
  for (const b of bad) console.error(`FAIL ${b}`);
  process.exit(1);
}
console.log(`OK: ${dir}/ has no budget-fake file and no file over ${LIMIT} bytes`);
