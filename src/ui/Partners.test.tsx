// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ManualClock } from '../core/clock';
import { openSaveDb } from '../save/db';
import { createGameStore } from '../store/gameStore';
import { App } from './App';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false;
  };
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.useRealTimers();
  location.hash = '';
});

async function app(name: string, tab = 'Associés') {
  const store = createGameStore({
    clock: new ManualClock(Date.UTC(2026, 9, 25)),
    openDb: () => openSaveDb(name),
    newSeed: () => 7,
    acquireWriterLock: async () => true,
    debounceMs: 5,
  });
  render(<App store={store} />);
  await act(() => store.getState().init());
  if (tab) fireEvent.click(screen.getByRole('button', { name: tab }));
  return store;
}

describe('draw screen', () => {
  it('reveals only after the draw is written, then a long press skips the animation', async () => {
    const store = await app('ui-draw-1');
    let resolve!: () => void;
    const gate = new Promise<void>((r) => (resolve = r));
    const real = store.getState().pull;
    store.setState({ pull: async () => (await gate, real()) });
    fireEvent.click(screen.getByRole('button', { name: 'Tirer · 1 ticket' }));
    await act(async () => {});
    expect(screen.queryByText('Tirage en cours…')).toBeNull(); // not saved yet: no reveal
    await act(async () => {
      resolve();
      await gate;
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(screen.getByText('Tirage en cours…')).toBeTruthy();
    expect(store.getState().game!.gacha.pulls).toBe(1);
    vi.useFakeTimers();
    fireEvent.pointerDown(screen.getByTestId('reveal'));
    act(() => vi.advanceTimersByTime(400));
    expect(screen.getByRole('button', { name: 'Continuer' })).toBeTruthy();
  });

  it('shows the rates, the pity rule and the no-purchase sentence', async () => {
    await app('ui-draw-2');
    expect(screen.getByText('3 ★ garanti dans 50 tirages')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Taux de tirage' }));
    const d = screen.getByRole('dialog', { name: 'Taux de tirage' });
    expect(d.textContent).toContain(
      'Les tickets se gagnent uniquement en jouant. Aucun achat possible.',
    );
    expect(d.textContent).toMatch(/environ 5,4 %/);
  });

  it('gives focus back to « Tirer » when the reveal closes (DEF-GS-09)', async () => {
    const store = await app('ui-draw-3');
    const draw = screen.getByRole('button', { name: 'Tirer · 1 ticket' });
    draw.focus();
    fireEvent.click(draw);
    await act(() => new Promise((r) => setTimeout(r, 30)));
    fireEvent.click(screen.getByRole('button', { name: 'Passer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continuer' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Tirer · 1 ticket' }));
    expect(store.getState().game!.gacha.pulls).toBe(1);
  });

  it('shows the saved last draw once after a reload during the reveal, without a new draw (DEF-GS-08)', async () => {
    const store = await app('ui-draw-4');
    fireEvent.click(screen.getByRole('button', { name: 'Tirer · 1 ticket' }));
    await act(() => new Promise((r) => setTimeout(r, 30)));
    expect(screen.getByText('Tirage en cours…')).toBeTruthy();
    const tickets = store.getState().game!.tickets;
    cleanup(); // "reload" during the animation
    const again = await app('ui-draw-4', '');
    expect(
      screen.getByText('Dernier tirage (déjà enregistré, rien n’est retiré à nouveau)'),
    ).toBeTruthy();
    expect(again.getState().game!.gacha.pulls).toBe(1);
    expect(again.getState().game!.tickets).toBe(tickets); // no ticket spent again
    fireEvent.click(screen.getByRole('button', { name: 'Continuer' }));
    expect(screen.getByText(/^Dernier tirage : /)).toBeTruthy(); // summary stays on the screen
    cleanup();
    await app('ui-draw-4', '');
    expect(
      screen.queryByText('Dernier tirage (déjà enregistré, rien n’est retiré à nouveau)'),
    ).toBeNull();
  });
});

describe('daily quiz (DEF-GS-06)', () => {
  it('opens over the quests, accepts any answer, explains, credits the quest and refocuses', async () => {
    const store = await app('ui-quiz-1', '');
    fireEvent.click(screen.getByRole('button', { name: /Quêtes du jour/ }));
    // 0.4.2 (1b): the unfinished quiz row is itself the button that opens the quiz.
    const row = screen.getByRole('button', { name: /^Quiz de Kyoko-sensei/ });
    expect(row.getAttribute('aria-describedby')).toBe('desc-quest-row-todo');
    fireEvent.click(row);
    const quiz = screen.getByRole('dialog', { name: 'Quiz de Kyoko-sensei' });
    expect(screen.getByRole('dialog', { name: 'Quêtes du jour' })).toBeTruthy();
    const choices = quiz.querySelectorAll('.quiz-choices button');
    expect(choices.length).toBeGreaterThan(1);
    await act(async () => {
      fireEvent.click(choices[0]!);
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(quiz.querySelector('.quiz-why')?.textContent).toMatch(/Bonne réponse|La bonne réponse/);
    expect(store.getState().game!.quests.progress.quiz).toBe(1);
    // R-P42-11: « Fermer » of the quiz dialog itself, not the last one in the document.
    fireEvent.click(within(quiz).getByRole('button', { name: 'Fermer' }));
    const claim = document.getElementById('quest-action-quiz')!;
    expect(document.activeElement).toBe(claim);
    const before = store.getState().game!.tickets;
    await act(async () => {
      fireEvent.click(claim);
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(store.getState().game!.tickets).toBe(before + 2);
  });
});

describe('call badge, card bonus and home banner (U03, M19, OBS-052-03)', () => {
  const T0 = Date.UTC(2026, 9, 25);
  const H = 3_600_000;

  async function withOmarCall(name: string, tab: string) {
    const store = await app(name, '');
    await act(async () => {
      const g = store.getState().game!;
      store.setState({
        wallMs: T0,
        game: {
          ...g,
          gacha: { ...g.gacha, stars: { ...g.gacha.stars, omar: 3 } },
          appel: {
            omar: {
              activatedAt: T0,
              endsAt: T0 + H,
              cooldownUntil: T0 + 4 * H,
              wallEndsAt: T0 + H,
              wallCooldownUntil: T0 + 4 * H,
              activationId: 'ui-omar',
            },
          },
        },
      });
    });
    if (tab) fireEvent.click(screen.getByRole('button', { name: tab }));
    return store;
  }

  it('U03: the grid badge uses formatAppelRemain, not mm:ss', async () => {
    await withOmarCall('ui-u03', 'Associés');
    const badge = document.querySelector('.appel-badge.active');
    expect(badge?.textContent).toMatch(/1 h 00 min/);
    expect(badge?.textContent).not.toMatch(/\d+:\d+/);
  });

  it('M19: the card bonus uses associatePercent (×2 while the call is active)', async () => {
    await withOmarCall('ui-m19', 'Associés');
    expect(screen.getByText(/Bonus actuel : \+150 %/)).toBeTruthy();
    expect(screen.queryByText(/Bonus actuel : \+75 %/)).toBeNull();
  });

  it('OBS-052-03: the home banner uses formatAppelRemain, not mm:ss', async () => {
    await withOmarCall('ui-obs03', 'Accueil');
    const banner = document.querySelector('.appel-banner');
    expect(banner?.textContent ?? '').toMatch(/Omar 1 h 00 min/);
    expect(banner?.textContent ?? '').not.toMatch(/\d+:\d+/);
  });
});
