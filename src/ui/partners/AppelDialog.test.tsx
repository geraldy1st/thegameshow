// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
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

  it('returns focus to the call button after close (R-052D-02)', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(<AppelDialog a={omar} returnFocusId="af-call-omar" onClose={onClose} />);
    const dialog = document.querySelector('dialog.amsg')!;
    fireEvent.click(dialog); // writing → reading
    act(() => {
      vi.advanceTimersByTime(260);
    });
    fireEvent.click(dialog); // reading → close
    expect(document.activeElement?.id).toBe('af-call-omar');
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
