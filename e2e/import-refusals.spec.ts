import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { EXPORT_FORMAT, MAX_IMPORT_BYTES, fnv1a } from '../src/save/exportImport';
const midgameV4 = JSON.parse(
  readFileSync('src/save/__fixtures__/v4-midgame.json', 'utf8'),
) as object;

const AP = '\u2019';
const UNCHANGED = 'Ta partie actuelle n’a pas changé.';
const COPY = {
  notJson: 'Ce fichier n’a pas pu être lu. Ta partie actuelle n’a pas changé.',
  tooLarge: 'Ce fichier est trop lourd pour être importé. Ta partie actuelle n’a pas changé.',
  envelope: 'Ce fichier n’est pas une sauvegarde The Gameshow. Ta partie actuelle n’a pas changé.',
  checksum:
    'Ce fichier a été modifié ou abîmé, il ne peut pas être importé. Ta partie actuelle n’a pas changé.',
  newer:
    'Cette partie vient d’une version plus récente du jeu. Recharge la page pour passer à la dernière version, puis réessaie l’import.',
  other: 'Ce fichier n’a pas pu être importé. Ta partie actuelle n’a pas changé.',
} as const;

const envelope = (save: unknown, checksum = fnv1a(JSON.stringify(save))) =>
  JSON.stringify({ format: EXPORT_FORMAT, checksum, save });

const CASES: { name: string; file: string; body: string; message: string }[] = [
  { name: 'not JSON', file: 'not-json.json', body: '{', message: COPY.notJson },
  {
    name: 'too large',
    file: 'too-large.json',
    body: 'x'.repeat(MAX_IMPORT_BYTES + 1),
    message: COPY.tooLarge,
  },
  { name: 'envelope', file: 'array.json', body: '[]', message: COPY.envelope },
  {
    name: 'checksum',
    file: 'checksum.json',
    body: envelope({ schemaVersion: 5 }, '00000000'),
    message: COPY.checksum,
  },
  {
    name: 'newer schema',
    file: 'v6.json',
    body: envelope({ ...(midgameV4 as object), schemaVersion: 6 }),
    message: COPY.newer,
  },
  {
    name: 'other refusal',
    file: 'junk.json',
    body: envelope({ junk: true }),
    message: COPY.other,
  },
];

async function refuse(page: Page, file: string, body: string) {
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Travailler', exact: true })).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: 'Menu' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Paramètres' })).toBeVisible();
  await page.locator('#import-file').setInputFiles({
    name: file,
    mimeType: 'application/json',
    buffer: Buffer.from(body),
  });
  const dialog = page.getByRole('dialog', { name: 'Importer une sauvegarde' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Importer une sauvegarde' }).click();
}

test.describe('DEF-GS-59 import refusal announcements', () => {
  for (const c of CASES) {
    test(`announces the exact ${c.name} copy and leaks no English`, async ({ page }) => {
      await refuse(page, c.file, c.body);
      const live = page.locator('p.visually-hidden[aria-live="polite"]');
      await expect(live).toHaveText(c.message);
      const text = await live.textContent();
      expect(text).not.toMatch(
        /Fichier refusé|not JSON|file too large|checksum mismatch|envelope:|newer than this app|invalid save|schemaVersion/i,
      );
      expect(text?.includes("'")).toBe(false);
      expect(text?.includes(AP)).toBe(true);
      if (c.name === 'newer schema') {
        expect(text?.includes(UNCHANGED)).toBe(false);
      } else {
        expect(text?.includes(UNCHANGED)).toBe(true);
      }
    });
  }
});
