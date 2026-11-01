// Travailler budget gauge (GS-V5-55): copies dist/ to dist-budget-fake-work/ and replaces
// aoi-work.mp4 by a VALID H.264 video of random noise of at least 600 000 bytes (needs ffmpeg),
// so `measure-budget.mjs --screen work` must fail. Never written to public/ nor dist/.
import { cpSync, rmSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const OUT = 'dist-budget-fake-work';
rmSync(OUT, { recursive: true, force: true });
cpSync('dist', OUT, { recursive: true });
const file = `${OUT}/game/work/aoi-work.mp4`;
execFileSync('ffmpeg', [
  ...['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'nullsrc=s=480x884:d=4:r=24'],
  ...['-vf', 'geq=random(1)*255:128:128', '-an', '-c:v', 'libx264', '-b:v', '1250k'],
  ...['-pix_fmt', 'yuv420p', '-movflags', '+faststart', file],
]);
const size = statSync(file).size;
if (size < 600_000) throw new Error(`fake video too small: ${size}`);
console.log(`${OUT}/ ready with a ${size}-byte fake aoi-work.mp4`);
