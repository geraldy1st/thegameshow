import { expect, test, type Page } from '@playwright/test';
import { axeViolations } from './axe';

// Patch 0.4.3 (QA-REQUEST-PATCH-043 v1.1, AVIS-QA-PATCH-043 R-P43-1 to 16). Harness build.
test.use({ baseURL: 'http://localhost:4181/thegameshow/' });

let pageErrors: string[] = [];
test.beforeEach(async ({ page }) => {
  pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && pageErrors.push(m.text()));
});
test.afterEach(() => {
  expect(pageErrors).toEqual([]);
});

const nav = (page: Page) => page.getByRole('navigation', { name: /./ });
const tab = (page: Page, name: string) =>
  page.getByRole('navigation').getByRole('button', { name, exact: true });
const aoi = (page: Page) => page.getByRole('button', { name: /^Écrire avec Aoi \(1 énergie/ });
const game = (page: Page) => page.evaluate(() => window.__TGS_TEST__!.state()!);
const revision = async (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const r = indexedDB.open('thegameshow');
        r.onsuccess = () => {
          const g = r.result.transaction('saves').objectStore('saves').get('current');
          g.onsuccess = () => resolve((g.result as { revision: number }).revision);
        };
      }),
  );
async function start(page: Page, hash = '') {
  await page.goto(`./${hash}`);
  await page.waitForFunction(() => !!window.__TGS_TEST__?.state());
}
async function watchLive(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __live: string[] };
    w.__live = [];
    const live = document.querySelector('[aria-live]')!;
    new MutationObserver(() => w.__live.push(live.textContent ?? '')).observe(live, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  });
}
const lives = (page: Page) =>
  page.evaluate(() => (window as unknown as { __live: string[] }).__live.filter(Boolean));
const noHorizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test.describe('P1 navigation (GS-V5-81, R-P43-13)', () => {
  test('no « ← Accueil » on any screen; a named nav on each; Échap outside dialogs does nothing', async ({
    page,
  }) => {
    await start(page);
    for (const hash of [
      '#home',
      '#invest',
      '#friends',
      '#partners',
      '#settings',
      '#work',
      '#mission',
    ]) {
      await page.goto(`./${hash}`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      await expect(page.getByRole('button', { name: '← Accueil' }), hash).toHaveCount(0);
      await expect(nav(page), hash).toHaveCount(1);
      await page.keyboard.press('Escape');
      expect(new URL(page.url()).hash, hash).toBe(hash);
    }
  });

  test('browser back from #mission and #work returns home', async ({ page }) => {
    await start(page);
    for (const name of ['Mission', 'Travailler']) {
      await page.getByRole('button', { name, exact: true }).click();
      await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
      await page.goBack();
      await expect(page).toHaveURL(/#home$/);
    }
  });
});

test.describe('P2 home and Mission (GS-V5-82/83, R-P43-14)', () => {
  test('4 tiles in order; Mission opens #mission, h1 focused, Accueil is the section, axe clean', async ({
    page,
  }) => {
    await start(page);
    await expect(page.locator('.hub .hub-btn')).toHaveCount(4);
    const names = await page
      .locator('.hub .hub-btn')
      .evaluateAll((els) =>
        els.map((e) => e.getAttribute('aria-label') ?? e.querySelector('.hub-lbl')!.textContent),
      );
    expect(names).toEqual([
      'Travailler',
      'Apprendre — verrouillé, bientôt',
      'Maison — verrouillé, bientôt',
      'Mission',
    ]);
    await page.getByRole('button', { name: 'Mission', exact: true }).click();
    await expect(page).toHaveURL(/#mission$/);
    const h1 = page.getByRole('heading', { level: 1, name: 'Mission' });
    await expect(h1).toBeFocused();
    await expect(page.getByText('Des petites missions pour gagner des Yen.')).toBeVisible();
    await expect(tab(page, 'Accueil')).toHaveAttribute('aria-current', 'true');
    expect(await axeViolations(page)).toEqual([]);
  });

  test('locked missions: « bientôt » without date, not links, no write, hash unchanged', async ({
    page,
  }) => {
    await start(page, '#mission');
    await page.waitForTimeout(300);
    const before = await revision(page);
    await expect(page.locator('.mission a')).toHaveCount(0);
    for (const name of ['Course à vélo', 'Dé du destin']) {
      const t = page.getByRole('button', { name: `${name} — verrouillé, bientôt` });
      await expect(t).toHaveAttribute('aria-disabled', 'true');
      await t.press('Enter');
      await expect(page.getByRole('status')).toHaveText(`${name} : bientôt !`);
      expect(new URL(page.url()).hash).toBe('#mission');
    }
    expect(await page.locator('.mission').textContent()).not.toMatch(
      /\d{1,2}\/\d{1,2}|demain|jours?/,
    );
    await page.waitForTimeout(300);
    expect(await revision(page)).toBe(before);
  });

  for (const vp of [
    { width: 360, height: 640 },
    { width: 390, height: 844 },
  ])
    for (const font of ['100%', '120%', '150%'])
      test(`layout ${vp.width}×${vp.height} at ${font}: home and #mission without horizontal overflow`, async ({
        page,
      }) => {
        await page.setViewportSize(vp);
        await start(page);
        await page.addStyleTag({ content: `html{font-size:${font}}` });
        expect(await noHorizontalOverflow(page), 'home').toBe(true);
        await page.goto('./#mission');
        await page.addStyleTag({ content: `html{font-size:${font}}` });
        expect(await noHorizontalOverflow(page), 'mission').toBe(true);
        const boxes = await page
          .locator('.mission-grid .hub-btn')
          .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON() as DOMRect));
        const [a, b] = boxes as [DOMRect, DOMRect];
        const overlap =
          a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        expect(overlap).toBe(false);
      });
});

test.describe('P3 focus on Aoi (GS-V5-86, R-P43-9)', () => {
  test('pointer: no ring, no inset shadow; keyboard: double ring', async ({ page }) => {
    await start(page, '#work');
    const box = (await aoi(page).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    const pressed = await aoi(page).evaluate((e) => {
      const s = getComputedStyle(e);
      return { outline: s.outlineStyle, shadow: s.boxShadow };
    });
    await page.mouse.up();
    expect(pressed).toEqual({ outline: 'none', shadow: 'none' });
    await aoi(page).blur();
    // A keyboard interaction, then focus (WebKit's Tab may skip buttons): :focus-visible applies.
    await page.keyboard.press('Tab');
    await aoi(page).focus();
    await expect(aoi(page)).toBeFocused();
    const kb = await aoi(page).evaluate((e) => {
      const s = getComputedStyle(e);
      return { outline: s.outlineStyle, width: s.outlineWidth, shadow: s.boxShadow };
    });
    expect(kb.outline).toBe('solid');
    expect(kb.width).toBe('3px');
    expect(kb.shadow).toContain('inset'); // navy inner ring: ≥ 3:1 whatever the video pixel
  });
});

test.describe('P4 floating points (GS-V5-87, R-P43-2, R-P43-12)', () => {
  test('39 px, not hit-testable, 30 nodes, a 15 + 15 burst never reuses a live node', async ({
    page,
  }) => {
    await start(page, '#work');
    await expect(page.locator('.fx .pop')).toHaveCount(30);
    const t0 = await page.evaluate(() => window.__TGS_TEST__!.now());
    const burst = async () => {
      for (let i = 0; i < 15; i++) await aoi(page).press('Enter');
    };
    await burst();
    await page.evaluate((t) => window.__TGS_TEST__!.setNow(t + 1010), t0);
    await burst();
    expect(await page.locator('.fx .pop:not([hidden])').count()).toBe(30);
    // 30 spawns, 30 distinct nodes still alive: none was reused before its animationend.
    const style = await page
      .locator('.fx .pop')
      .first()
      .evaluate((e) => {
        const s = getComputedStyle(e);
        return { size: s.fontSize, pe: s.pointerEvents, dur: s.animationDuration };
      });
    expect(style).toEqual({ size: '39px', pe: 'none', dur: '1.3s' });
  });

  test('reduced motion: 1 200 ms still, three offsets so points do not stack', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await start(page, '#work');
    for (let i = 0; i < 3; i++) await aoi(page).press('Enter');
    const pops = await page.locator('.fx .pop:not([hidden])').evaluateAll((els) =>
      els.map((e) => ({
        dur: getComputedStyle(e).animationDuration,
        mt: getComputedStyle(e).marginTop,
      })),
    );
    expect(pops.map((p) => p.dur)).toEqual(['1.2s', '1.2s', '1.2s']);
    expect(new Set(pops.map((p) => p.mt)).size).toBe(3);
  });
});

test.describe('P5 Travailler full screen (GS-V5-88, R-P43-13)', () => {
  test('no top bar on #work; energy, label and panel visible; conversion gives the balance', async ({
    page,
  }) => {
    await start(page, '#work');
    await expect(page.locator('.topbar')).toHaveCount(0);
    await expect(page.locator('.pill-tickets')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Quêtes du jour' })).toHaveCount(0);
    for (const sel of ['.work-e', '.ws-label', '.work-panel'])
      await expect(page.locator(sel)).toBeInViewport({ ratio: 1 });
    await watchLive(page);
    await page.evaluate(async () => {
      const h = window.__TGS_TEST__!;
      const g = h.state()!;
      const work = { ...g.work, points: 100, pointsTotal: 100 };
      if (!(await h.loadSave({ ...g, work }))) throw new Error('loadSave refused');
    });
    await expect(page.locator('.work-panel .num')).toHaveText('100');
    await page.getByRole('button', { name: 'Convertir en Yen' }).click();
    await expect
      .poll(() => lives(page))
      .toContainEqual(expect.stringMatching(/^\+10 ¥ · solde 130 ¥/));
    await page.goto('./#home');
    await expect(page.locator('.topbar')).toHaveCount(1);
  });

  test('DEF-GS-21: « Convertir en Yen » on one line at 100 % (360 and 390)', async ({ page }) => {
    for (const width of [360, 390]) {
      await page.setViewportSize({ width, height: 640 });
      await start(page, '#work');
      const btn = page.getByRole('button', { name: 'Convertir en Yen' });
      const lines = await btn.evaluate((e) => {
        const r = document.createRange();
        r.selectNodeContents(e);
        return new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size;
      });
      expect(lines, `${width}`).toBe(1);
    }
  });
});

test.describe('P6 Aoi videos (GS-V5-89, R-P43-15)', () => {
  test('at most 2 <video> with a src through work → think → work → joy', async ({ page }) => {
    await start(page, '#work');
    const count = () => page.locator('.work-bg video[src]').count();
    for (const e of [5, 50, 5, 50]) {
      await page.evaluate((n) => window.__TGS_TEST__!.setEnergy(n), e);
      for (let i = 0; i < 10; i++) {
        expect(await count()).toBeLessThanOrEqual(2);
        await page.waitForTimeout(100);
      }
    }
  });

  test('still mode: instant switch, no video at all', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await start(page, '#work');
    await expect(page.locator('.work-bg video')).toHaveCount(0);
    await page.evaluate(() => window.__TGS_TEST__!.setEnergy(5));
    await expect(page.locator('.work-bg img.ws.on')).toHaveAttribute('src', /aoi-think-end/);
    const op = await page
      .locator('.work-bg img.ws')
      .evaluate((e) => getComputedStyle(e).transitionDuration);
    expect(op).toBe('0s');
  });

  test('refused play(): the poster stays, nothing breaks', async ({ page }) => {
    await start(page);
    await page.evaluate(() => window.__TGS_TEST__!.mediaOverride({ refusePlay: true }));
    await page.getByRole('button', { name: 'Travailler', exact: true }).click();
    await page.evaluate(() => window.__TGS_TEST__!.setEnergy(5));
    await expect(page.locator('.work')).toHaveAttribute('data-aoi-state', 'think');
    await expect(page.locator('.work-bg video.front')).toHaveAttribute('data-state', 'think', {
      timeout: 3000,
    });
  });
});

test.describe('P7 roman (GS-V5-90, R-P43-10, DEF-GS-22)', () => {
  test('toggle: aria-expanded, hidden, kept after reload, Nouvelle partie and import', async ({
    page,
  }) => {
    await start(page, '#work');
    const hide = page.getByRole('button', { name: 'Masquer le roman' });
    await expect(hide).toHaveAttribute('aria-expanded', 'true');
    await expect(hide).toHaveAttribute('aria-controls', 'roman-doc');
    await expect(page.locator('#roman-doc')).toBeVisible();
    await hide.click();
    const show = page.getByRole('button', { name: 'Afficher le roman' });
    await expect(show).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#roman-doc')).toBeHidden();
    await page.reload();
    await page.goto('./#work');
    await expect(page.getByRole('button', { name: 'Afficher le roman' })).toBeVisible();
    // Device preference: a new game keeps it.
    await tab(page, 'Menu').click();
    await page.getByRole('button', { name: 'Nouvelle partie' }).click();
    await page.getByRole('button', { name: 'Oui, recommencer' }).click();
    await page.goto('./#work');
    await expect(page.getByRole('button', { name: 'Afficher le roman' })).toBeVisible();
    // Unreadable value: open.
    await page.evaluate(() => localStorage.setItem('tgs:ui:roman', '???'));
    await page.reload();
    await page.goto('./#work');
    await expect(page.getByRole('button', { name: 'Masquer le roman' })).toBeVisible();
  });

  for (const width of [360, 390])
    for (const font of ['100%', '120%', '150%'])
      test(`${width} px at ${font}: title whole, toggle clear of the panel and of Aoi's label`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 640 });
        await start(page, '#work');
        await page.addStyleTag({ content: `html{font-size:${font}}` });
        await page.waitForTimeout(100);
        const r = await page.evaluate(() => {
          const rect = (s: string) => document.querySelector(s)!.getBoundingClientRect();
          const b = document.querySelector('.doc-bar b')!;
          return {
            clipped: b.scrollWidth > b.clientWidth,
            toggle: rect('.roman-toggle').toJSON() as DOMRect,
            panel: rect('.work-panel').toJSON() as DOMRect,
            label: rect('.ws-label').toJSON() as DOMRect,
          };
        });
        if (font === '100%') expect(r.clipped, 'DEF-GS-22').toBe(false);
        const hit = (a: DOMRect, b: DOMRect) =>
          a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        expect(hit(r.toggle, r.panel), 'panel').toBe(false);
        expect(hit(r.toggle, r.label), 'label').toBe(false);
      });
});

