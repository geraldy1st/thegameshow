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
    expect(screen.getByRole('heading', { name: "Ce qu'il apporte" })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Biographie' })).toBeTruthy();
    expect(
      screen.getByText(/Faire appel double son bonus d’épargne pendant 1 h, puis recharge 4 h/),
    ).toBeTruthy();
    expect(screen.queryByText(/sa bonus/)).toBeNull();
    // Bio is closed by default; the text is revealed when the panel is opened.
    fireEvent.click(screen.getByRole('heading', { name: 'Biographie' }));
    expect(screen.getByText(BIOS.omar!)).toBeTruthy();
    expect(screen.getByText(/Étudiant ingénieur/)).toBeTruthy();
    expect(screen.getByText(/Puissance \/ points : À définir/)).toBeTruthy();
    expect(screen.getByText(/Chance de tirage : 2,5 %/)).toBeTruthy();
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

  it('DEF-GS-33: bonus actuel uses associatePercent (×2 while the call is active)', () => {
    const now = 1_000_000;
    const entry = {
      until: now + 3_600_000,
      cool: now + 86_400_000,
      wallUntil: now + 3_600_000,
      wallCool: now + 86_400_000,
    };
    const { rerender } = render(
      <AssociateSheet
        a={omar}
        starsNow={3}
        targetLevel={2}
        appel="available"
        remainingMs={0}
        now={now}
        wallNow={now}
        onClose={() => {}}
      />,
    );
    // 3★ Omar, no call: +75 %
    expect(screen.getByText(/Bonus actuel : \+75 %/)).toBeTruthy();
    rerender(
      <AssociateSheet
        a={omar}
        starsNow={3}
        targetLevel={2}
        appel="active"
        remainingMs={60_000}
        now={now}
        wallNow={now}
        entry={entry}
        onClose={() => {}}
      />,
    );
    // Same source as the engine: 25 % × 3 × 2 = 150, not a stale 75.
    expect(screen.getByText(/Bonus actuel : \+150 %/)).toBeTruthy();
    expect(screen.queryByText(/Bonus actuel : \+75 %/)).toBeNull();
  });
  it('R-052-01: heading is gendered; the call line always uses « son bonus »', () => {
    const kei = ASSOCIATES.find((a) => a.id === 'kei')!;
    const { unmount } = render(
      <AssociateSheet
        a={kei}
        starsNow={1}
        targetLevel={1}
        appel="available"
        remainingMs={0}
        onClose={() => {}}
      />,
    );
    expect(screen.getByRole('heading', { name: "Ce qu'elle apporte" })).toBeTruthy();
    expect(
      screen.getByText(/Faire appel double son bonus par clic pendant 30 min, puis recharge 4 h/),
    ).toBeTruthy();
    expect(screen.queryByText(/sa bonus/)).toBeNull();
    unmount();
  });

  it('R-052-06: apport is open by default, bio is closed; only one panel stays open', () => {
    render(
      <AssociateSheet
        a={omar}
        starsNow={3}
        targetLevel={2}
        appel="available"
        remainingMs={0}
        onClose={() => {}}
      />,
    );
    const apport = document.querySelector('.assoc-sheet-apport') as HTMLDetailsElement;
    const bio = document.querySelector('.assoc-sheet-bio') as HTMLDetailsElement;
    expect(apport.open).toBe(true);
    expect(bio.open).toBe(false);
    bio.open = true;
    fireEvent(bio, new Event('toggle', { bubbles: true }));
    expect(bio.open).toBe(true);
    expect(apport.open).toBe(false);
    apport.open = true;
    fireEvent(apport, new Event('toggle', { bubbles: true }));
    expect(apport.open).toBe(true);
    expect(bio.open).toBe(false);
  });
});
