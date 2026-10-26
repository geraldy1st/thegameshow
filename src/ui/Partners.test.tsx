// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
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
});

describe('daily quiz (DEF-GS-06)', () => {
  it('opens over the quests, accepts any answer, explains, credits the quest and refocuses', async () => {
    const store = await app('ui-quiz-1', '');
    fireEvent.click(screen.getByRole('button', { name: /Quêtes du jour/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Répondre au quiz' }));
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
    fireEvent.click(screen.getAllByRole('button', { name: 'Fermer' }).at(-1)!);
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
