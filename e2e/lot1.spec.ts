import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';

const axeSource = readFileSync(
  createRequire(import.meta.url).resolve('axe-core/axe.min.js'),
  'utf8',
);

async function axeViolations(page: Page) {
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

async function corruptSave(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('thegameshow');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const tx = req.result.transaction('saves', 'readwrite');
          const st = tx.objectStore('saves');
          st.put({ schemaVersion: 1, revision: 9, junk: true }, 'current');
          st.put({ junk: true }, 'previous');
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
}

test('main screen has no axe violations and no console errors (DEF-GS-02, DEF-GS-05)', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('response', (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Travailler avec Aoi' })).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test('the import label shows a focus ring when the file input is focused (DEF-GS-03)', async ({
  page,
}) => {
  await page.goto('./');
  await page.locator('#import-file').focus();
  const outline = await page
    .locator('label[for="import-file"]')
    .evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(outline).toBe('solid');
});

test('starting over from an unreadable save needs a confirmation (DEF-GS-01)', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Travailler avec Aoi' })).toBeVisible();
  await corruptSave(page);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Sauvegarde illisible' })).toBeVisible();

  await page.getByRole('button', { name: 'Commencer une nouvelle partie' }).click();
  const dialog = page.getByRole('dialog', { name: 'Commencer une nouvelle partie ?' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('tes yens');
  await expect(dialog).toContainText('tes investissements');
  expect(await axeViolations(page)).toEqual([]);

  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Télécharger la sauvegarde illisible' }).click();
  expect((await download).suggestedFilename()).toMatch(/^thegameshow-illisible-/);

  await dialog.getByRole('button', { name: 'Annuler' }).click();
  await expect(page.getByRole('heading', { name: 'Sauvegarde illisible' })).toBeVisible();

  await page.getByRole('button', { name: 'Commencer une nouvelle partie' }).click();
  await dialog.getByRole('button', { name: 'Oui, commencer une nouvelle partie' }).click();
  await expect(page.getByRole('heading', { name: 'Sauvegarde illisible' })).toBeHidden();
});
