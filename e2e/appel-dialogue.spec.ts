import { expect, test, type Page } from '@playwright/test';
import { axeViolations } from './axe';

/** 0.5.2 addendum: Faire appel messaging panel. Harness build. Chromium + WebKit. */
test.use({ baseURL: 'http://localhost:4181/thegameshow/' });

const tab = (page: Page, name: string) =>
  page.getByRole('navigation').getByRole('button', { name, exact: true });

async function start(page: Page) {
  await page.goto('./');
  await page.waitForFunction(() => !!window.__TGS_TEST__?.state());
}

async function openOmarAndCall(page: Page) {
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
  await expect(page.locator('.assoc-sheet')).toBeVisible();
  await page.getByRole('button', { name: /Faire appel à Omar/i }).click();
  await expect(page.locator('dialog.amsg[open]')).toBeVisible();
}

test.describe('Faire appel dialogue (R-052D-01..07)', () => {
  test('boost is already active; panel shows the replica; no appelStarted toast', async ({
    page,
  }) => {
    await openOmarAndCall(page);
    const sheet = page.locator('.assoc-sheet');
    await expect(sheet.getByRole('button', { name: /Boost actif/i })).toBeVisible();
    const g = await page.evaluate(() => window.__TGS_TEST__!.state()!);
    expect(g.appel.omar).toBeTruthy();
    expect(g.appelReceipts.filter((r) => r.associateId === 'omar')).toHaveLength(1);
    await page.locator('dialog.amsg').click();
    await expect(page.locator('#amsg-bubble')).toContainText(
      'On découpe le plan : bonus Épargne ×2 pendant 1 h',
    );
    await expect(page.locator('.amsg-chip')).toHaveText('⚡ bonus Épargne ×2 · 1 h');
    const lives = await page.locator('[aria-live]').allTextContents();
    expect(lives.join(' ')).not.toMatch(/Appel lancé/);
    expect(await axeViolations(page)).toEqual([]);
  });

  test('1, 2 then 3 Escape: the sheet never closes with the panel (R-052D-01)', async ({
    page,
  }) => {
    await openOmarAndCall(page);
    const sheet = page.locator('.assoc-sheet');
    const panel = page.locator('dialog.amsg[open]');
    await page.keyboard.press('Escape');
    await expect(panel).toBeVisible();
    await expect(page.locator('#amsg-bubble')).toBeVisible();
    await expect(sheet).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog.amsg[open]')).toHaveCount(0);
    await expect(sheet).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
  });

  test('focus returns inside the sheet after the panel closes (R-052D-02)', async ({ page }) => {
    await openOmarAndCall(page);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog.amsg[open]')).toHaveCount(0);
    const inside = await page.evaluate(() => {
      const sheet = document.querySelector('.assoc-sheet');
      const el = document.activeElement;
      return !!sheet && !!el && sheet.contains(el);
    });
    expect(inside).toBe(true);
    await expect(page.locator('#af-call-omar')).toBeFocused();
  });

  test('a rapid double tap on the veil advances only one state (R-052D-01)', async ({ page }) => {
    await openOmarAndCall(page);
    const veil = page.locator('.amsg-veil');
    await veil.click({ clickCount: 2 });
    await expect(page.locator('dialog.amsg[open]')).toBeVisible();
    await expect(page.locator('#amsg-bubble')).toBeVisible();
    await expect(page.locator('.assoc-sheet')).toBeVisible();
  });

  test('reduced-motion: no typing indicator, replica immediate, no transform (R-052D-07)', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openOmarAndCall(page);
    await expect(page.locator('.amsg-type')).toHaveCount(0);
    await expect(page.locator('#amsg-bubble')).toBeVisible();
    await expect(page.locator('#amsg-bubble')).toContainText('bonus Épargne ×2 pendant 1 h');
    const transforms = await page.evaluate(() => {
      const sheet = document.querySelector('.amsg-sheet') as HTMLElement;
      const bubble = document.querySelector('.amsg-bubble') as HTMLElement;
      const cs = (el: HTMLElement) => getComputedStyle(el).transform;
      return { sheet: cs(sheet), bubble: cs(bubble) };
    });
    expect(transforms.sheet === 'none' || transforms.sheet === 'matrix(1, 0, 0, 1, 0, 0)').toBe(
      true,
    );
    expect(transforms.bubble === 'none' || transforms.bubble === 'matrix(1, 0, 0, 1, 0, 0)').toBe(
      true,
    );
    expect(await axeViolations(page)).toEqual([]);
  });
});
