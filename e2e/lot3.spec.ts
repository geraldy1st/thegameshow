import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { axeViolations } from './axe';

const v2 = JSON.parse(readFileSync('src/save/__fixtures__/v2-midgame.json', 'utf8')) as {
  createdAt: number;
  revision: number;
  gacha: { last: { pull: number } };
};
const SEEN = 'tgs-reveal-seen';

let pageErrors: string[] = [];
test.beforeEach(async ({ page }) => {
  pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && pageErrors.push(m.text()));
  // A same-origin blank page to seed IndexedDB / localStorage before the app ever runs.
  await page.route('**/thegameshow/__seed', (r) =>
    r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>seed</title>' }),
  );
});
test.afterEach(() => {
  expect(pageErrors).toEqual([]);
});

async function ready(page: Page) {
  // Lot 4 (QA §2.4): the « Travailler » tile replaces the removed yellow button.
  await expect(page.getByRole('button', { name: 'Travailler', exact: true })).toBeVisible();
}
async function seed(page: Page, slots: Record<string, unknown>, marker?: string) {
  await page.goto('./__seed');
  await page.evaluate(
    ({ slots, marker, key }) =>
      new Promise<void>((resolve, reject) => {
        if (marker !== undefined) localStorage.setItem(key, marker);
        const req = indexedDB.open('thegameshow', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('saves');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const tx = req.result.transaction('saves', 'readwrite');
          for (const [k, v] of Object.entries(slots)) tx.objectStore('saves').put(v, k);
          tx.oncomplete = () => {
            req.result.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    { slots, marker, key: SEEN },
  );
}
const readSlot = (page: Page, slot: string) =>
  page.evaluate(
    (slot) =>
      new Promise<unknown>((resolve, reject) => {
        const req = indexedDB.open('thegameshow');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const g = req.result.transaction('saves').objectStore('saves').get(slot);
          g.onsuccess = () => {
            req.result.close();
            resolve(g.result);
          };
        };
      }),
    slot,
  );
const focusedText = (page: Page) =>
  page.evaluate(() => {
    const a = document.activeElement;
    return a ? `${a.tagName}:${a.textContent?.trim()}` : '';
  });

test.describe('navigation (GS-V5-04, GS-V5-17)', () => {
  test('T17-1/T17-4: home → tab → back, focus on each h1, no reload, axe clean', async ({
    page,
  }) => {
    await page.goto('./');
    await ready(page);
    expect(new URL(page.url()).hash).toBe('#home');
    await expect.poll(() => focusedText(page)).toBe('H1:Accueil');
    expect(await axeViolations(page), 'home').toEqual([]);
    await page.evaluate(() => ((window as unknown as { noReload: number }).noReload = 1));
    for (const [tab, hash, title] of [
      ['Investir', '#invest', 'Investir'],
      ['Amis', '#friends', 'Cercle d’amis'],
      ['Associés', '#partners', 'Associés'],
    ] as const) {
      await page.getByRole('navigation').getByRole('button', { name: tab }).click();
      await expect(page).toHaveURL(new RegExp(`${hash}$`));
      await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
      expect(await axeViolations(page), tab).toEqual([]);
      await page.goBack();
      await expect(page).toHaveURL(/#home$/);
      await expect.poll(() => focusedText(page)).toBe('H1:Accueil');
    }
    // Patch 0.4.3 (P1): no « ← Accueil » anywhere; the « Accueil » tab returns home.
    await page.getByRole('navigation').getByRole('button', { name: 'Investir' }).click();
    await expect(page.getByRole('button', { name: '← Accueil' })).toHaveCount(0);
    await page.getByRole('navigation').getByRole('button', { name: 'Accueil' }).click();
    await expect(page).toHaveURL(/#home$/);
    await expect.poll(() => focusedText(page)).toBe('H1:Accueil');
    expect(await page.evaluate(() => (window as unknown as { noReload?: number }).noReload)).toBe(
      1,
    );
  });

  test('T17-2: home → « Quêtes du jour » → back; focus on the dialog title', async ({ page }) => {
    await page.goto('./');
    await ready(page);
    await page.getByRole('button', { name: /Quêtes du jour/ }).click();
    await expect(page).toHaveURL(/#quests$/);
    const dialog = page.getByRole('dialog', { name: 'Quêtes du jour' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Quêtes du jour' })).toBeFocused();
    await page.waitForFunction(() =>
      document.getAnimations().every((a) => a.playState !== 'running'),
    );
    expect(await axeViolations(page), 'quests').toEqual([]);
    await page.goBack();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/#home$/);
    // Patch 0.4.2 (GS-V5-66): the focus goes back to the opener, no longer to the h1.
    await expect.poll(() => focusedText(page)).toBe('BUTTON:Quêtes du jour');
  });

  for (const [hash, check] of [
    ['invest', 'Investir'],
    ['friends', 'Amis'],
    ['partners', 'Associés'],
    ['quests', 'Quêtes du jour'],
  ] as const) {
    test(`T17-3: direct link #${hash} opens the screen, back returns home`, async ({ page }) => {
      await page.goto(`./#${hash}`);
      if (hash === 'quests') {
        const d = page.getByRole('dialog', { name: check });
        await expect(d.getByRole('heading', { name: check })).toBeFocused();
      } else {
        await expect(page.getByRole('heading', { level: 1, name: check })).toBeFocused();
      }
      await page.goBack();
      await expect(page).toHaveURL(/#home$/);
      await ready(page);
      await expect.poll(() => focusedText(page)).toBe('H1:Accueil');
    });
  }

  test('an unknown hash opens home; a reload opens home (P3-3)', async ({ page }) => {
    await page.goto('./#nowhere');
    await ready(page);
    await expect(page).toHaveURL(/#home$/);
    await page.getByRole('navigation').getByRole('button', { name: 'Amis' }).click();
    await page.reload();
    await ready(page);
    await expect(page).toHaveURL(/#home$/);
  });
});

test('GS-V5-03 (0.4.3: 2 locked tiles on home): the locked tiles are announced locked; a press writes nothing, hash unchanged', async ({
  page,
}) => {
  await page.goto('./');
  await ready(page);
  await page.waitForTimeout(300);
  const before = (await readSlot(page, 'current')) as { revision: number };
  const tiles = page.getByRole('button', { name: /— verrouillé, bientôt$/ });
  await expect(tiles).toHaveCount(2);
  for (const name of ['Apprendre', 'Maison']) {
    const tile = page.getByRole('button', { name: `${name} — verrouillé, bientôt` });
    await expect(tile).toHaveAttribute('aria-disabled', 'true');
    // aria-disabled (not disabled) keeps the tile focusable; Playwright's click treats it as
    // disabled, so press it from the keyboard (the bottom row also sits under the fixed tab bar).
    await tile.press('Enter');
    await expect(page.getByRole('status')).toHaveText(`${name} : bientôt !`);
    expect(new URL(page.url()).hash).toBe('#home');
  }
  await page.waitForTimeout(300);
  const after = (await readSlot(page, 'current')) as { revision: number };
  expect(after.revision).toBe(before.revision);
});

test('GS-V5-14 (DEF-GS-10): « Continuer » with Enter after a resumed reveal focuses « Tirer »', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('./');
  await ready(page);
  await page.getByRole('navigation').getByRole('button', { name: 'Associés' }).click();
  await page.getByRole('button', { name: 'Tirer · 1 ticket' }).click();
  await expect(page.getByText('Tirage en cours…')).toBeVisible();
  await page.reload();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Dernier tirage (déjà enregistré');
  await dialog.getByRole('button', { name: 'Continuer' }).focus();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Tirer · 1 ticket' })).toBeFocused();
});

test.describe('GS-V5-15 (DEF-GS-11): reveal marker keyed by createdAt:pull', () => {
  test('(a) after « Nouvelle partie », draw n°1 interrupted is shown once; legacy marker', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('./');
    await ready(page);
    // A first game whose draw n°1 was fully seen.
    await page.getByRole('navigation').getByRole('button', { name: 'Associés' }).click();
    await page.getByRole('button', { name: 'Tirer · 1 ticket' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Passer' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Continuer' }).click();
    // New game (lot 4: in Menu > Paramètres), then its draw n°1 is interrupted by a reload.
    await page.getByRole('navigation').getByRole('button', { name: 'Menu' }).click();
    await page.getByRole('button', { name: 'Nouvelle partie' }).click();
    await page.getByRole('button', { name: 'Oui, recommencer' }).click();
    await page.getByRole('navigation').getByRole('button', { name: 'Associés' }).click();
    await page.getByRole('button', { name: 'Tirer · 1 ticket' }).click();
    await expect(page.getByText('Tirage en cours…')).toBeVisible();
    await page.reload();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Dernier tirage (déjà enregistré');
    await dialog.getByRole('button', { name: 'Continuer' }).click();
    await page.reload();
    await ready(page);
    await page.getByRole('navigation').getByRole('button', { name: 'Associés' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // Legacy lot 2 marker (pull number only) equal to the last draw: seen, then rewritten.
    const createdAt = ((await readSlot(page, 'current')) as { createdAt: number }).createdAt;
    await page.evaluate((k) => localStorage.setItem(k, '1'), SEEN);
    await page.reload();
    await ready(page);
    await page.getByRole('navigation').getByRole('button', { name: 'Associés' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await page.evaluate((k) => localStorage.getItem(k), SEEN)).toBe(`${createdAt}:1`);
  });

  test('(b) after a v2 → v3 migration, a seen reveal is not shown again', async ({ page }) => {
    await seed(page, { current: v2 }, String(v2.gacha.last.pull));
    await page.goto('./');
    await ready(page);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('navigation').getByRole('button', { name: 'Associés' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await page.evaluate((k) => localStorage.getItem(k), SEEN)).toBe(
      `${v2.createdAt}:${v2.gacha.last.pull}`,
    );
  });

  test('(b) after a v2 → v3 migration, an interrupted reveal is shown exactly once', async ({
    page,
  }) => {
    await seed(page, { current: v2 }, String(v2.gacha.last.pull - 1));
    await page.goto('./');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Dernier tirage (déjà enregistré');
    await expect(page).toHaveURL(/#partners$/);
    await dialog.getByRole('button', { name: 'Continuer' }).click();
    await page.reload();
    await ready(page);
    await page.getByRole('navigation').getByRole('button', { name: 'Associés' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});

test.describe('migration and recovery (GS-V5-05/06/08)', () => {
  test('a lot 2 save is migrated by the writer tab, raw copy kept, offline gains collectable', async ({
    page,
  }) => {
    await seed(page, { current: v2 }, `${v2.createdAt}:${v2.gacha.last.pull}`);
    await page.goto('./');
    await ready(page);
    await expect(page.getByText('⚡ 50/50')).toBeVisible();
    await expect(page.getByText('Niv. 1')).toBeVisible();
    await expect
      .poll(
        async () => ((await readSlot(page, 'current')) as { schemaVersion: number }).schemaVersion,
      )
      .toBe(4);
    expect(await readSlot(page, 'backup-before-migration')).toEqual(v2);
    const offline = page.getByRole('article', { name: 'Gains hors ligne' });
    await expect(offline.getByText(/^\+.+ ¥$/)).toBeVisible();
    await expect(offline.getByText(/plafond 8 h/)).toBeVisible();
    await page.getByRole('button', { name: 'Récolter' }).click();
    await expect(page.getByText('Rien à récolter')).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);
  });

  test('fallback to a backup copy is announced with the exact text', async ({ page }) => {
    await seed(
      page,
      { current: { junk: true }, previous: v2 },
      `${v2.createdAt}:${v2.gacha.last.pull}`,
    );
    await page.goto('./');
    await ready(page);
    await expect(page.getByRole('status')).toHaveText(
      'Une copie de secours de ta sauvegarde a été restaurée.',
    );
    await expect(page.getByRole('heading', { level: 1, name: 'Accueil' })).toBeFocused();
  });

  test('a future version is refused with the exact text and nothing is written', async ({
    page,
  }) => {
    const future = { ...v2, schemaVersion: 5 };
    await seed(page, { current: future });
    await page.goto('./');
    await expect(page.getByRole('heading', { name: 'Sauvegarde illisible' })).toBeVisible();
    await expect(
      page.getByText(
        "Cette sauvegarde vient d'une version plus récente du jeu. Recharge la page pour obtenir la dernière version.",
      ),
    ).toBeVisible();
    await page.waitForTimeout(500);
    expect(await readSlot(page, 'current')).toEqual(future);
  });

  test('manual rollback restores the pre-migration save (R12)', async ({ page }) => {
    await seed(page, { current: v2 }, `${v2.createdAt}:${v2.gacha.last.pull}`);
    await page.goto('./');
    await ready(page);
    await page.getByRole('navigation').getByRole('button', { name: 'Menu' }).click();
    await page
      .getByRole('button', { name: 'Restaurer la sauvegarde d’avant la mise à jour' })
      .click();
    const d = page.getByRole('dialog', { name: 'Restaurer la sauvegarde d’avant la mise à jour' });
    await d.getByRole('button', { name: 'Restaurer la sauvegarde d’avant la mise à jour' }).click();
    await expect(page.getByRole('status')).toHaveText(
      'Sauvegarde d’avant la mise à jour restaurée.',
    );
    const kept = (await readSlot(page, 'backup-before-restore')) as { schemaVersion: number };
    expect(kept.schemaVersion).toBe(4);
    expect(await readSlot(page, 'backup-before-import')).toBeUndefined();
  });
});
