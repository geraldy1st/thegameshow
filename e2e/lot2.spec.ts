import { expect, test } from '@playwright/test';
import { axeViolations } from './axe';

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Travailler avec Aoi' })).toBeVisible();
});

test('every tab has no axe violations at 360x640 (GS-CA19)', async ({ page }) => {
  for (const name of ['Investir', 'Amis', 'Associés', 'Jouer']) {
    await page.getByRole('navigation').getByRole('button', { name }).click();
    expect(await axeViolations(page), name).toEqual([]);
  }
  await page.getByRole('button', { name: /Quêtes du jour/ }).click();
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== 'running'),
  );
  expect(await axeViolations(page), 'quests').toEqual([]);
});

test('rates link is visible without scrolling and states no purchase is possible', async ({
  page,
}) => {
  await page.getByRole('navigation').getByRole('button', { name: 'Associés' }).click();
  const link = page.getByRole('button', { name: 'Taux de tirage' });
  await expect(link).toBeInViewport();
  await expect(page.getByText('3 ★ garanti dans 50 tirages')).toBeInViewport();
  await link.click();
  const dialog = page.getByRole('dialog', { name: 'Taux de tirage' });
  await expect(dialog).toContainText(
    'Les tickets se gagnent uniquement en jouant. Aucun achat possible.',
  );
  await expect(dialog).toContainText('70 %');
  await expect(dialog).toContainText('5 %');
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== 'running'),
  );
  expect(await axeViolations(page)).toEqual([]);
});

test('a draw is saved before the reveal, can be skipped, and survives a reload', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.getByRole('navigation').getByRole('button', { name: 'Associés' }).click();
  await page.getByRole('button', { name: 'Tirer · 1 ticket' }).click();
  const reveal = page.getByRole('dialog');
  await reveal.getByRole('button', { name: 'Passer' }).click();
  await expect(reveal.getByRole('button', { name: 'Continuer' })).toBeFocused();
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== 'running'),
  );
  expect(await axeViolations(page)).toEqual([]);
  await reveal.getByRole('button', { name: 'Continuer' }).click();
  await expect(page.getByText('3 ★ garanti dans 49 tirages', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('navigation').getByRole('button', { name: 'Associés' }).click();
  await expect(page.getByText('3 ★ garanti dans 49 tirages', { exact: true })).toBeVisible();
  await expect(page.getByText('Collection : 1 sur 9')).toBeVisible();
});

test('reduced motion reveals with a short fade', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('navigation').getByRole('button', { name: 'Associés' }).click();
  await page.getByRole('button', { name: 'Tirer · 1 ticket' }).click();
  await expect(page.getByRole('button', { name: 'Continuer' })).toBeVisible({ timeout: 1000 });
});

test('a friend visit adds affinity', async ({ page }) => {
  await page.getByRole('navigation').getByRole('button', { name: 'Amis' }).click();
  await expect(page.getByText('Affinité : 0 sur 100').first()).toBeVisible();
  await page.getByRole('button', { name: 'Passer du temps avec Ren' }).click();
  await expect(page.getByText('Affinité : 5 sur 100').first()).toBeVisible();
});

test('the daily quiz is playable and all 7 daily tickets can be earned (DEF-GS-06)', async ({
  page,
}) => {
  const tickets = page.locator('.pill-tickets span').last();
  await expect(tickets).toHaveText('3');
  const work = page.getByRole('button', { name: 'Travailler avec Aoi' });
  for (let i = 0; i < 100; i++) await work.click();
  await page.getByRole('navigation').getByRole('button', { name: 'Investir' }).click();
  for (let i = 0; i < 3; i++)
    await page.getByRole('button', { name: /un niveau de Épargne/ }).click();
  await page.getByRole('navigation').getByRole('button', { name: 'Amis' }).click();
  await page.getByRole('button', { name: 'Passer du temps avec Mio' }).click();

  await page.getByRole('button', { name: /Quêtes du jour/ }).click();
  await page.getByRole('button', { name: 'Répondre au quiz' }).click();
  const quiz = page.getByRole('dialog', { name: 'Quiz de Kyoko-sensei' });
  await expect(quiz).toBeVisible();
  await expect(quiz.locator('.quiz-q')).not.toBeEmpty();
  await quiz.locator('.quiz-choices button').first().click();
  await expect(quiz.locator('.quiz-why')).toContainText(/Bonne réponse|La bonne réponse/);
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== 'running'),
  );
  expect(await axeViolations(page)).toEqual([]);
  await quiz.getByRole('button', { name: 'Fermer' }).click();
  await expect(quiz).toBeHidden();
  const quests = page.getByRole('dialog', { name: 'Quêtes du jour' });
  await expect(quests.locator('#quest-action-quiz')).toBeFocused();
  for (let i = 0; i < 5; i++)
    await quests.getByRole('button', { name: 'Récupérer' }).first().click();
  await expect(quests.getByText('Récupéré ✓')).toHaveCount(5);
  await expect(tickets).toHaveText('10'); // 3 at start + 7 for the day
});

test('keyboard: focus returns to « Tirer » after the reveal (DEF-GS-09)', async ({ page }) => {
  await page.getByRole('navigation').getByRole('button', { name: 'Associés' }).click();
  const draw = page.getByRole('button', { name: 'Tirer · 1 ticket' });
  await draw.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Passer' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Continuer' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(draw).toBeFocused();
});

test('reset confirmation tells the truth about the backup copy (DEF-GS-07)', async ({ page }) => {
  await page.getByRole('button', { name: 'Nouvelle partie' }).click();
  const d = page.getByRole('dialog', { name: 'Recommencer de zéro ?' });
  await expect(d).toContainText('copie de secours');
  await expect(d).toContainText('écrasée à la prochaine remise à zéro');
  await expect(d).not.toContainText('Rien n’est conservé');
});
