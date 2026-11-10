import { expect, test, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';

/** 0.5.2 sheet layout, zoom meta, rates placement. Harness build. */
test.use({ baseURL: 'http://localhost:4181/thegameshow/' });

const tab = (page: Page, name: string) =>
  page.getByRole('navigation').getByRole('button', { name, exact: true });

async function start(page: Page) {
  await page.goto('./');
  await page.waitForFunction(() => !!window.__TGS_TEST__?.state());
}

async function openOmarSheet(page: Page) {
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
}

type Measure = {
  label: string;
  innerW: number;
  innerH: number;
  sheetTop: number;
  sheetBottom: number;
  sheetHeight: number;
  dialogScroll: number;
  dialogClient: number;
  dialogOverflows: boolean;
  sheetFitsViewport: boolean;
};

async function measureSheet(page: Page, label: string): Promise<Measure> {
  return page.evaluate((lab) => {
    const sheet = document.querySelector('.assoc-sheet') as HTMLElement;
    const dialog = sheet.closest('dialog') as HTMLElement;
    const sr = sheet.getBoundingClientRect();
    const out = {
      label: lab,
      innerW: window.innerWidth,
      innerH: window.innerHeight,
      sheetTop: sr.top,
      sheetBottom: sr.bottom,
      sheetHeight: sr.height,
      dialogScroll: dialog.scrollHeight,
      dialogClient: dialog.clientHeight,
      dialogOverflows: dialog.scrollHeight > dialog.clientHeight + 1,
      sheetFitsViewport: sr.top >= -1 && sr.bottom <= window.innerHeight + 1,
    };
    return out;
  }, label);
}

const measures: Measure[] = [];

test.describe('0.5.2 sheet, zoom, menu', () => {
  test('viewport meta blocks pinch zoom; no text-size-adjust:none', async ({ page }) => {
    await start(page);
    const meta = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(meta).toMatch(/maximum-scale=1/);
    expect(meta).toMatch(/user-scalable=no/);
    const adjust = await page.evaluate(() => getComputedStyle(document.documentElement).webkitTextSizeAdjust || getComputedStyle(document.documentElement).getPropertyValue('-webkit-text-size-adjust'));
    // Must not force 'none' (Safari aA / Texte plus grand stays available).
    expect((adjust || '').toLowerCase()).not.toBe('none');
    const ta = await page.evaluate(() => getComputedStyle(document.documentElement).touchAction);
    expect(ta).toMatch(/manipulation/);
  });

  test('Menu has no rates; Partners still does', async ({ page }) => {
    await start(page);
    await tab(page, 'Menu').click();
    await expect(page.getByRole('button', { name: 'Taux de tirage' })).toHaveCount(0);
    await tab(page, 'Associés').click();
    await expect(page.getByRole('button', { name: 'Taux de tirage' })).toBeVisible();
  });

  test('firm: no sheet scroll at 390×844 / 100 % (apport open)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openOmarSheet(page);
    const m = await measureSheet(page, '390x844@100%');
    measures.push(m);
    expect(m.sheetFitsViewport, JSON.stringify(m)).toBe(true);
    expect(m.dialogOverflows, JSON.stringify(m)).toBe(false);
  });

  test('measure 360×640 and 120 % font (non-blocking)', async ({ page }) => {
    for (const [w, h, font, label] of [
      [360, 640, '100%', '360x640@100%'],
      [390, 844, '120%', '390x844@120%'],
      [360, 640, '120%', '360x640@120%'],
    ] as const) {
      await page.setViewportSize({ width: w, height: h });
      await openOmarSheet(page);
      if (font !== '100%') {
        await page.addStyleTag({ content: `html{font-size:${font}}` });
        await page.waitForTimeout(50);
      }
      measures.push(await measureSheet(page, label));
      await page.keyboard.press('Escape');
    }
    writeFileSync('/tmp/tgs-052-sheet-measures.json', JSON.stringify(measures, null, 2));
    // Non-blocking: always pass; results are recorded for the report.
    expect(measures.length).toBeGreaterThanOrEqual(3);
  });
});
