import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const SCRIPT = 'tools/check-no-test-hook.mjs';

function run(dir: string, allow?: string[]) {
  const env = { ...process.env };
  if (allow) {
    const allowFile = join(dir, 'allow.json');
    writeFileSync(allowFile, JSON.stringify(allow));
    env.X10_DEMO_ALLOW = allowFile;
  } else {
    env.X10_DEMO_ALLOW = 'tools/x10-demo-allow.json';
  }
  return spawnSync(process.execPath, [SCRIPT, dir], { encoding: 'utf8', env });
}

function seed(contents: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'x10-guard-'));
  for (const [name, body] of Object.entries(contents)) writeFileSync(join(dir, name), body);
  return dir;
}

describe('R-X10-15 build guard (mutant G1)', () => {
  it('the default allow list is empty', async () => {
    const { readFileSync } = await import('node:fs');
    expect(JSON.parse(readFileSync('tools/x10-demo-allow.json', 'utf8'))).toEqual([]);
  });

  it('passes on a clean bundle', () => {
    const dir = seed({ 'app.js': 'const ok = 1; console.log(ok);\n' });
    try {
      const r = run(dir);
      expect(r.status, r.stderr + r.stdout).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each([
    ['__x10', 'window.__x10.open({demo:true})', 'x10 proto hook'],
    ['Lot 1★', 'label: "Lot 1★"', 'x10 proto demo menu'],
    ['Démo / proto', '"Démo / proto — ne fait pas partie du jeu"', 'x10 proto demo menu'],
    ['forceBest', 'open({ forceBest: 3 })', 'x10 proto demo menu'],
    [
      'DeviceOrientationEvent.requestPermission',
      'DeviceOrientationEvent.requestPermission()',
      'DeviceOrientationEvent.requestPermission',
    ],
  ])('fails when the bundle contains %s', (_label, body, named) => {
    const dir = seed({ 'app.js': `/* mutant */ ${body}\n` });
    try {
      const r = run(dir);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain(named);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects atelier copy while the allow list is empty, and still rejects proto hooks if atelier is allowed', () => {
    const atelier = seed({ 'app.js': 'button: "Mode démo"\n' });
    const proto = seed({ 'app.js': 'window.__x10.open({demo:true})\n' });
    try {
      const blocked = run(atelier);
      expect(blocked.status).toBe(1);
      expect(blocked.stderr).toContain('atelier demo copy');

      const lifted = run(atelier, ['atelier']);
      expect(lifted.status, lifted.stderr + lifted.stdout).toBe(0);

      const still = run(proto, ['atelier']);
      expect(still.status).toBe(1);
      expect(still.stderr).toContain('x10 proto hook');
    } finally {
      rmSync(atelier, { recursive: true, force: true });
      rmSync(proto, { recursive: true, force: true });
    }
  });
});
