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
    await expect(page.locator('#amsg-name')).toHaveText('Omar');
    await expect(page.locator('.amsg-stars')).toHaveText('★★★');
    await expect(page.locator('.amsg-av, .amsg-av img').first()).toBeVisible();
    await expect(page.locator('.amsg-on')).toHaveCount(0);
    await expect(page.locator('.amsg-head')).not.toContainText('en ligne');
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

  test('a rapid double tap on the veil advances only one state (R-052D-01 / DEF-GS-44 D11)', async ({
    page,
  }) => {
    await openOmarAndCall(page);
    const veil = page.locator('.amsg-veil');
    await veil.click({ clickCount: 2 });
    await expect(page.locator('#amsg-bubble')).toBeVisible();
    // Wait past the 180 ms exit: without the 250 ms lock the panel would already be gone.
    await page.waitForTimeout(400);
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

/** Contrast including the element's opacity and ancestor backgrounds (DEF-GS-38). */
async function contrastOfCallButton(page: Page) {
  return page.evaluate(() => {
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
    const el = document.querySelector<HTMLElement>('[id^="af-call-"]');
    if (!el) throw new Error('call button missing');
    const cs = getComputedStyle(el);
    let opac = 1;
    for (let n: HTMLElement | null = el; n; n = n.parentElement) {
      opac *= Number(getComputedStyle(n).opacity);
    }
    const layers: C[] = [];
    for (let n: HTMLElement | null = el; n; n = n.parentElement) {
      const bg = parse(getComputedStyle(n).backgroundColor);
      if (bg.a > 0) layers.push(bg);
      if (bg.a >= 1) break;
    }
    const behind = layers
      .slice(1)
      .reduceRight((acc, l) => over(l, acc), { r: 27, g: 42, b: 74, a: 1 });
    const own = layers[0] ?? { r: 0, g: 0, b: 0, a: 0 };
    const fadedBg = over({ ...own, a: own.a * opac }, behind);
    const col = parse(cs.color);
    const fadedText = over({ ...col, a: col.a * opac }, fadedBg);
    const hex = (c: C) =>
      '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
    return {
      label: (el.textContent ?? '').trim(),
      color: cs.color,
      backgroundColor: cs.backgroundColor,
      opacity: Number(cs.opacity),
      cumulativeOpacity: Math.round(opac * 1000) / 1000,
      textHex: hex(fadedText),
      bgHex: hex(fadedBg),
      contrast: Math.round(ratio(fadedText, fadedBg) * 100) / 100,
    };
  });
}

const OWNED = [
  { id: 'haru' as const, name: 'Haru', stars: 1, durationMs: 30 * 60_000 },
  { id: 'noa' as const, name: 'Noa', stars: 2, durationMs: 30 * 60_000 },
  { id: 'omar' as const, name: 'Omar', stars: 3, durationMs: 60 * 60_000 },
];

async function ownAndOpen(page: Page, who: (typeof OWNED)[number]) {
  await start(page);
  const ok = await page.evaluate(async ({ id, stars }) => {
    const api = window.__TGS_TEST__!;
    const g = api.state();
    if (!g) return false;
    return api.loadSave({
      ...g,
      gacha: { ...g.gacha, stars: { ...g.gacha.stars, [id]: stars }, last: null },
      investments: { ...g.investments, save: 1, stock: 1 },
    });
  }, who);
  expect(ok).toBe(true);
  await tab(page, 'Associés').click();
  await page
    .getByRole('button', { name: new RegExp(`Voir le profil de ${who.name}`, 'i') })
    .click();
  await expect(page.locator('.assoc-sheet')).toBeVisible();
}

test.describe('DEF-GS-38 call button contrast on the sheet', () => {
  for (const who of OWNED) {
    test(`${who.name}: Boost actif and De retour dans are ≥ 4.5:1`, async ({ page }) => {
      await ownAndOpen(page, who);
      await page
        .getByRole('button', { name: new RegExp(`Faire appel à ${who.name}`, 'i') })
        .click();
      const panel = page.locator('dialog.amsg[open]');
      await expect(panel).toBeVisible();
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await expect(panel).toHaveCount(0);
      const btn = page.locator(`#af-call-${who.id}`);
      await expect(btn).toContainText(/Boost actif/);
      const active = await contrastOfCallButton(page);
      expect(
        active.contrast,
        `${who.name} active ${active.textHex} on ${active.bgHex} (opacity ${active.opacity})`,
      ).toBeGreaterThanOrEqual(4.5);
      expect(active.opacity).toBe(1);
      // Advancing the game clock alone cannot shorten remaining time (DEF-GS-29
      // wall anchors). Load a cooling entry whose game and wall ends are already past.
      const cooled = await page.evaluate(async ({ id, durationMs }) => {
        const api = window.__TGS_TEST__!;
        const g = api.state();
        if (!g) return false;
        const now = api.now();
        const wall = Date.now();
        const cool = 4 * 60 * 60_000;
        const activatedAt = now - durationMs - 1000;
        const wallAct = wall - durationMs - 1000;
        return api.loadSave({
          ...g,
          appel: {
            ...g.appel,
            [id]: {
              activatedAt,
              endsAt: now - 1000,
              cooldownUntil: activatedAt + cool,
              wallEndsAt: wall - 1000,
              wallCooldownUntil: wallAct + cool,
              activationId: `e2e-gs38-${id}`,
            },
          },
        });
      }, who);
      expect(cooled).toBe(true);
      await expect(btn).toContainText(/De retour dans/);
      const cool = await contrastOfCallButton(page);
      expect(
        cool.contrast,
        `${who.name} cooling ${cool.textHex} on ${cool.bgHex} (opacity ${cool.opacity})`,
      ).toBeGreaterThanOrEqual(4.5);
      expect(cool.opacity).toBe(1);
      expect(await axeViolations(page)).toEqual([]);
    });
  }
});

test.describe('DEF-GS-40 exit animation', () => {
  test('pointer close keeps the panel above the sheet until the animation ends', async ({
    page,
  }) => {
    await openOmarAndCall(page);
    await page.locator('dialog.amsg').click();
    await expect(page.locator('#amsg-bubble')).toBeVisible();
    await page.waitForTimeout(300);
    await page.locator('dialog.amsg').click();
    await page.waitForTimeout(40);
    const snap = await page.evaluate(() => {
      const dlg = document.querySelector('dialog.amsg') as HTMLDialogElement | null;
      const sheet = document.querySelector('.amsg-sheet') as HTMLElement | null;
      if (!dlg || !sheet) return null;
      const r = sheet.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return {
        open: dlg.open,
        out: dlg.classList.contains('out'),
        opacity: Number(getComputedStyle(sheet).opacity),
        topIsPanel: !!(top && top.closest('dialog.amsg')),
      };
    });
    expect(snap).toBeTruthy();
    expect(snap!.open).toBe(true);
    expect(snap!.out).toBe(true);
    expect(snap!.opacity).toBeGreaterThan(0);
    expect(snap!.topIsPanel).toBe(true);
    await expect(page.locator('dialog.amsg[open]')).toHaveCount(0, { timeout: 1000 });
    await expect(page.locator('.assoc-sheet')).toBeVisible();
  });
});

async function sampleRetourPadding(page: Page) {
  const back = page.locator('.assoc-sheet-back');
  const box = await back.boundingBox();
  if (!box) throw new Error('Retour box missing');
  const clip = {
    x: Math.round(box.x + box.width - 12),
    y: Math.round(box.y + box.height / 2 - 4),
    width: 8,
    height: 8,
  };
  const buf = await page.screenshot({ clip });
  return page.evaluate(async (b64) => {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('png'));
      img.src = `data:image/png;base64,${b64}`;
    });
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    const pixels: { r: number; g: number; b: number; a: number }[] = [];
    for (let i = 0; i < data.length; i += 4) {
      pixels.push({ r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] });
    }
    return pixels;
  }, buf.toString('base64'));
}

