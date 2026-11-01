import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { axeViolations } from './axe';

// Patch 0.4.2 (QA-REQUEST-PATCH-042 v1.1, GS-V5-66 to 79, R-P42-1 to 11). Harness build.
const midgame = JSON.parse(readFileSync('src/save/__fixtures__/v4-midgame.json', 'utf8')) as {
  work: Record<string, unknown>;
};
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

const tile = (page: Page) => page.getByRole('button', { name: 'Travailler', exact: true });
const tab = (page: Page, name: string) =>
  page.getByRole('navigation').getByRole('button', { name, exact: true });
const aoi = (page: Page) => page.getByRole('button', { name: /^Écrire avec Aoi \(1 énergie/ });
const game = (page: Page) => page.evaluate(() => window.__TGS_TEST__!.state()!);
const QUEST_GOALS = { quiz: 1, save: 1, invest: 3, visit: 1, click: 100 } as const;
type Q = keyof typeof QUEST_GOALS;

async function start(page: Page) {
  await page.goto('./');
  await expect(tile(page)).toBeVisible();
  await page.waitForFunction(() => !!window.__TGS_TEST__?.state());
}
/** Sets the quests listed in `done` to their goal (others at 0), through the harness save. */
async function quests(page: Page, done: Q[]) {
  await page.evaluate(
    async ([doneIds, goals]) => {
      const h = window.__TGS_TEST__!;
      const g = h.state()!;
      const progress = { ...g.quests.progress };
      for (const id of Object.keys(goals) as Q[])
        progress[id] = (doneIds as string[]).includes(id) ? goals[id] : 0;
      if (!(await h.loadSave({ ...g, quests: { ...g.quests, progress } })))
        throw new Error('loadSave refused');
    },
    [done, QUEST_GOALS] as const,
  );
}
async function openWork(page: Page) {
  await start(page);
  await tile(page).click();
  await expect(page.locator('.work')).toBeVisible();
}
async function watchLive(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __live: string[] };
    w.__live = [];
    const live = document.querySelector('[aria-live]')!;
    new MutationObserver(() => w.__live.push(live.textContent ?? '')).observe(live, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  });
}
const live = (page: Page) =>
  page.evaluate(() => (window as unknown as { __live: string[] }).__live);

/**
 * DEF-GS-18: computed contrast of an element's text and border against its effective background
 * (its own and its ancestors' background colours composited over white, alpha included).
 */
async function contrastOf(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const parse = (c: string) => {
      const m = c.match(/[\d.]+/g)!.map(Number);
      return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 };
    };
    type C = ReturnType<typeof parse>;
    const over = (top: C, under: C): C => ({
      r: top.r * top.a + under.r * (1 - top.a),
      g: top.g * top.a + under.g * (1 - top.a),
      b: top.b * top.a + under.b * (1 - top.a),
      a: 1,
    });
    const lum = (c: C) => {
      const f = (v: number) => {
        const x = v / 255;
        return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    };
    const ratio = (a: C, b: C) => {
      const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
      return (x + 0.05) / (y + 0.05);
    };
    const backOf = (from: Element | null) => {
      const layers: C[] = [];
      for (let e = from; e; e = e.parentElement) {
        const bg = parse(getComputedStyle(e).backgroundColor);
        if (bg.a > 0) layers.push(bg);
        if (bg.a >= 1) break;
      }
      return layers.reduceRight((acc, l) => over(l, acc), { r: 255, g: 255, b: 255, a: 1 });
    };
    return [...document.querySelectorAll<HTMLElement>(sel)]
      .filter((el) => el.getClientRects().length > 0)
      .map((el) => {
        const cs = getComputedStyle(el);
        const back = backOf(el);
        const around = backOf(el.parentElement);
        const text = over(parse(cs.color), back);
        const border = over(parse(cs.borderTopColor), around);
        return {
          name: (el.textContent ?? '').trim(),
          text: Math.round(ratio(text, back) * 100) / 100,
          border:
            parseFloat(cs.borderTopWidth) > 0
              ? Math.round(ratio(border, around) * 100) / 100
              : null,
        };
      });
  }, selector);
}

