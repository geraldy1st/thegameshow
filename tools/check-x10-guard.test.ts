import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { hasNonNotificationRequestPermission, normalizeForGuard } from './check-no-test-hook.mjs';

const SCRIPT = 'tools/check-no-test-hook.mjs';

function run(dir: string, allow?: string[], src?: string) {
  const env = { ...process.env, X10_GUARD_SRC: src ?? '' };
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
  for (const [name, body] of Object.entries(contents)) {
    const path = join(dir, name);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, body);
  }
  return dir;
}

describe('normalizeForGuard (DEF-GS-66)', () => {
  it('folds typographic apostrophes, NBSP, and optional chaining', () => {
    expect(normalizeForGuard('rien n\u2019est gagné')).toBe("rien n'est gagné");
    expect(normalizeForGuard('Mode\u00A0démo')).toBe('Mode démo');
    expect(normalizeForGuard('DeviceOrientationEvent?.requestPermission?.()')).toBe(
      'DeviceOrientationEvent.requestPermission.()',
    );
  });

  it('flags requestPermission that is not Notification.requestPermission', () => {
    expect(hasNonNotificationRequestPermission('Notification.requestPermission()')).toBe(false);
    expect(
      hasNonNotificationRequestPermission('window.DeviceOrientationEvent?.requestPermission?.()'),
    ).toBe(true);
    expect(
      hasNonNotificationRequestPermission(
        'const DOE = window.DeviceOrientationEvent; DOE.requestPermission()',
      ),
    ).toBe(true);
  });
});

describe('R-X10-15 / DEF-GS-66 build guard', () => {
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
    ['Lot 2★', 'label: "Lot 2★"', 'x10 proto demo menu'],
    ['Lot 3★', 'label: "Lot 3★"', 'x10 proto demo menu'],
    ['Démo / proto', '"Démo / proto — ne fait pas partie du jeu"', 'x10 proto demo menu'],
    ['forceBest', 'open({ forceBest: 3 })', 'x10 proto demo menu'],
    ['Essai 1★', 'console.log("Essai 1★")', 'atelier demo copy'],
    ['Essai 2★', 'console.log("Essai 2★")', 'atelier demo copy'],
    ['Essai 3★', 'console.log("Essai 3★")', 'atelier demo copy'],
    [
      'straight-apostrophe Atelier copy',
      'console.log("Démo : résultat d\'essai, rien n\'est gagné ni enregistré.")',
      'atelier demo copy',
    ],
    [
      'typographic-apostrophe Atelier copy',
      'console.log("Démo : résultat d\u2019essai, rien n\u2019est gagné ni enregistré.")',
      'atelier demo copy',
    ],
    [
      'NBSP Atelier copy',
      'console.log("rien n\u2019est\u00A0gagné ni enregistré")',
      'atelier demo copy',
    ],
    [
      'DeviceOrientationEvent.requestPermission',
      'DeviceOrientationEvent.requestPermission()',
      'DeviceOrientationEvent.requestPermission',
    ],
    [
      'optional-chaining requestPermission',
      'window.DeviceOrientationEvent?.requestPermission?.()',
      'requestPermission',
    ],
    [
      'alias requestPermission',
      'const DOE = window.DeviceOrientationEvent; DOE.requestPermission()',
      'requestPermission',
    ],
  ])('fails when the bundle contains %s', (_label, body, named) => {
    const dir = seed({ 'app.js': `/* mutant */ ${body}\n` });
    try {
      const r = run(dir);
      expect(r.status, r.stderr + r.stdout).toBe(1);
      expect(r.stderr).toContain(named);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects atelier copy while the allow list is empty, and still rejects proto hooks if atelier is allowed', () => {
    const atelier = seed({ 'app.js': 'button: "Mode démo"\n' });
    const proto = seed({ 'app.js': 'window.__x10.open({demo:true})\n' });
    const perm = seed({ 'app.js': 'window.DeviceOrientationEvent?.requestPermission?.()\n' });
    try {
      const blocked = run(atelier);
      expect(blocked.status).toBe(1);
      expect(blocked.stderr).toContain('atelier demo copy');

      const lifted = run(atelier, ['atelier']);
      expect(lifted.status, lifted.stderr + lifted.stdout).toBe(0);

      const still = run(proto, ['atelier']);
      expect(still.status).toBe(1);
      expect(still.stderr).toContain('x10 proto hook');

      const stillPerm = run(perm, ['atelier']);
      expect(stillPerm.status).toBe(1);
      expect(stillPerm.stderr).toMatch(/requestPermission/);
    } finally {
      rmSync(atelier, { recursive: true, force: true });
      rmSync(proto, { recursive: true, force: true });
      rmSync(perm, { recursive: true, force: true });
    }
  });

  it('scans source files (tests excluded) when X10_GUARD_SRC is set', () => {
    const dist = seed({ 'app.js': 'const ok = 1;\n' });
    const src = seed({
      'foil.ts': 'window.DeviceOrientationEvent?.requestPermission?.();\n',
      'foil.test.ts': 'window.__x10 = 1;\n',
    });
    try {
      const clean = run(dist, undefined, '');
      expect(clean.status, clean.stderr + clean.stdout).toBe(0);
      const hit = run(dist, undefined, src);
      expect(hit.status).toBe(1);
      expect(hit.stderr).toMatch(/requestPermission/);
      expect(hit.stderr).not.toContain('foil.test.ts');
    } finally {
      rmSync(dist, { recursive: true, force: true });
      rmSync(src, { recursive: true, force: true });
    }
  });
});