function assertNavyPixels(
  samples: { r: number; g: number; b: number; a: number }[],
  label: string,
) {
  expect(samples.length, label).toBeGreaterThan(0);
  for (const px of samples) {
    expect(px.a, `${label} ${JSON.stringify(px)}`).toBeGreaterThanOrEqual(250);
    expect(Math.abs(px.r - 27), `${label} ${JSON.stringify(px)}`).toBeLessThanOrEqual(12);
    expect(Math.abs(px.g - 42), `${label} ${JSON.stringify(px)}`).toBeLessThanOrEqual(12);
    expect(Math.abs(px.b - 74), `${label} ${JSON.stringify(px)}`).toBeLessThanOrEqual(12);
  }
}

test.describe('DEF-GS-42 sticky Retour button', () => {
  for (const who of OWNED) {
    test(`${who.name}: the title does not show through « ← Retour » at 120 and 200 px`, async ({
      page,
    }) => {
      await ownAndOpen(page, who);
      const back = page.locator('.assoc-sheet-back');
      await expect(back).toBeVisible();
      const bio = page.locator('.assoc-sheet-bio summary');
      if (await bio.count()) await bio.click();

      const bg = await back.evaluate((el) => {
        const c = getComputedStyle(el).backgroundColor;
        const m = c.match(/[\d.]+/g)!.map(Number);
        return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1, raw: c };
      });
      expect(bg.a, `Retour background ${bg.raw}`).toBe(1);
      expect(Math.abs(bg.r - 27)).toBeLessThanOrEqual(1);
      expect(Math.abs(bg.g - 42)).toBeLessThanOrEqual(1);
      expect(Math.abs(bg.b - 74)).toBeLessThanOrEqual(1);

      // Shrink the dialog so both scroll positions pull the title under the button.
      await page.evaluate(() => {
        const sheet = document.querySelector('.assoc-sheet') as HTMLElement;
        const dialog = sheet.closest('dialog') as HTMLElement;
        dialog.style.maxHeight = '360px';
        dialog.style.height = '360px';
        dialog.style.overflow = 'auto';
      });

      for (const y of [120, 200]) {
        const scrolled = await page.evaluate((top) => {
          const sheet = document.querySelector('.assoc-sheet') as HTMLElement;
          const dialog = sheet.closest('dialog') as HTMLElement;
          dialog.scrollTop = top;
          return { scrollTop: dialog.scrollTop, scrollHeight: dialog.scrollHeight };
        }, y);
        expect(scrolled.scrollTop, `${who.name} at ${y}`).toBeGreaterThanOrEqual(y);
        const samples = await sampleRetourPadding(page);
        assertNavyPixels(samples, `${who.name} at ${y}px`);
      }
    });
  }
});

