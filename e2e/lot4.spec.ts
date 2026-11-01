import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { axeViolations } from './axe';

// Lot 4 (QA-REQUEST-LOT4): home without the yellow button, Menu > Paramètres, Travailler screen,
// power boost and videos. Harness tests run on the dist-test build (port 4181, never deployed).
const midgame = JSON.parse(readFileSync('src/save/__fixtures__/v4-midgame.json', 'utf8')) as object;
const HARNESS = 'http://localhost:4181/thegameshow/';
const tile = (page: Page) => page.getByRole('button', { name: 'Travailler', exact: true });
const nav = (page: Page, name: string) =>
  page.getByRole('navigation').getByRole('button', { name }).click();

let pageErrors: string[] = [];
test.beforeEach(async ({ page }) => {
  pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && pageErrors.push(m.text()));
});
test.afterEach(() => {
  expect(pageErrors).toEqual([]);
});

/** GS-V5-64 f: no scrolling on the document nor on any overflow auto|scroll descendant. */
async function expectNoScroll(page: Page, label: string) {
  const r = await page.evaluate(() => {
    const se = document.scrollingElement!;
    const inner = [...document.querySelectorAll<HTMLElement>('*')]
      .filter((e) => /(auto|scroll)/.test(getComputedStyle(e).overflowY))
      .filter((e) => e.scrollHeight > e.clientHeight)
      .map((e) => e.className);
    const tabbar = document.querySelector('.tabbar')!.getBoundingClientRect().top;
    const hidden = [...document.querySelectorAll('.home > *')]
      .filter((e) => e.getBoundingClientRect().bottom > tabbar + 1)
      .map((e) => e.className);
    return { doc: se.scrollHeight - se.clientHeight, inner, hidden };
  });
  if (process.env.SHOTS || r.hidden.length)
    await page.screenshot({ path: `test-results/noscroll-${label}.png` });
  expect(r, label).toEqual({ doc: 0, inner: [], hidden: [] });
}
async function safeAreas(page: Page) {
  await page.addStyleTag({ content: ':root{--safe-top:47px;--safe-bottom:34px}' });
}

