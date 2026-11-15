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

async function imageFromPng(page: Page, buf: Buffer) {
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
      pixels.push({ r: data[i]!, g: data[i + 1]!, b: data[i + 2]!, a: data[i + 3]! });
    }
    return { pixels, width: c.width, height: c.height };
  }, buf.toString('base64'));
}

async function imageOfClip(
  page: Page,
  clip: { x: number; y: number; width: number; height: number },
) {
  return imageFromPng(page, await page.screenshot({ clip }));
}

/** Row counts computed in the page so the RGBA payload never crosses CDP. */
async function goldNavyRows(page: Page, band: { x0: number; x1: number }) {
  const buf = await page.screenshot({ scale: 'css' });
  return page.evaluate(
    async ({ b64, x0, x1 }) => {
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
      const left = Math.max(0, Math.floor(x0));
      const right = Math.min(c.width, Math.ceil(x1));
      const goldCounts: number[] = [];
      const navyCounts: number[] = [];
      const samples: { y: number; r: number; g: number; b: number }[] = [];
      for (let y = 0; y < c.height; y++) {
        let gold = 0;
        let navy = 0;
        for (let x = left; x < right; x++) {
          const i = (y * c.width + x) * 4;
          const r = data[i]!;
          const g = data[i + 1]!;
          const b = data[i + 2]!;
          if (r >= 120 && g >= 80 && b <= 130 && r - b >= 50 && r - g >= 10) gold += 1;
          if (r <= 70 && g <= 90 && b <= 120 && b >= r + 10) navy += 1;
        }
        goldCounts.push(gold);
        navyCounts.push(navy);
        if (gold >= 10 && samples.length < 6) {
          const mid = Math.floor((left + right) / 2);
          const i = (y * c.width + mid) * 4;
          samples.push({ y, r: data[i]!, g: data[i + 1]!, b: data[i + 2]! });
        }
      }
      return { width: c.width, height: c.height, goldCounts, navyCounts, samples };
    },
    { b64: buf.toString('base64'), x0: band.x0, x1: band.x1 },
  );
}

async function pixelsOfClip(
  page: Page,
  clip: { x: number; y: number; width: number; height: number },
) {
  return (await imageOfClip(page, clip)).pixels;
}

function parseCssColor(c: string) {
  const m = c.match(/[\d.]+/g)!.map(Number);
  return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 };
}

