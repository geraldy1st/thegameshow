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
    await expect(sheet.getByRole('heading', { name: "Ce qu'il apporte" })).toBeVisible();
    await expect(sheet.locator('.assoc-sheet-bio')).toBeVisible(); // summary stays visible
    await expect(sheet.locator('.assoc-sheet-apport')).toHaveAttribute('open', '');
    await expect(sheet.locator('.assoc-sheet-bio')).not.toHaveAttribute('open', '');
    await expect(
      sheet.getByText(/Faire appel double son bonus d’épargne pendant 1 h, puis recharge 4 h/),
    ).toBeVisible();
    // SYS-20: double-click starts one call only; 1 h boost, 4 h recharge.
    await sheet.getByRole('button', { name: /Faire appel à Omar/i }).dblclick();
    await expect(sheet.getByText(/Boost actif/i)).toBeVisible();
    const g = await page.evaluate(() => window.__TGS_TEST__!.state()!);
    const ev = g.appel.omar!;
    expect(ev.endsAt - ev.activatedAt).toBe(60 * 60_000);
    expect(ev.cooldownUntil - ev.activatedAt).toBe(4 * 60 * 60_000);
    expect(g.appelReceipts.filter((r) => r.associateId === 'omar')).toHaveLength(1);
    await page.keyboard.press('Escape');
    await expect(page.locator('.appel-badge.active')).toBeVisible();
    await expect(page.locator('.appel-badge.active')).toContainText(/h|min/);
  });
});
