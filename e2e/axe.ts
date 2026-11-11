import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { Page } from '@playwright/test';

const axeSource = readFileSync(
  createRequire(import.meta.url).resolve('axe-core/axe.min.js'),
  'utf8',
);

/** Wait for each <dialog>'s own intro animation (DEF-GS-37 / R-052D-07). Not descendants. */
export async function waitForDialogAnimations(page: Page) {
  await page.evaluate(async () => {
    const anims = [...document.querySelectorAll('dialog')].flatMap((d) => d.getAnimations());
    await Promise.all(anims.map((a) => a.finished.catch(() => undefined)));
  });
}

export async function axeViolations(page: Page) {
  await waitForDialogAnimations(page);
  await page.addScriptTag({ content: axeSource });
  return page.evaluate(async () => {
    const w = window as unknown as {
      axe: {
        run: (opts?: { rules?: Record<string, { enabled: boolean }> }) => Promise<{
          violations: { id: string; nodes: { target: string[]; failureSummary: string }[] }[];
        }>;
      };
    };
    // 0.5.2 R-052-04: Geraldy accepted blocking page zoom (WCAG 1.4.4 deviation).
    return (await w.axe.run({ rules: { 'meta-viewport': { enabled: false } } })).violations.map(
      (v) =>
        `${v.id}: ${v.nodes.map((n) => `${n.target.join(' ')} ${n.failureSummary}`).join(' | ')}`,
    );
  });
}
