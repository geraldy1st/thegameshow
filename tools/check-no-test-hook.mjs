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
  // Harness entry points by name (DEF-GS-14): they must never reach production.
  // Lot 4 keys (ARCHITECTURE-LOT4 §7 bis): object properties survive minification.
  ...[
    'setEnergy',
    'setPity',
    'setTickets',
    'loadSave',
    'seedRng',
    'setVisibility',
    'setCursor',
    'boostShow',
    'boostPhase',
    'mediaOverride',
    'fadeRecorder',
    'createFadeRecorder',
  ].map((k) => [`test harness entry point ${k}`, new RegExp(`\\b${k}\\b`)]),
  ['payment API (ethics rule 5)', /PaymentRequest|stripe|checkout\.js/i],
  ['push notifications (ethics rule 11)', /Notification\.requestPermission|pushManager/],
  // R-X10-15 / GS-X10-15: ×10 proto hook, proto demo menu, and the iOS orientation
  // permission API must never ship in the player bundle. These stay forbidden even
  // if tools/x10-demo-allow.json later lists a named demo feature (e.g. "atelier").
  ['x10 proto hook', /__x10/],
  ['x10 proto demo menu', /Lot 1★|Démo \/ proto|forceBest/],
  ['DeviceOrientationEvent.requestPermission', /DeviceOrientationEvent\.requestPermission/],
];

// Explicit allow-list of *named* demo features (empty until QG-3). An id listed
// here never lifts the always-forbidden patterns above.
const ALLOW_PATH = process.env.X10_DEMO_ALLOW ?? 'tools/x10-demo-allow.json';
const allowed = new Set(existsSync(ALLOW_PATH) ? JSON.parse(readFileSync(ALLOW_PATH, 'utf8')) : []);
const OPTIONAL_DEMO = [
  {
    id: 'atelier',
    checks: [['atelier demo copy', /Mode démo|Essai 1★|rien n'est gagné ni enregistré/]],
  },
];
for (const feat of OPTIONAL_DEMO) {
  if (allowed.has(feat.id)) continue;
  FORBIDDEN.push(...feat.checks);
}
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