test.describe('GS-V5-64: home and Paramètres', () => {
  test('(a)(b)(c)(e) no yellow button; « Travailler » tile opens #work; 5 locked tiles; tab order', async ({
    page,
  }) => {
    await page.goto('./');
    await expect(tile(page)).toBeVisible();
    await expect(page.getByRole('button', { name: /Travailler avec Aoi/ })).toHaveCount(0);
    await expect(tile(page).locator('.hub-lock')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /— verrouillé, bientôt$/ })).toHaveCount(5);
    await expect(page.getByRole('navigation').getByRole('button')).toHaveText([
      /Accueil/,
      /Investir/,
      /Amis/,
      /Associés/,
      /Menu/,
    ]);
    for (const b of await page.getByRole('navigation').getByRole('button').all()) {
      const box = (await b.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
    }
    await tile(page).click();
    await expect(page).toHaveURL(/#work$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Travailler' })).toBeFocused();
    await page.getByRole('button', { name: '← Accueil' }).click();
    await expect(page).toHaveURL(/#home$/);
  });

  test('(d)(g) Menu opens #settings with the save actions; the home has none; axe', async ({
    page,
  }) => {
    await page.goto('./');
    await expect(tile(page)).toBeVisible();
    for (const n of ['Exporter la sauvegarde', 'Nouvelle partie'])
      await expect(page.getByRole('button', { name: n })).toHaveCount(0);
    await nav(page, 'Menu');
    await expect(page).toHaveURL(/#settings$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Paramètres' })).toBeFocused();
    await expect(page.getByRole('button', { name: 'Exporter la sauvegarde' })).toBeVisible();
    await expect(page.getByText('Importer une sauvegarde').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nouvelle partie' })).toBeVisible();
    await page.getByRole('button', { name: 'Nouvelle partie' }).click();
    await page.getByRole('button', { name: 'Oui, recommencer' }).click();
    await expect(page.getByRole('heading', { name: 'Partie précédente' })).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);
  });

  for (const vp of [
    { width: 360, height: 640 },
    { width: 390, height: 844 },
  ]) {
    test(`(f) no home scrolling at ${vp.width}x${vp.height}, safe areas 47/34, 5 states`, async ({
      page,
      context,
    }) => {
      await page.setViewportSize(vp);
      await page.goto(HARNESS);
      await expect(tile(page)).toBeVisible();
      await safeAreas(page);
      await expectNoScroll(page, 'normal');
      // Offline gains card: the mid-game save (with investments) last seen 3 h ago, then a reload.
      await page.evaluate(async (save) => {
        const h = window.__TGS_TEST__!;
        const old = h.now() - 3 * 3600_000;
        if (!(await h.loadSave({ ...save, lastSeenAt: old, maxSeenAt: old })))
          throw new Error('loadSave refused');
        // Its last draw was already seen (no reveal on reload).
        const g = h.state()!;
        localStorage.setItem('tgs-reveal-seen', `${g.createdAt}:${g.gacha.last?.pull ?? 0}`);
      }, midgame);
      await page.reload();
      await expect(page.getByRole('button', { name: 'Récolter' })).toBeVisible();
      await safeAreas(page);
      await expectNoScroll(page, 'offline card');
      // Font enlarged to 120 %.
      await page.addStyleTag({ content: 'html{font-size:120%}' });
      await expectNoScroll(page, 'font 120 %');
      // Another tab: the second one is read-only and shows the banner.
      await page.addStyleTag({ content: 'html{font-size:100%}' });
      const other = await context.newPage();
      await other.setViewportSize(vp);
      await other.goto(HARNESS);
      await expect(other.getByText(/ouvert dans un autre onglet/)).toBeVisible();
      await safeAreas(other);
      await expectNoScroll(other, 'other tab banner');
      await other.close();
      // Restoration announcement: unreadable current, fallback to previous.
      await page.evaluate(
        () =>
          new Promise<void>((resolve, reject) => {
            const req = indexedDB.open('thegameshow');
            req.onerror = () => reject(req.error);
            req.onsuccess = () => {
              const tx = req.result.transaction('saves', 'readwrite');
              tx.objectStore('saves').put({ junk: true }, 'current');
              tx.oncomplete = () => {
                req.result.close();
                resolve();
              };
            };
          }),
      );
      await page.reload();
      await expect(page.getByRole('status')).toHaveText(
        'Une copie de secours de ta sauvegarde a été restaurée.',
      );
      await safeAreas(page);
      await expectNoScroll(page, 'restore announcement');
    });
  }
});

test.describe('GS-V5-5x: Travailler (harness build)', () => {
  test.use({ baseURL: HARNESS });

  async function openWork(page: Page) {
    await page.goto('./');
    await expect(tile(page)).toBeVisible();
    await page.waitForFunction(() => !!window.__TGS_TEST__?.state());
    await tile(page).click();
    await expect(page.locator('.work')).toBeVisible();
  }
  const game = (page: Page) => page.evaluate(() => window.__TGS_TEST__!.state()!);
  const doc = (page: Page) => page.getByRole('button', { name: /^Écrire \(1 énergie/ });

  test('a tap costs 1 energy, gives points, counts once for « clic » and totalClicks (GS-V5-60)', async ({
    page,
  }) => {
    await openWork(page);
    const before = await game(page);
    await doc(page).click();
    await page.keyboard.press('Enter'); // the focused button: one more tap
    const after = await game(page);
    expect(after.energy.value).toBe(before.energy.value - 2);
    expect(after.work.points).toBe(before.work.points + 2);
    expect(after.totalClicks).toBe(before.totalClicks + 2);
    expect(after.quests.progress.click).toBe(before.quests.progress.click + 2);
    expect(after.work.taps).toBe(before.work.taps + 2);
  });

  test('no energy: the tap is refused and counts for nothing', async ({ page }) => {
    await openWork(page);
    await page.evaluate(() => window.__TGS_TEST__!.setEnergy(0));
    const before = await game(page);
    await doc(page).click();
    const after = await game(page);
    expect(after.work.points).toBe(before.work.points);
    expect(after.quests.progress.click).toBe(before.quests.progress.click);
    await expect(page.locator('.work')).toHaveAttribute('data-aoi-state', 'think');
  });

  test('power boost: hit in the golden zone doubles the taps for 5 s (game clock)', async ({
    page,
  }) => {
    await openWork(page);
    const work = page.locator('.work');
    await expect(work).toHaveAttribute('data-boost-phase', 'idle');
    await page.evaluate(() => {
      window.__TGS_TEST__!.boostShow();
      window.__TGS_TEST__!.setCursor(0.5);
    });
    await expect(work).toHaveAttribute('data-boost-phase', 'shown');
    await page.getByRole('button', { name: /^Aoi — toucher/ }).click();
    await expect(work).toHaveAttribute('data-boost-phase', 'active');
    const p0 = (await game(page)).work.points;
    await doc(page).click();
    expect((await game(page)).work.points).toBe(p0 + 2);
    await page.evaluate(() => window.__TGS_TEST__!.advance(5000));
    await expect(work).toHaveAttribute('data-boost-phase', 'cooldown');
    await doc(page).click();
    expect((await game(page)).work.points).toBe(p0 + 3);
  });

  test('power boost: a miss and a hidden tab both lose the boost, without penalty', async ({
    page,
  }) => {
    await openWork(page);
    const work = page.locator('.work');
    await page.evaluate(() => {
      window.__TGS_TEST__!.boostShow();
      window.__TGS_TEST__!.setCursor(0.05);
    });
    await page.getByRole('button', { name: /^Aoi — toucher/ }).click();
    await expect(work).toHaveAttribute('data-boost-phase', 'cooldown');
    // A boost active when the tab is hidden is lost (BALANCE.boost.hiddenTab): no joy at the end.
    await page.evaluate(() => {
      window.__TGS_TEST__!.boostShow();
      window.__TGS_TEST__!.setCursor(0.5);
    });
    await page.getByRole('button', { name: /^Aoi — toucher/ }).click();
    await expect(work).toHaveAttribute('data-boost-phase', 'active');
    await page.evaluate(() => {
      window.__TGS_TEST__!.setVisibility('hidden');
      window.__TGS_TEST__!.advance(5000);
      window.__TGS_TEST__!.setVisibility('visible');
    });
    await expect(work).toHaveAttribute('data-boost-phase', 'cooldown');
    await expect(work).not.toHaveAttribute('data-aoi-state', 'joy');
  });

  test('reduced motion / Save-Data: still pictures, no video source; refused play keeps the poster', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openWork(page);
    await expect(page.locator('.work')).toHaveAttribute('data-still', 'true');
    await expect(page.locator('video[src]')).toHaveCount(0);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.evaluate(() =>
      window.__TGS_TEST__!.mediaOverride({ connection: { saveData: true } }),
    );
    await expect(page.locator('.work')).toHaveAttribute('data-still', 'true');
    await page.evaluate(() => window.__TGS_TEST__!.mediaOverride({ refusePlay: true }));
    await expect(page.locator('.work')).toHaveAttribute('data-still', 'false');
    await expect(page.locator('video.ws.on')).toHaveAttribute('poster', /aoi-work-start\.webp$/);
  });

  test('no .mp4 is requested on #home; #work has no axe violations', async ({ page }) => {
    const mp4: string[] = [];
    page.on('request', (r) => r.url().endsWith('.mp4') && mp4.push(r.url()));
    await page.goto('./');
    await expect(tile(page)).toBeVisible();
    await page.waitForTimeout(1000);
    expect(mp4).toEqual([]);
    await tile(page).click();
    await expect(page.locator('.work')).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);
  });
});
