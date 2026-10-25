import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { Page } from '@playwright/test';

const axeSource = readFileSync(
  createRequire(import.meta.url).resolve('axe-core/axe.min.js'),
  'utf8',
);

export async function axeViolations(page: Page) {
  await page.addScriptTag({ content: axeSource });
  return page.evaluate(async () => {
    const w = window as unknown as {
      axe: {
        run: () => Promise<{
          violations: { id: string; nodes: { target: string[]; failureSummary: string }[] }[];
        }>;
      };
    };
    return (await w.axe.run()).violations.map(
      (v) =>
        `${v.id}: ${v.nodes.map((n) => `${n.target.join(' ')} ${n.failureSummary}`).join(' | ')}`,
    );
  });
}
