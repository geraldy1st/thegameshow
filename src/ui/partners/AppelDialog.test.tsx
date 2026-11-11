// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { type ReactNode, useLayoutEffect } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ASSOCIATES } from '../../data/balance';
import { AppelDialog } from './AppelDialog';

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
  vi.useRealTimers();
  delete document.documentElement.dataset.motion;
});

const omar = ASSOCIATES.find((a) => a.id === 'omar')!;

describe('AppelDialog', () => {
  beforeEach(() => {
    document.body.innerHTML = '<button id="af-call-omar">Boost actif</button>';
  });

  it('mounts an empty live region, then announces writing, then the replica (R-052D-03)', () => {
    render(<AppelDialog a={omar} returnFocusId="af-call-omar" onClose={() => {}} />);
    const live = document.getElementById('amsg-live')!;
    expect(live.getAttribute('aria-live')).toBe('polite');
    // Initial state is '' (filled in useEffect after the first paint, R-052D-03).
    expect(live.textContent).toMatch(/Omar écrit/);
    expect(document.getElementById('amsg-bubble')?.textContent).toBe('');
    fireEvent.click(document.querySelector('dialog.amsg')!);
    expect(document.getElementById('amsg-bubble')?.textContent).toMatch(
      /On découpe le plan : bonus Épargne ×2 pendant 1 h/,
    );
    expect(document.querySelector('.amsg-chip')?.textContent).toBe('⚡ bonus Épargne ×2 · 1 h');
    expect(document.querySelector('dialog.amsg')?.getAttribute('aria-describedby')).toBe(
      'amsg-bubble',
    );
  });

  it('header has the avatar, name and stars, and no online badge', () => {
    render(<AppelDialog a={omar} returnFocusId="af-call-omar" onClose={() => {}} />);
    expect(document.querySelector('.amsg-av')).toBeTruthy();
    expect(document.getElementById('amsg-name')?.textContent).toBe('Omar');
    expect(document.querySelector('.amsg-stars')?.textContent).toBe('★★★');
    expect(document.querySelector('.amsg-on')).toBeNull();
    expect(document.querySelector('.amsg-head')?.textContent).not.toMatch(/en ligne/);
  });

  it('reduced-motion: no typing indicator, replica immediately, no transform (R-052D-07)', () => {
    document.documentElement.dataset.motion = 'reduce';
    render(<AppelDialog a={omar} returnFocusId="af-call-omar" onClose={() => {}} />);
    expect(document.querySelector('.amsg-type')).toBeNull();
    expect(document.getElementById('amsg-bubble')?.textContent).toMatch(
      /On découpe le plan : bonus Épargne ×2 pendant 1 h/,
    );
    expect(document.querySelector('dialog.amsg')?.classList.contains('rmx')).toBe(true);
  });

  it('inserts an empty live region, then fills it (R-052D-03 / DEF-GS-41 D13)', () => {
    const atLayout: string[] = [];
    function Probe({ children }: { children: ReactNode }) {
      useLayoutEffect(() => {
        atLayout.push(document.getElementById('amsg-live')?.textContent ?? 'missing');
      });
      return children;
    }
    render(
      <Probe>
        <AppelDialog a={omar} returnFocusId="af-call-omar" onClose={() => {}} />
      </Probe>,
    );
    // useLayoutEffect runs after DOM commit and before useEffect fills the region.
    expect(atLayout[0]).toBe('');
    expect(document.getElementById('amsg-live')?.textContent).toMatch(/Omar écrit/);
  });

  it('does not auto-close after writing then reading (DEF-GS-41 D15)', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(<AppelDialog a={omar} returnFocusId="af-call-omar" onClose={onClose} />);
    const dialog = document.querySelector('dialog.amsg') as HTMLDialogElement;
    // Flush writing → reading first, then 10 s of reading in slices so a close
    // timer armed mid-slice (D15) is flushed on the next act().
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(dialog.open).toBe(true);
    expect(document.getElementById('amsg-bubble')?.textContent).toMatch(/On découpe le plan/);
    for (let i = 0; i < 20; i++) {
      act(() => {
        vi.advanceTimersByTime(500);
      });
    }
    expect(dialog.open).toBe(true);
    expect(document.getElementById('amsg-bubble')?.textContent).toMatch(/On découpe le plan/);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps the dialog open during the pointer exit animation, then close()s (DEF-GS-40)', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(<AppelDialog a={omar} returnFocusId="af-call-omar" onClose={onClose} />);
    const dialog = document.querySelector('dialog.amsg') as HTMLDialogElement;
    fireEvent.click(dialog);
    act(() => {
      vi.advanceTimersByTime(260);
    });
    fireEvent.click(dialog);
    expect(dialog.open).toBe(true);
    expect(dialog.classList.contains('out')).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(260);
    });
    expect(dialog.open).toBe(false);
    expect(document.activeElement?.id).toBe('af-call-omar');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('returns focus immediately on the second Escape (R-052D-02 / DEF-GS-40 exception)', () => {
    const onClose = vi.fn();
    render(<AppelDialog a={omar} returnFocusId="af-call-omar" onClose={onClose} />);
    const dialog = document.querySelector('dialog.amsg') as HTMLDialogElement;
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(dialog.open).toBe(true);
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(dialog.open).toBe(false);
    expect(document.activeElement?.id).toBe('af-call-omar');
    expect(onClose).toHaveBeenCalledOnce();
  });
});
