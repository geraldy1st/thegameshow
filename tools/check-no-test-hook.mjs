// Fails if the production build contains the test harness (SPEC-ADDENDUM RES-11),
// payment APIs (ethics rule 5) or push notification APIs (ethics rule 11).
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] ?? 'dist';
if (!existsSync(dir)) {
  console.error(`${dir}/ not found: run the production build first`);
  process.exit(1);
}
const FORBIDDEN = [
  ['test harness', /__TGS_TEST__|installTestHook|test-harness/],
  ['payment API (ethics rule 5)', /PaymentRequest|stripe|checkout\.js/i],
  ['push notifications (ethics rule 11)', /Notification\.requestPermission|pushManager/],
];
const files = [];
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(js|html|css|json|webmanifest)$/.test(p)) files.push(p);
  }
};
walk(dir);
let failed = false;
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const [label, re] of FORBIDDEN) {
    if (re.test(text)) {
      console.error(`FAIL ${label}: ${file}`);
      failed = true;
    }
  }
}
if (failed) process.exit(1);
console.log(`OK: ${files.length} files in ${dir}/ free of test hook, payment and push APIs`);