test('DEF-GS-18: every visible .btn-ghost is readable (screens and their dialogs)', async ({
  page,
}) => {
  await start(page);
  await page.evaluate(async (save) => {
    if (!(await window.__TGS_TEST__!.loadSave(save))) throw new Error('loadSave refused');
  }, midgame);
  const seen: string[] = [];
  const check = async (where: string) => {
    for (const c of await contrastOf(page, '.btn-ghost')) {
      seen.push(`${where}: ${c.name} ${c.text}/${c.border}`);
      expect(c.text, `${where} « ${c.name} » text`).toBeGreaterThanOrEqual(4.5);
      if (c.border !== null)
        expect(c.border, `${where} « ${c.name} » border`).toBeGreaterThanOrEqual(3);
    }
  };
  for (const hash of ['home', 'invest', 'friends', 'partners', 'settings']) {
    await page.goto(`./#${hash}`);
    await page.waitForFunction(() => !!window.__TGS_TEST__?.state());
    await check(hash);
  }
  // « Nouvelle partie » (its dialog), then the reset backup's restore confirmation.
  await page.getByRole('button', { name: 'Nouvelle partie' }).click();
  await check('settings reset dialog');
  await page.locator('dialog[open] .btn-danger').click();
  await page.goto('./#settings');
  await page.waitForFunction(() => !!window.__TGS_TEST__?.state());
  await expect(page.getByRole('button', { name: 'Restaurer la partie précédente' })).toBeVisible();
  await check('settings after reset');
  const openers = page.locator('main .btn-ghost', {
    hasText: /Restaurer|Revenir|partie précédente/,
  });
  for (let i = 0; i < (await openers.count()); i++) {
    await openers.nth(i).click();
    if (await page.locator('dialog[open]').count()) {
      await check(`settings dialog ${i}`);
      await page.keyboard.press('Escape');
      await expect(page.locator('dialog[open]')).toHaveCount(0);
    }
  }
  console.log(seen.join('\n'));
  expect(seen.some((x) => x.startsWith('settings dialog'))).toBe(true);
});

