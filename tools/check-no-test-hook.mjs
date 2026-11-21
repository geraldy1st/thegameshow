// Fails if the production build contains the test harness (SPEC-ADDENDUM RES-11),
// payment APIs (ethics rule 5) or push notification APIs (ethics rule 11).
// R-X10-15 / DEF-GS-66: also rejects ×10 proto hooks, demo-menu copy (normalised)
// and any non-Notification requestPermission (optional chaining, aliases included).
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Fold typographic apostrophes, NBSP, and `?.` so minified / FR typography still match. */
export function normalizeForGuard(text) {
  return text
    .replace(/[\u00A0\u202F\u2007\u2060]/g, ' ')
    .replace(/[\u2018\u2019\u201B\u2032]/g, "'")
    .replace(/\?\./g, '.');
}

export function hasNonNotificationRequestPermission(text) {
  const stripped = normalizeForGuard(text).replace(/Notification\s*\.\s*requestPermission/g, '');
  return /requestPermission/.test(stripped);
}

const isCli =
  Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isCli) {
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
    // Always forbidden, even if tools/x10-demo-allow.json later lists a named demo feature.
    ['x10 proto hook', /__x10/],
    ['x10 proto demo menu', /Lot [123]★|Démo \/ proto|forceBest/],
    ['DeviceOrientationEvent.requestPermission', /DeviceOrientationEvent\s*\.\s*requestPermission/],
  ];

  const ALLOW_PATH = process.env.X10_DEMO_ALLOW ?? 'tools/x10-demo-allow.json';
  const allowed = new Set(
    existsSync(ALLOW_PATH) ? JSON.parse(readFileSync(ALLOW_PATH, 'utf8')) : [],
  );
  const OPTIONAL_DEMO = [
    {
      id: 'atelier',
      checks: [['atelier demo copy', /Mode démo|Essai [123]★|rien n'est gagné ni enregistré/]],
    },
  ];
  for (const feat of OPTIONAL_DEMO) {
    if (allowed.has(feat.id)) continue;
    FORBIDDEN.push(...feat.checks);
  }

  const files = [];
  const walk = (d, acc, ext = /\.(js|html|css|json|webmanifest|ts|tsx|mjs|cjs)$/) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p, acc, ext);
      else if (ext.test(p)) acc.push(p);
    }
  };
  walk(dir, files);

  const isTest = (p) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(p);
  const srcRoot = process.env.X10_GUARD_SRC ?? (existsSync('src') ? 'src' : '');

  const X10_LABELS = new Set([
    'x10 proto hook',
    'x10 proto demo menu',
    'DeviceOrientationEvent.requestPermission',
    'atelier demo copy',
  ]);

  let failed = false;
  const checkFile = (file, { skipTests = false, x10Only = false } = {}) => {
    if (skipTests && (isTest(file) || /(?:^|\/)testHarness\.[cm]?[jt]sx?$/.test(file))) return;
    const text = normalizeForGuard(readFileSync(file, 'utf8'));
    for (const [label, re] of FORBIDDEN) {
      if (x10Only && !X10_LABELS.has(label)) continue;
      if (re.test(text)) {
        console.error(`FAIL ${label}: ${file}`);
        failed = true;
      }
    }
    if (hasNonNotificationRequestPermission(text)) {
      console.error(`FAIL non-Notification requestPermission: ${file}`);
      failed = true;
    }
  };

  for (const file of files) checkFile(file);

  if (srcRoot && existsSync(srcRoot)) {
    const srcFiles = [];
    walk(srcRoot, srcFiles, /\.(js|ts|tsx|mjs|cjs)$/);
    for (const file of srcFiles) checkFile(file, { skipTests: true, x10Only: true });
  }

  if (failed) process.exit(1);
  console.log(`OK: ${files.length} files in ${dir}/ free of test hook, payment and push APIs`);
}