function contrastRatio(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
) {
  const lum = (c: { r: number; g: number; b: number }) => {
    const f = (v: number) => {
      const x = v / 255;
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

async function shrinkSheetDialog(page: Page) {
  await page.evaluate(() => {
    const sheet = document.querySelector('.assoc-sheet') as HTMLElement;
    const dialog = sheet.closest('dialog') as HTMLElement;
    dialog.style.maxHeight = '360px';
    dialog.style.height = '360px';
    dialog.style.overflow = 'auto';
  });
}

async function scrollSheetDialog(page: Page, y: number) {
  const scrolled = await page.evaluate((top) => {
    const sheet = document.querySelector('.assoc-sheet') as HTMLElement;
    const dialog = sheet.closest('dialog') as HTMLElement;
    dialog.scrollTop = top;
    return { scrollTop: dialog.scrollTop, scrollHeight: dialog.scrollHeight };
  }, y);
  expect(scrolled.scrollTop, `scroll ${y}`).toBeGreaterThanOrEqual(y);
}

/** OBS-052D-08: the rounded-corner pixels of « ← Retour », not its opaque padding. */
async function sampleRetourCorners(page: Page) {
  const back = page.locator('.assoc-sheet-back');
  const box = await back.boundingBox();
  if (!box) throw new Error('Retour box missing');
  const size = 3;
  const corners = [
    { name: 'tl', x: box.x, y: box.y },
    { name: 'tr', x: box.x + box.width - size, y: box.y },
    { name: 'bl', x: box.x, y: box.y + box.height - size },
    { name: 'br', x: box.x + box.width - size, y: box.y + box.height - size },
  ];
  const out: { name: string; pixels: { r: number; g: number; b: number; a: number }[] }[] = [];
  for (const c of corners) {
    out.push({
      name: c.name,
      pixels: await pixelsOfClip(page, {
        x: Math.round(c.x),
        y: Math.round(c.y),
        width: size,
        height: size,
      }),
    });
  }
  return out;
}

/**
 * DEF-GS-50 / DEF-GS-54: contrast of each *painted* chevron glyph pixel against
 * the background directly under it. Three aligned screenshots: normal, marker
 * forced red (glyph mask), marker transparent (true background). Never uses
 * getComputedStyle(summary).color — that is the title ink, not the ::marker.
 */

const CHEVRON_MASK_STYLE =
  'html[data-qa-mk="red"] .assoc-sheet details > summary::marker,' +
  'html[data-qa-mk="red"] .assoc-sheet details > summary::-webkit-details-marker' +
  '{color:#ff0000 !important}' +
  'html[data-qa-mk="none"] .assoc-sheet details > summary::marker,' +
  'html[data-qa-mk="none"] .assoc-sheet details > summary::-webkit-details-marker' +
  '{color:transparent !important}';

async function setChevronMask(page: Page, mode: '' | 'red' | 'none') {
  await page.evaluate((m) => {
    if (m) document.documentElement.dataset.qaMk = m;
    else delete document.documentElement.dataset.qaMk;
  }, mode);
}

async function contrastOfSheetChevrons(page: Page) {
  await page.addStyleTag({ content: CHEVRON_MASK_STYLE });
  const metas = await page.evaluate(() => {
    const sheet = document.querySelector('.assoc-sheet');
    const dialog = sheet?.closest('dialog');
    if (!dialog) throw new Error('sheet dialog missing');
    return [
      ...document.querySelectorAll<HTMLElement>(
        '.assoc-sheet-apport > summary, .assoc-sheet-bio > summary',
      ),
    ].map((el) => {
      const s = el.getBoundingClientRect();
      const det = el.parentElement!.getBoundingClientRect();
      const x = Math.max(0, Math.round(det.left - 20));
      return {
        name: (el.textContent ?? '').trim(),
        open: !!(el.parentElement as HTMLDetailsElement).open,
        color: getComputedStyle(el).color,
        clip: {
          x,
          y: Math.round(s.top),
          width: 30,
          height: Math.max(10, Math.round(Math.min(s.height, 26))),
        },
      };
    });
  });
  if (metas.length !== 2) throw new Error(`expected 2 summaries, got ${metas.length}`);
  const hex = (c: { r: number; g: number; b: number }) =>
    '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  const results = [];
  const sels = ['.assoc-sheet-apport > summary', '.assoc-sheet-bio > summary'] as const;
  for (let i = 0; i < metas.length; i++) {
    const loc = page.locator(sels[i]!);
    await loc.scrollIntoViewIfNeeded();
    const m = await loc.evaluate((el) => {
      const s = el.getBoundingClientRect();
      const det = el.parentElement!.getBoundingClientRect();
      const x = Math.max(0, Math.round(det.left - 20));
      return {
        name: (el.textContent ?? '').trim(),
        open: !!(el.parentElement as HTMLDetailsElement).open,
        color: getComputedStyle(el).color,
        clip: {
          x,
          y: Math.round(s.top),
          width: 30,
          height: Math.max(10, Math.round(Math.min(s.height, 26))),
        },
      };
    });
    const normal = await pixelsOfClip(page, m.clip);
    await setChevronMask(page, 'red');
    const red = await pixelsOfClip(page, m.clip);
    await setChevronMask(page, 'none');
    const under = await pixelsOfClip(page, m.clip);
    await setChevronMask(page, '');
    if (red.length !== under.length || red.length !== normal.length) {
      throw new Error(`chevron clip misaligned for ${m.name}`);
    }
    const lum = (c: { r: number; g: number; b: number }) => {
      const f = (v: number) => {
        const x = v / 255;
        return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    };
    let glyph = 0;
    let visible = 0;
    let lightGlyph = 0;
    let lightVisible = 0;
    let minContrast = Infinity;
    let inkR = 0;
    let inkG = 0;
    let inkB = 0;
    const bgBuckets = new Map<string, { r: number; g: number; b: number; n: number }>();
    for (let i = 0; i < red.length; i++) {
      const a = red[i]!;
      const b = under[i]!;
      const painted = normal[i]!;
      const delta = Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
      // Pixel covered by the glyph: it changes frankly when the marker is forced red.
      if (delta < 120) continue;
      glyph += 1;
      inkR += painted.r;
      inkG += painted.g;
      inkB += painted.b;
      const contrast = contrastRatio(painted, b);
      if (contrast < minContrast) minContrast = contrast;
      if (contrast >= 3) visible += 1;
      // Cream panel vs navy overflow: K02/K08 stay contrasty on navy but vanish on cream.
      if (lum(b) >= 0.4) {
        lightGlyph += 1;
        if (contrast >= 3) lightVisible += 1;
      }
      const key = `${Math.round(b.r / 8) * 8},${Math.round(b.g / 8) * 8},${Math.round(b.b / 8) * 8}`;
      const bucket = bgBuckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0 };
      bucket.r += b.r;
      bucket.g += b.g;
      bucket.b += b.b;
      bucket.n += 1;
      bgBuckets.set(key, bucket);
    }
    const ranked = [...bgBuckets.values()].sort((a, b) => b.n - a.n);
    const ink =
      glyph > 0 ? { r: inkR / glyph, g: inkG / glyph, b: inkB / glyph } : { r: 0, g: 0, b: 0 };
    const bg = ranked[0]
      ? { r: ranked[0].r / ranked[0].n, g: ranked[0].g / ranked[0].n, b: ranked[0].b / ranked[0].n }
      : ink;
    results.push({
      name: m.name,
      open: m.open,
      markerHex: hex(ink),
      bgHex: hex(bg),
      glyph,
      visible,
      visibleShare: glyph ? Math.round((visible / glyph) * 100) / 100 : 0,
      lightGlyph,
      lightVisible,
      lightShare: lightGlyph ? Math.round((lightVisible / lightGlyph) * 100) / 100 : 0,
      minContrast: glyph ? Math.round(minContrast * 100) / 100 : 0,
    });
  }
  return results;
}

test.describe('OBS-052D-08 sticky Retour corners', () => {
  test('Omar: rounded corners stay navy at 120 and 200 px', async ({ page }) => {
    await ownAndOpen(page, OWNED[2]);
    const bio = page.locator('.assoc-sheet-bio summary');
    if (await bio.count()) await bio.click();
    await shrinkSheetDialog(page);
    for (const y of [120, 200]) {
      await scrollSheetDialog(page, y);
      const corners = await sampleRetourCorners(page);
      for (const c of corners) {
        assertNavyPixels(c.pixels, `Omar ${c.name} at ${y}px`);
      }
    }
  });
});

test.describe('DEF-GS-47 disclosure chevron contrast', () => {
  test('both section chevrons are at least 3:1 on the paint under the glyph (DEF-GS-50, D27, D33c)', async ({
    page,
  }) => {
    await ownAndOpen(page, OWNED[2]);
    const rows = await contrastOfSheetChevrons(page);
    expect(rows.map((r) => r.name)).toEqual([
      expect.stringMatching(/apporte/i),
      expect.stringMatching(/Biographie/i),
    ]);
    const opens = rows.map((r) => r.open);
    expect(opens.filter(Boolean).length, `open state ${JSON.stringify(rows)}`).toBe(1);
    for (const r of rows) {
      // Painted ink vs the backdrop under the glyph (DEF-GS-54). D33c parks the
      // whole glyph on navy → visibleShare 0. K02/K03/K08 stay contrasty on
      // navy overflow but vanish on the cream panel: lightShare catches them.
      // A recoloured title with an unchanged navy ::marker (K09) must still pass.
      expect(r.glyph, `${r.name} ${JSON.stringify(r)}`).toBeGreaterThan(10);
      expect(r.visible, `${r.name} ${JSON.stringify(r)}`).toBeGreaterThanOrEqual(5);
      expect(r.visibleShare, `${r.name} ${JSON.stringify(r)}`).toBeGreaterThanOrEqual(0.2);
      expect(r.lightGlyph, `${r.name} ${JSON.stringify(r)}`).toBeGreaterThanOrEqual(5);
      expect(r.lightShare, `${r.name} ${JSON.stringify(r)}`).toBeGreaterThanOrEqual(0.5);
    }
  });
});

test.describe('OBS-052D-12 title focus ring', () => {
  test('the full 3 px gold ring around the title is visible when the sheet opens', async ({
    page,
  }) => {
    await ownAndOpen(page, OWNED[2]);
    const title = page.locator('.assoc-sheet-title');
    await expect(title).toBeFocused();
    const info = await page.evaluate(() => {
      const h = document.querySelector('.assoc-sheet-title') as HTMLElement;
      const slot = document.querySelector('.assoc-sheet-back-slot') as HTMLElement;
      const t = h.getBoundingClientRect();
      const s = slot.getBoundingClientRect();
      const cs = getComputedStyle(h);
      const width = parseFloat(cs.outlineWidth);
      const offset = parseFloat(cs.outlineOffset);
      return {
        titleTop: t.top,
        titleLeft: t.left,
        titleRight: t.right,
        slotBottom: s.bottom,
        slotLeft: s.left,
        slotRight: s.right,
        outlineWidth: width,
        outlineOffset: offset,
        color: cs.outlineColor,
      };
    });
    expect(info.outlineWidth).toBe(3);
    expect(info.outlineOffset).toBe(2);
    // Layout contract: 3 px stroke + 2 px offset need 5 px of clear space.
    expect(info.slotBottom, JSON.stringify(info)).toBeLessThanOrEqual(info.titleTop - 5 + 0.5);
    // Viewport screenshots and getBoundingClientRect do not share an origin
    // under Chromium's isMobile emulation (~13 px). Scan the bitmap itself
    // for the top gold bar and the navy gap above it, in the Retour overlap
    // where the sticky slot used to clip the upper 1 px.
    const x0 = Math.max(0, Math.floor(info.titleLeft - 6));
    const x1 = Math.ceil(Math.min(info.slotRight, info.titleRight) + 6);
    // DEF-GS-55: a 1 px paint clip (R05 navy shadow) leaves a short first gold
    // row then only 1–2 full rows under the slot. Require 3 full rows, as thick
    // as outline-width, each at least 90 % of the bar's peak width. Chromium
    // sometimes paints the third row a frame later: poll until it is solid.
    await page.evaluate(
      () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
    );
    type Bar = {
      goldCounts: number[];
      navyCounts: number[];
      span: number;
      needWidth: number;
      peak: number;
      full: number;
      first: number;
      solid: number;
      around: { y: number; n: number }[];
    };
    let bar: Bar | undefined;
    const measure = async (): Promise<Bar> => {
      const rows = await goldNavyRows(page, { x0, x1 });
      const { goldCounts, navyCounts } = rows;
      const span = Math.min(rows.width, x1) - Math.max(0, x0);
      const needWidth = Math.max(40, Math.round(span * 0.5));
      const wide = goldCounts
        .map((n, y) => ({ y, n }))
        .filter((r) => r.n >= needWidth && r.y < rows.height * 0.6);
      const peak = wide.length ? Math.max(...wide.map((r) => r.n)) : 0;
      const full = Math.max(needWidth, Math.round(peak * 0.9));
      const firstFull = wide.find((r) => r.n >= full);
      const first = firstFull?.y ?? -1;
      let solid = 0;
      if (first >= 0) {
        for (let y = first; y < rows.height && goldCounts[y]! >= full; y++) solid += 1;
      }
      const around = goldCounts
        .map((n, y) => ({ y, n }))
        .filter((r) => first < 0 || (r.y >= first - 4 && r.y <= first + 8));
      return { goldCounts, navyCounts, span, needWidth, peak, full, first, solid, around };
    };
    await expect
      .poll(
        async () => {
          bar = await measure();
          return bar.solid;
        },
        { timeout: 2000, intervals: [50, 100, 200] },
      )
      .toBeGreaterThanOrEqual(info.outlineWidth);
    if (!bar) throw new Error('ring bar not measured');
    const { goldCounts, navyCounts, span, needWidth, peak, full, first, solid, around } = bar;
    expect(
      solid,
      `top gold bar only ${solid} px thick at y=${first} (need ${info.outlineWidth}) ${JSON.stringify({ info, x0, x1, peak, full, around })}`,
    ).toBeGreaterThanOrEqual(info.outlineWidth);
    // At least 2 rows above the full bar that are not gold (clear space). Do
    // not require a navy heuristic: Chromium's mobile screenshot origin can
    // shift the slot band onto pixels that are dark but not "navy".
    let clearAbove = 0;
    for (let y = first - 1; y >= 0; y--) {
      if (goldCounts[y]! >= full) break;
      if (goldCounts[y]! >= Math.round(full * 0.3)) continue;
      clearAbove += 1;
      if (clearAbove >= 2) break;
    }
    expect(
      clearAbove,
      `only ${clearAbove} clear rows above the ring at y=${first} gold=${goldCounts
        .slice(Math.max(0, first - 8), first + solid + 2)
        .map((n, i) => `${Math.max(0, first - 8) + i}:${n}`)
        .join(
          ',',
        )} ${JSON.stringify({ info, x0, x1, around, navySample: navyCounts.slice(Math.max(0, first - 4), first) })}`,
    ).toBeGreaterThanOrEqual(2);
  });
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