test.describe('quests (GS-V5-66 to 69)', () => {
  for (const vp of [
    { width: 360, height: 640 },
    { width: 390, height: 844 },
  ]) {
    test(`DEF-GS-18: « Fermer » is readable on the light dialog head at ${vp.width}x${vp.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(vp);
      await start(page);
      await page.getByRole('button', { name: 'Quêtes du jour' }).click();
      await expect(page.locator('.dlg-close')).toBeVisible();
      const [c] = await contrastOf(page, 'dialog[open] .dlg-close');
      expect(c.name).toBe('Fermer');
      expect(c.text, 'text').toBeGreaterThanOrEqual(4.5);
      expect(c.border, 'border').toBeGreaterThanOrEqual(3);
    });
  }
  for (const font of ['100%', '120%']) {
    test(`GS-V5-66: one « Fermer », top right, visible without scrolling (font ${font})`, async ({
      page,
    }) => {
      await start(page);
      await page.addStyleTag({ content: `html{font-size:${font}}` });
      const opener = page.getByRole('button', { name: /Quêtes du jour/ });
      await opener.click();
      const dlg = page.getByRole('dialog', { name: 'Quêtes du jour' });
      const close = dlg.getByRole('button', { name: 'Fermer' });
      await expect(close).toHaveCount(1);
      await expect(close).toBeInViewport({ ratio: 1 });
      const b = (await close.boundingBox())!;
      const d = (await dlg.boundingBox())!;
      expect(b.height).toBeGreaterThanOrEqual(44);
      expect(b.x + b.width / 2).toBeGreaterThan(d.x + d.width / 2); // right half
      // Still visible once the list is scrolled to its end (sticky).
      await dlg.evaluate((e) => e.scrollTo(0, e.scrollHeight));
      await expect(close).toBeInViewport({ ratio: 1 });
      await close.click();
      await expect(page).toHaveURL(/#home$/);
      await expect(opener).toBeFocused();
    });
  }

  test('GS-V5-67: unfinished rows open their activity; back returns home in 1 step', async ({
    page,
  }) => {
    await start(page);
    for (const [name, hash] of [
      [/^Faire 100 clics/, /#work$/],
      [/^Épargner une fois/, /#invest$/],
      [/^Acheter 3 niveaux/, /#invest$/],
      [/^Passer du temps avec un ami/, /#friends$/],
    ] as const) {
      await page.getByRole('button', { name: /Quêtes du jour/ }).click();
      await page
        .getByRole('dialog', { name: 'Quêtes du jour' })
        .getByRole('button', { name })
        .click();
      await expect(page).toHaveURL(hash);
      await expect(page.getByRole('dialog', { name: 'Quêtes du jour' })).toBeHidden();
      await page.goBack();
      await expect(page).toHaveURL(/#home$/);
    }
    // Quiz row: the quiz opens on top; once closed, focus on the quiz row action (R-P42-8).
    await page.getByRole('button', { name: /Quêtes du jour/ }).click();
    await page.getByRole('button', { name: /^Quiz de Kyoko-sensei/ }).click();
    const quiz = page.getByRole('dialog', { name: 'Quiz de Kyoko-sensei' });
    await quiz.getByRole('button', { name: 'Fermer' }).click();
    await expect(page.locator('#quest-action-quiz')).toBeFocused();
  });

  test('GS-V5-68: a finished row is not a link; only « Récupérer » stays', async ({ page }) => {
    await start(page);
    await quests(page, ['click']);
    await page.getByRole('button', { name: /Quêtes du jour/ }).click();
    const dlg = page.getByRole('dialog', { name: 'Quêtes du jour' });
    await expect(dlg.getByRole('button', { name: /^Faire 100 clics/ })).toHaveCount(0);
    await expect(dlg.locator('#quest-action-click')).toHaveText('Récupérer');
    await expect(dlg.locator('.quest-go')).toHaveCount(4);
    expect(await axeViolations(page)).toEqual([]);
  });
});

test.describe('pending dots (GS-V5-70, 71, R-P42-7, R-P42-9)', () => {
  /** Every dot: top-right quarter, inside its owner and the viewport, no overlap (> 0.5 px). */
  async function dots(page: Page) {
    return page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.dot')]
        .filter((d) => d.getBoundingClientRect().width > 0)
        .map((d) => {
          const owner = d.parentElement!.closest('button, article')!;
          const o = owner.getBoundingClientRect();
          const r = d.getBoundingClientRect();
          const cs = getComputedStyle(d);
          const others = [...owner.querySelectorAll<HTMLElement>('*')]
            .filter((e) => e !== d && !e.contains(d) && !e.classList.contains('visually-hidden'))
            .filter(
              (e) =>
                [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim()) ||
                e.matches('.hub-ill, .hub-emoji, img'),
            )
            .map((e) => e.getBoundingClientRect())
            .filter((b) => b.width > 0 && b.height > 0);
          const overlap = others.some(
            (b) =>
              Math.min(b.right, r.right) - Math.max(b.left, r.left) > 0.5 &&
              Math.min(b.bottom, r.bottom) - Math.max(b.top, r.top) > 0.5,
          );
          return {
            owner: (owner.getAttribute('aria-labelledby') ?? owner.textContent ?? '').replace(
              /[^A-Za-zÀ-ÿ-]/g,
              '',
            ),
            described: owner.getAttribute('aria-describedby'),
            desc: document.getElementById(owner.getAttribute('aria-describedby') ?? '')
              ?.textContent,
            topRight: r.left >= o.left + o.width / 2 && r.bottom <= o.top + o.height / 2,
            inside:
              r.left >= o.left - 0.5 &&
              r.right <= o.right + 0.5 &&
              r.top >= o.top - 0.5 &&
              r.bottom <= o.bottom + 0.5 &&
              r.right <= innerWidth &&
              r.bottom <= innerHeight,
            overlap,
            color: cs.backgroundColor,
            animated: d.getAnimations().length > 0 || cs.animationName !== 'none',
            text: d.textContent,
          };
        }),
    );
  }

  for (const vp of [
    { width: 360, height: 640 },
    { width: 390, height: 844 },
  ]) {
    test(`fresh day at ${vp.width}x${vp.height}: tile, 2 tabs, quests card; static coral`, async ({
      page,
    }) => {
      await page.setViewportSize(vp);
      await start(page);
      const all = await dots(page);
      expect(all.map((d) => d.owner).sort()).toEqual([
        'Amis',
        'Investir',
        'Travailler',
        'quests-card-title',
      ]);
      for (const d of all) {
        expect(d, d.owner).toMatchObject({
          topRight: true,
          inside: true,
          overlap: false,
          color: 'rgb(255, 107, 94)',
          animated: false,
          text: '',
          desc: 'Quête à faire',
        });
      }
      // The tile keeps the exact name « Travailler » (GS-V5-64 b).
      await expect(tile(page)).toHaveAccessibleDescription('Quête à faire');
      // GS-V5-70: no info card label cut at this size.
      const cut = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('.info h2, .info .info-big')]
          .filter((e) => e.scrollWidth > e.clientWidth + 0.5)
          .map((e) => e.textContent),
      );
      expect(cut).toEqual([]);
      // No tab bar dot on Accueil or Menu, and none on « Quêtes du jour » (Q2).
      await expect(tab(page, 'Accueil').locator('.dot')).toHaveCount(0);
      await expect(page.locator('.quests-btn .dot')).toHaveCount(0);
      expect(await axeViolations(page)).toEqual([]);
    });
  }

  test('truth table: Investir keeps its dot while save or invest is to do', async ({ page }) => {
    await start(page);
    const inv = tab(page, 'Investir');
    await quests(page, ['save']);
    await expect(inv.locator('.dot')).toHaveCount(1);
    await quests(page, ['invest']);
    await expect(inv.locator('.dot')).toHaveCount(1);
    await quests(page, ['save', 'invest']);
    await expect(inv.locator('.dot')).toHaveCount(0);
    await expect(inv).not.toHaveAttribute('aria-describedby', /./);
    // Dot and description go in the same render, without any live announcement.
    await watchLive(page);
    await quests(page, ['save', 'invest', 'visit', 'click', 'quiz']);
    await expect(page.locator('.dot')).toHaveCount(0);
    await expect(page.locator('[aria-describedby="desc-quest-todo"]')).toHaveCount(0);
    await expect(tile(page)).not.toHaveAttribute('aria-describedby', /./);
    expect(await live(page)).toEqual([]);
  });
});

test.describe('Travailler (GS-V5-73 to 78)', () => {
  test('GS-V5-73/74: no « ← Accueil », no Roman / Presse; Accueil tab is the section', async ({
    page,
  }) => {
    await openWork(page);
    await expect(page.getByRole('button', { name: '← Accueil' })).toHaveCount(0);
    await expect(page.getByRole('radiogroup')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Activer le boost/ })).toHaveCount(0);
    await expect(tab(page, 'Accueil')).toHaveAttribute('aria-current', 'true');
    expect(await axeViolations(page)).toEqual([]);
  });

  test('GS-V5-74 / R-P42-4: a 0.4.1 save in presse comes back as roman, cursor 0', async ({
    page,
  }) => {
    await start(page);
    const w = {
      ...midgame.work,
      mode: 'presse',
      cursor: 37,
      points: 456,
      pointsTotal: 9876,
      taps: 1234,
    };
    await page.evaluate(
      async (save) => {
        if (!(await window.__TGS_TEST__!.loadSave(save))) throw new Error('loadSave refused');
      },
      { ...midgame, work: w },
    );
    expect((await game(page)).work).toMatchObject({
      mode: 'roman',
      cursor: 0,
      points: 456,
      pointsTotal: 9876,
      taps: 1234,
    });
    await page.reload();
    await page.waitForFunction(() => !!window.__TGS_TEST__?.state());
    expect((await game(page)).work).toMatchObject({ mode: 'roman', cursor: 0, points: 456 });
  });

  test('GS-V5-75 / R-P42-2: one gesture = exactly one tap (mouse, touch, keyboard)', async ({
    page,
  }) => {
    await openWork(page);
    const target = aoi(page);
    const count = async () => {
      const g = await game(page);
      return [g.work.taps, g.totalClicks, g.quests.progress.click];
    };
    const step = async (label: string, act: () => Promise<unknown>, plus: number) => {
      const [a, b, c] = await count();
      await act();
      await page.evaluate(() => window.__TGS_TEST__!.advance(1000)); // out of the 15/s window
      expect(await count(), label).toEqual([a! + plus, b! + plus, c! + plus]);
    };
    await step('mouse', () => target.click(), 1);
    await step('touch', () => target.tap(), 1);
    await target.focus();
    await step('Enter', () => page.keyboard.press('Enter'), 1);
    await step('Space', () => page.keyboard.press(' '), 1);
    // pointerdown then a late click (detail 0, as some touch browsers send): still one.
    await step(
      'pointerdown + click',
      () =>
        target.evaluate((el) => {
          el.dispatchEvent(
            new PointerEvent('pointerdown', {
              bubbles: true,
              pointerId: 7,
              pointerType: 'touch',
              isPrimary: true,
            }),
          );
          el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
        }),
      1,
    );
    // Two fingers at once: at most 2 taps, never 4.
    await step(
      'two pointers',
      () =>
        target.evaluate((el) => {
          for (const id of [11, 12])
            el.dispatchEvent(
              new PointerEvent('pointerdown', {
                bubbles: true,
                pointerId: id,
                pointerType: 'touch',
                isPrimary: id === 11,
              }),
            );
          for (const id of [11, 12]) {
            el.dispatchEvent(
              new PointerEvent('pointerup', { bubbles: true, pointerId: id, pointerType: 'touch' }),
            );
            el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
          }
        }),
      2,
    );
    // A refused tap (no energy) counts for nothing.
    await page.evaluate(() => window.__TGS_TEST__!.setEnergy(0));
    await step('refused', () => target.click(), 0);
    const css = await target.evaluate((el) => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const w = document.querySelector('.work')!.getBoundingClientRect();
      return {
        touch: s.touchAction,
        select: s.userSelect || s.getPropertyValue('-webkit-user-select'),
        w: r.width,
        h: r.height,
        area: (r.width * r.height) / (w.width * w.height),
      };
    });
    expect(css.touch).toBe('manipulation');
    expect(css.select).toBe('none');
    expect(css.w).toBeGreaterThanOrEqual(44);
    expect(css.h).toBeGreaterThanOrEqual(44);
    expect(css.area).toBeGreaterThanOrEqual(0.4);
    // The document is decoration only: not a button, not in the accessibility tree.
    await expect(page.locator('.doc')).toHaveAttribute('aria-hidden', 'true');
  });

  test('GS-V5-76 / R-P42-1: in the zone (bounds included) → boost; x2 until 4 999 ms', async ({
    page,
  }) => {
    await openWork(page);
    const work = page.locator('.work');
    for (const p of [0.35, 0.5, 0.65]) {
      await page.evaluate(() => window.__TGS_TEST__!.advance(61_000)); // past any cooldown
      await watchLive(page);
      await page.evaluate((c) => {
        window.__TGS_TEST__!.setEnergy(100);
        window.__TGS_TEST__!.boostShow();
        window.__TGS_TEST__!.setCursor(c);
      }, p);
      await expect(work).toHaveAttribute('data-boost-phase', 'shown');
      const p0 = (await game(page)).work.points;
      await aoi(page).click(); // triggering tap: x1 (D4)
      await expect(work).toHaveAttribute('data-boost-phase', 'active');
      expect((await game(page)).work.points, `trigger ${p}`).toBe(p0 + 1);
      await expect.poll(() => live(page)).toContain('POWER BOOST x2 pendant 5 secondes');
      await page.evaluate(() => window.__TGS_TEST__!.advance(4999));
      await aoi(page).click();
      expect((await game(page)).work.points, `x2 at 4 999 ms, ${p}`).toBe(p0 + 3);
      await page.evaluate(() => window.__TGS_TEST__!.advance(1));
      await aoi(page).click();
      expect((await game(page)).work.points, `x1 at 5 000 ms, ${p}`).toBe(p0 + 4);
      await expect(work).toHaveAttribute('data-boost-phase', 'cooldown');
    }
  });

  test('GS-V5-76 / R-P42-1: off the zone (0.349, 0.651) → nothing; gauge until 12 000 ms', async ({
    page,
  }) => {
    await openWork(page);
    const work = page.locator('.work');
    for (const p of [0.349, 0.651]) {
      await page.evaluate(() => window.__TGS_TEST__!.advance(61_000));
      await page.evaluate((c) => {
        window.__TGS_TEST__!.setEnergy(100);
        window.__TGS_TEST__!.boostShow();
        window.__TGS_TEST__!.setCursor(c);
      }, p);
      await expect(work).toHaveAttribute('data-boost-phase', 'shown');
      await watchLive(page);
      const state0 = await work.getAttribute('data-aoi-state');
      const video0 = await page.evaluate(() => document.querySelector('.ws.on')?.outerHTML);
      const p0 = (await game(page)).work.points;
      for (let i = 0; i < 5; i++) {
        await aoi(page).click();
        await page.evaluate(() => window.__TGS_TEST__!.advance(1000));
      }
      expect((await game(page)).work.points, `x1 off the zone ${p}`).toBe(p0 + 5);
      await expect(work).toHaveAttribute('data-boost-phase', 'shown');
      await expect(page.locator('.boost')).toBeVisible();
      await expect(work).toHaveAttribute('data-aoi-state', state0!);
      expect(await page.evaluate(() => document.querySelector('.ws.on')?.outerHTML)).toBe(video0);
      await page.evaluate(() => window.__TGS_TEST__!.advance(11_999 - 5000));
      await expect(work).toHaveAttribute('data-boost-phase', 'shown');
      await page.evaluate(() => window.__TGS_TEST__!.advance(1));
      await expect(work).toHaveAttribute('data-boost-phase', 'cooldown');
      expect((await live(page)).filter((m) => /POWER BOOST|Raté/.test(m))).toEqual([]);
    }
  });

  test('GS-V5-77: the gauge is at least 16 px lower than in 0.4.1', async ({ page }) => {
    // 0.4.1 reference (9fa3e02, both 360x640 and 390x844): `.boost` top = 128 px in `.work`.
    const REF_TOP = 128;
    for (const vp of [
      { width: 360, height: 640 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(vp);
      await openWork(page);
      await page.evaluate(() => window.__TGS_TEST__!.boostShow());
      const top = await page.evaluate(
        () =>
          document.querySelector('.boost')!.getBoundingClientRect().top -
          document.querySelector('.work')!.getBoundingClientRect().top,
      );
      expect(top - REF_TOP, `${vp.width}x${vp.height}`).toBeGreaterThanOrEqual(16);
    }
  });

  test('DEF-GS-20: 987 654 points at 100 % and 120 % font: number, rate and button do not overlap', async ({
    page,
  }) => {
    await openWork(page);
    await page.evaluate(async () => {
      const h = window.__TGS_TEST__!;
      const g = h.state()!;
      const work = { ...g.work, points: 987654, pointsTotal: 987654 };
      if (!(await h.loadSave({ ...g, work }))) throw new Error('loadSave refused');
    });
    await expect(page.locator('.work-panel .num')).toHaveText(/987/);
    for (const font of ['100%', '120%']) {
      if (font === '120%') await page.addStyleTag({ content: 'html{font-size:120%}' });
      for (const vp of [
        { width: 360, height: 640 },
        { width: 390, height: 844 },
      ]) {
        await page.setViewportSize(vp);
        const m = await page.evaluate(() => {
          const panel = document.querySelector('.work-panel')!;
          const r = (el: Element) => {
            // Ink extent of the text, not the box: a range around the contents.
            const range = document.createRange();
            range.selectNodeContents(el);
            const b = range.getBoundingClientRect();
            return { l: b.left, r: b.right, t: b.top, b: b.bottom };
          };
          const btn = panel.querySelector('.btn')!.getBoundingClientRect();
          return {
            num: r(panel.querySelector('.pts .num')!),
            rate: r(panel.querySelector('.rate-l')!),
            btn: { l: btn.left, r: btn.right, t: btn.top, b: btn.bottom },
            panel: panel.getBoundingClientRect().height,
            hScroll: document.documentElement.scrollWidth > window.innerWidth,
            panelCut: panel.scrollWidth > panel.clientWidth + 0.5,
          };
        });
        const at = `${vp.width}x${vp.height} font ${font}`;
        console.log(at, JSON.stringify(m));
        const apart = (a: typeof m.btn, b: typeof m.btn) =>
          a.r <= b.l || b.r <= a.l || a.b <= b.t || b.b <= a.t;
        expect(apart(m.num, m.btn), `${at} number vs button`).toBe(true);
        expect(apart(m.rate, m.btn), `${at} rate vs button`).toBe(true);
        expect(apart(m.num, m.rate), `${at} number vs rate`).toBe(true);
        expect(m.btn.l - Math.max(m.num.r, m.rate.r), `${at} gap to button`).toBeGreaterThanOrEqual(
          4,
        );
        expect(m.hScroll, `${at} horizontal scroll`).toBe(false);
        expect(m.panelCut, `${at} panel content cut`).toBe(false);
        expect(m.panel, at).toBeLessThanOrEqual(font === '100%' ? 64 : 96);
      }
    }
  });

  test('GS-V5-77 / DEF-GS-19: the conversion panel is ≤ 64 px, one-line rate, button ≥ 44 px', async ({
    page,
  }) => {
    // 0.4.1 / 5c7ffa2 references (Crypto): 121 px, then 89 px at 360x640 and 70 px at 390x844.
    await openWork(page);
    for (const label of ['fresh', 'large points']) {
      if (label === 'large points') {
        await page.evaluate(async () => {
          const h = window.__TGS_TEST__!;
          const g = h.state()!;
          const work = { ...g.work, points: 987654, pointsTotal: 987654 };
          if (!(await h.loadSave({ ...g, work }))) throw new Error('loadSave refused');
        });
        await expect(page.locator('.work-panel .num')).toHaveText(/987/);
      }
      for (const vp of [
        { width: 360, height: 640 },
        { width: 390, height: 844 },
      ]) {
        await page.setViewportSize(vp);
        const m = await page.evaluate(() => {
          const panel = document.querySelector('.work-panel')!;
          const rate = panel.querySelector<HTMLElement>('.rate-l')!;
          const lh = parseFloat(getComputedStyle(rate).lineHeight);
          return {
            panel: panel.getBoundingClientRect().height,
            rateLines: Math.round(rate.getBoundingClientRect().height / lh),
            rateCut: rate.scrollWidth > rate.clientWidth + 0.5,
            button: panel.querySelector('.btn')!.getBoundingClientRect().height,
          };
        });
        const at = `${vp.width}x${vp.height} ${label}`;
        console.log(at, JSON.stringify(m));
        expect(m.panel, at).toBeLessThanOrEqual(64);
        expect(m.rateLines, at).toBe(1);
        expect(m.rateCut, at).toBe(false);
        expect(m.button, at).toBeGreaterThanOrEqual(44);
      }
    }
    await expect(page.locator('.work-panel .rate-l')).toHaveText('100 pts = 10 ¥');
  });

  test('GS-V5-78 / R-P42-6: Aoi shows ≥ 120 % of the 0.4.1 source height at 360x640', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' }); // same CSS for the still image
    await page
      .addStyleTag({ content: ':root{--safe-top:47px;--safe-bottom:34px}' })
      .catch(() => undefined);
    await openWork(page);
    const m = await page.evaluate(() => {
      const img = document.querySelector<HTMLElement>('.ws.on')!;
      const s = getComputedStyle(img);
      const r = img.getBoundingClientRect();
      const tabbar = document.querySelector('.tabbar')!.getBoundingClientRect().top;
      return {
        fit: s.objectFit,
        pos: s.objectPosition,
        w: r.width,
        h: r.height,
        bottom: r.bottom,
        tabbar,
      };
    });
    expect(m.fit).toBe('contain');
    expect(m.pos).toBe('50% 100%');
    // 0.4.1 (cover, measured box 324x443): visible source height = 443 / max(324/480, 443/884).
    const before = 443 / Math.max(324 / 480, 443 / 884);
    // 0.4.2 (contain): the whole 884 px source height is shown.
    const scale = Math.min(m.w / 480, m.h / 884);
    expect(884 * scale).toBeLessThanOrEqual(m.h + 0.5);
    expect(884 / before).toBeGreaterThanOrEqual(1.2);
    expect(m.bottom).toBeLessThanOrEqual(m.tabbar + 0.5); // not under the tab bar
  });
});

test.describe('Stats (GS-V5-79 / R-P42-5)', () => {
  for (const vp of [
    { width: 360, height: 640 },
    { width: 390, height: 844 },
  ]) {
    for (const font of ['100%', '120%', '200%']) {
      test(`${vp.width}x${vp.height}, font ${font}: full rows, ≥ 14 px, no ellipsis or h-scroll`, async ({
        page,
      }) => {
        await page.setViewportSize(vp);
        await start(page);
        await page.addStyleTag({ content: `html{font-size:${font}}` });
        await page.locator('.stats-open').click();
        const dlg = page.getByRole('dialog', { name: /Stats d’Aoi/ });
        await expect(dlg).toBeVisible();
        const r = await dlg.evaluate((d) => {
          const rows = [...d.querySelectorAll<HTMLElement>('.stats li')];
          return {
            rows: rows.length,
            minFont: Math.min(
              ...rows.map((li) => parseFloat(getComputedStyle(li.firstElementChild!).fontSize)),
            ),
            cut: rows
              .map((li) => li.firstElementChild as HTMLElement)
              .filter((s) => s.scrollWidth > s.clientWidth + 0.5)
              .map((s) => s.textContent),
            hscroll: d.scrollWidth - d.clientWidth,
          };
        });
        expect(r.rows).toBe(10);
        if (font === '100%') expect(r.minFont).toBeGreaterThanOrEqual(14);
        expect(r.cut).toEqual([]);
        expect(r.hscroll).toBeLessThanOrEqual(0);
        const close = dlg.getByRole('button', { name: 'Fermer' });
        await close.scrollIntoViewIfNeeded();
        await expect(close).toBeInViewport();
        expect((await close.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        if (font === '100%') expect(await axeViolations(page)).toEqual([]);
        await close.click();
        await expect(dlg).toBeHidden();
      });
    }
  }
});
