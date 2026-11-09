import { expect, test, type Page } from '@playwright/test';

/** Associés v11: sheet + call (Chromium). Harness build. */
test.use({ baseURL: 'http://localhost:4181/thegameshow/' });

const tab = (page: Page, name: string) =>
  page.getByRole('navigation').getByRole('button', { name, exact: true });

async function start(page: Page) {
  await page.goto('./');
  await page.waitForFunction(() => !!window.__TGS_TEST__?.state());
}

test.describe('Associés v11', () => {
  test('FR bio visible; Faire appel activates and shows boost', async ({ page }) => {
    await start(page);
    const ok = await page.evaluate(async () => {
      const api = window.__TGS_TEST__!;
      const g = api.state();
      if (!g) return false;
      return api.loadSave({
        ...g,
        gacha: { ...g.gacha, stars: { ...g.gacha.stars, omar: 3 }, last: null },
        investments: { ...g.investments, save: 1 },
      });
    });
    expect(ok).toBe(true);
    await tab(page, 'Associés').click();
    await page.getByRole('button', { name: /Voir le profil de Omar/i }).click();
    const sheet = page.locator('.assoc-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('.assoc-sheet-bio')).toBeVisible();
    await sheet.getByRole('button', { name: /Faire appel à Omar/i }).click();
    await expect(sheet.getByText(/Boost actif/i)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.appel-badge.active')).toBeVisible();
  });
});