async function snapExitFade(page: Page) {
  await expect(page.locator('#amsg-bubble')).toBeVisible();
  await page.locator('dialog.amsg').click();
  await page.waitForTimeout(40);
  return page.evaluate(() => {
    const dlg = document.querySelector('dialog.amsg') as HTMLDialogElement | null;
    const sheet = document.querySelector('.amsg-sheet') as HTMLElement | null;
    const veil = document.querySelector('.amsg-veil') as HTMLElement | null;
    if (!dlg || !sheet || !veil) return null;
    return {
      open: dlg.open,
      out: dlg.classList.contains('out'),
      sheetOpacity: Number(getComputedStyle(sheet).opacity),
      veilOpacity: Number(getComputedStyle(veil).opacity),
      sheetTransform: getComputedStyle(sheet).transform,
      sheetName: getComputedStyle(sheet).animationName,
    };
  });
}

function assertExitFade(snap: Awaited<ReturnType<typeof snapExitFade>>) {
  expect(snap).toBeTruthy();
  expect(snap!.open).toBe(true);
  expect(snap!.out).toBe(true);
  expect(snap!.sheetOpacity).toBeGreaterThan(0);
  expect(snap!.sheetOpacity).toBeLessThan(1);
  expect(snap!.veilOpacity).toBeGreaterThan(0);
  expect(snap!.veilOpacity).toBeLessThan(1);
  expect(
    snap!.sheetTransform === 'none' || snap!.sheetTransform === 'matrix(1, 0, 0, 1, 0, 0)',
  ).toBe(true);
  expect(snap!.sheetName.toLowerCase()).toContain('amsgveilout');
}

test.describe('DEF-GS-43 reduced-motion exit fade', () => {
  test('the sheet fades with the veil (~120 ms, no transform)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openOmarAndCall(page);
    const snap = await snapExitFade(page);
    assertExitFade(snap);
    await expect(page.locator('dialog.amsg[open]')).toHaveCount(0, { timeout: 1000 });
    await expect(page.locator('.assoc-sheet')).toBeVisible();
  });

  test('in-game « Réduire les animations » also fades the sheet (DEF-GS-46 D25b)', async ({
    page,
  }) => {
    await start(page);
    const ok = await page.evaluate(async () => {
      const api = window.__TGS_TEST__!;
      const g = api.state();
      if (!g) return false;
      return api.loadSave({
        ...g,
        settings: { ...g.settings, reducedMotion: 'on' },
        gacha: { ...g.gacha, stars: { ...g.gacha.stars, omar: 3 }, last: null },
        investments: { ...g.investments, save: 1 },
      });
    });
    expect(ok).toBe(true);
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.dataset.motion))
      .toBe('reduce');
    await tab(page, 'Associés').click();
    await page.getByRole('button', { name: /Voir le profil de Omar/i }).click();
    await expect(page.locator('.assoc-sheet')).toBeVisible();
    await page.getByRole('button', { name: /Faire appel à Omar/i }).click();
    await expect(page.locator('dialog.amsg[open]')).toBeVisible();
    const snap = await snapExitFade(page);
    assertExitFade(snap);
    await expect(page.locator('dialog.amsg[open]')).toHaveCount(0, { timeout: 1000 });
    await expect(page.locator('.assoc-sheet')).toBeVisible();
  });
});

test.describe('DEF-GS-44 Escape during pointer exit', () => {
  test('Escape during the exit animation close()s immediately (D19)', async ({ page }) => {
    await openOmarAndCall(page);
    await page.locator('dialog.amsg').click();
    await expect(page.locator('#amsg-bubble')).toBeVisible();
    await page.waitForTimeout(300);
    await page.locator('dialog.amsg').click();
    await expect(page.locator('dialog.amsg')).toHaveClass(/out/);
    await page.keyboard.press('Escape');
    // One-shot: close() is synchronous. A 200 ms Playwright retry would also
    // pass at the end of the 180 ms exit (D19 would survive).
    expect(await page.locator('dialog.amsg[open]').count()).toBe(0);
    await expect(page.locator('.assoc-sheet')).toBeVisible();
  });
});