test.describe('P8 partner profile (GS-V5-91, R-P43-11)', () => {
  test('owned photo opens the profile (name, rarity, bonus), no biography; locked has no button', async ({
    page,
  }) => {
    await start(page);
    await tab(page, 'Associés').click();
    await expect(page.getByRole('button', { name: /^Voir le profil de/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Tirer · 1 ticket' }).click();
    const reveal = page.getByRole('dialog');
    await reveal.getByRole('button', { name: 'Passer' }).click();
    await reveal.getByRole('button', { name: 'Continuer' }).click();
    const id = (await game(page)).gacha.last!.id;
    const open = page.getByRole('button', { name: /^Voir le profil de/ });
    await expect(open).toHaveCount(1);
    await open.click();
    const d = page.getByRole('dialog');
    await expect(d.getByRole('heading', { level: 2 })).toBeVisible();
    await expect(d).toContainText('1 ★');
    await expect(d.locator('.bio-text')).toHaveCount(0);
    expect(id).toBeTruthy();
    expect(await axeViolations(page)).toEqual([]);
    await page.addStyleTag({ content: 'html{font-size:150%}' });
    expect(await noHorizontalOverflow(page)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(d).toBeHidden();
    await expect(open).toBeFocused();
  });
});

test.describe('P10 draw ×10 (GS-V5-93/94, R-P43-3, R-P43-7)', () => {
  const ten = (page: Page) => page.getByRole('button', { name: 'Tirer ×10 · 10 tickets' });
  async function partners(page: Page, tickets: number) {
    await start(page);
    await page.evaluate((n) => window.__TGS_TEST__!.setTickets(n), tickets);
    await tab(page, 'Associés').click();
  }

  test('9 tickets: aria-disabled, the reason is described, nothing happens', async ({ page }) => {
    await partners(page, 9);
    await expect(ten(page)).toHaveAttribute('aria-disabled', 'true');
    await expect(ten(page)).toHaveAccessibleDescription('Il te faut 10 tickets (tu en as 9).');
    await ten(page).dispatchEvent('click');
    await page.waitForTimeout(200);
    expect((await game(page)).tickets).toBe(9);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('12 tickets, double click: one ×10, 10 tickets, grid with pity after, Échap = Continuer', async ({
    page,
  }) => {
    await partners(page, 12);
    await watchLive(page);
    await ten(page).dblclick();
    const d = page.getByRole('dialog', { name: 'Tirage ×10' });
    await expect(d).toBeVisible();
    await expect(d.locator('.ten-item')).toHaveCount(10);
    const g = await game(page);
    expect(g.tickets).toBe(2);
    expect(g.gacha.pulls).toBe(10);
    await expect(d.locator('.pity-result')).toHaveText(
      g.gacha.pity === 49 ? /prochain/ : new RegExp(`${50 - g.gacha.pity}`),
    );
    await expect(page.getByRole('button', { name: 'Tirer · 1 ticket' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await expect(d).not.toContainText(/bonus|offert|11/i);
    expect(await axeViolations(page)).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(d).toBeHidden();
    await expect(ten(page)).toBeFocused();
    const announces = (await lives(page)).filter((l) => l.startsWith('Tirage ×10'));
    expect(new Set(announces).size).toBe(1);
  });

  test('held Enter: one ×10 only', async ({ page }) => {
    await partners(page, 25);
    await ten(page).focus();
    await page.keyboard.down('Enter');
    await page.waitForTimeout(600);
    await page.keyboard.up('Enter');
    await expect(page.getByRole('dialog', { name: 'Tirage ×10' })).toBeVisible();
    expect((await game(page)).tickets).toBe(15);
  });

  test('150 % at 360: the grid has no horizontal overflow', async ({ page }) => {
    await partners(page, 10);
    await page.addStyleTag({ content: 'html{font-size:150%}' });
    await ten(page).click();
    await expect(page.getByRole('dialog', { name: 'Tirage ×10' })).toBeVisible();
    expect(await noHorizontalOverflow(page)).toBe(true);
  });

  test('reload during the grid: the same grid comes back (×50); falsified marker: last draw', async ({
    page,
  }) => {
    await partners(page, 10);
    await ten(page).click();
    const d = page.getByRole('dialog', { name: 'Tirage ×10' });
    await expect(d).toBeVisible();
    const names = await d.locator('.ten-name').allTextContents();
    for (let i = 0; i < 50; i++) {
      await page.reload();
      await expect(page.getByRole('dialog', { name: 'Tirage ×10' })).toBeVisible();
    }
    expect(await page.getByRole('dialog').locator('.ten-name').allTextContents()).toEqual(names);
    await page.evaluate(() => {
      const m = JSON.parse(localStorage.getItem('tgs-reveal-ten')!);
      m.results[9].stars = m.results[9].stars === 5 ? 1 : m.results[9].stars + 1;
      localStorage.setItem('tgs-reveal-ten', JSON.stringify(m));
    });
    await page.reload();
    const single = page.getByRole('dialog');
    await expect(single).toContainText('Dernier tirage (déjà enregistré');
    await expect(single.locator('.ten-item')).toHaveCount(0);
  });
});

test.describe('P9 rates in Menu (GS-V5-92/97, R-P43-1 option A)', () => {
  test('Menu opens the same rates dialog; Associés keeps its link; no write', async ({ page }) => {
    await start(page);
    await page.waitForTimeout(300);
    const before = await revision(page);
    await tab(page, 'Menu').click();
    const link = page.getByRole('button', { name: 'Taux de tirage' });
    await link.click();
    const d = page.getByRole('dialog', { name: /Taux/ });
    await expect(d).toBeVisible();
    const menuText = await d.textContent();
    expect(await axeViolations(page)).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(link).toBeFocused();
    await tab(page, 'Associés').click();
    await page.getByRole('button', { name: 'Taux de tirage' }).click();
    expect(await page.getByRole('dialog', { name: /Taux/ }).textContent()).toBe(menuText);
    await page.waitForTimeout(300);
    expect(await revision(page)).toBe(before);
  });
});
