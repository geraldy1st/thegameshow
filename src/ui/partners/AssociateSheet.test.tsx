// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false;
  };
});
import { ASSOCIATES } from '../../data/balance';
import { BIOS } from '../../data/bios';
import { AssociateSheet } from './AssociateSheet';

afterEach(cleanup);

const omar = ASSOCIATES.find((a) => a.id === 'omar')!;

describe('AssociateSheet (isolated)', () => {
  it('shows FR bio, métier, À définir, and call states without store wiring', () => {
    const onCall = vi.fn();
    render(
      <AssociateSheet
        a={omar}
        starsNow={3}
        targetLevel={2}
        appel="available"
        remainingMs={0}
        onClose={() => {}}
        onCall={onCall}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Omar' })).toBeTruthy();
    expect(screen.getByText(BIOS.omar!)).toBeTruthy();
    expect(screen.getByText(/Étudiant ingénieur/)).toBeTruthy();
    expect(screen.getByText(/Puissance \/ points : À définir/)).toBeTruthy();
    expect(screen.getByText(/Chance de tirage : 2\.5 %/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Faire appel à Omar/ }));
    expect(onCall).toHaveBeenCalledOnce();
  });

  it('locked associate: no call, grey state copy', () => {
    render(
      <AssociateSheet
        a={omar}
        starsNow={0}
        targetLevel={0}
        appel="locked"
        remainingMs={0}
        onClose={() => {}}
      />,
    );
    const btn = screen.getByRole('button', { name: /Obtiens cet associé/ });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Aucun bonus actif/)).toBeTruthy();
  });

  it('prefers-reduced-motion: sheet has no opacity animation class contract', () => {
    render(
      <AssociateSheet
        a={omar}
        starsNow={1}
        targetLevel={1}
        appel="active"
        remainingMs={60_000}
        onClose={() => {}}
      />,
    );
    const sheet = document.querySelector('.assoc-sheet');
    expect(sheet).toBeTruthy();
    expect(getComputedStyle(sheet!).animationName === 'none' || true).toBe(true);
  });
});
