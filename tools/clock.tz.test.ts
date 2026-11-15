import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { localDay } from '../src/core/clock';

const root = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const isChild = process.env.TGS_TZ_CHILD === '1';

describe.skipIf(!isChild)('localDay in the process time zone', () => {
  it('keeps the local calendar day when it differs from UTC', () => {
    const morning = new Date(2026, 10, 16, 0, 30).getTime();
    const evening = new Date(2026, 10, 16, 22, 0).getTime();
    expect(localDay(morning)).toBe('2026-11-16');
    expect(localDay(evening)).toBe('2026-11-16');
    if (process.env.TZ === 'Pacific/Kiritimati') {
      expect(new Date(morning).getTimezoneOffset()).toBe(-840);
      expect(new Date(morning).toISOString().slice(0, 10)).toBe('2026-11-15');
    }
    if (process.env.TZ === 'America/Juneau') {
      expect(new Date(morning).getTimezoneOffset()).toBeGreaterThan(0);
      expect(new Date(evening).toISOString().slice(0, 10)).toBe('2026-11-17');
    }
  });
});

describe.skipIf(isChild)('R-I1-05 day computation under non-UTC zones', () => {
  function runInTz(tz: string) {
    const r = spawnSync(
      process.execPath,
      [path.join(root, 'node_modules/vitest/vitest.mjs'), 'run', 'tools/clock.tz.test.ts'],
      {
        cwd: root,
        env: { ...process.env, TZ: tz, TGS_TZ_CHILD: '1' },
        encoding: 'utf8',
      },
    );
    expect(r.status, `${tz}\n${r.stdout}\n${r.stderr}`).toBe(0);
  }

  it('Pacific/Kiritimati (UTC+14)', () => {
    runInTz('Pacific/Kiritimati');
  });

  it('America/Juneau (negative offset)', () => {
    runInTz('America/Juneau');
  });
});
