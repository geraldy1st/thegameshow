// Real gauge (ARCHITECTURE-LOT4 §7 bis): check:no-test-hook must FAIL on the harness build
// and name every harness key it found.
import { spawnSync } from 'node:child_process';

const KEYS = [
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
];
const r = spawnSync('node', ['tools/check-no-test-hook.mjs', process.argv[2] ?? 'dist-test'], {
  encoding: 'utf8',
});
const missing = KEYS.filter((k) => !r.stderr.includes(`entry point ${k}:`));
if (r.status !== 1 || missing.length) {
  console.error(
    `FAIL harness not detected (status ${r.status}); keys not named: ${missing.join(', ')}`,
  );
  process.exit(1);
}
console.log(`OK: the harness build is rejected and all ${KEYS.length} keys are named`);
