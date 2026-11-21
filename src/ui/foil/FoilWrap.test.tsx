/** @vitest-environment jsdom */
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyReducedMotionSetting } from '../helpers';
import { FOIL_DRAG_THRESHOLD_PX, foilFx } from './foilFx';
import { FoilWrap } from './FoilWrap';

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.motion;
  applyReducedMotionSetting('off');
  // Drop any leftover surfaces if a test unmounted poorly.
  if (foilFx.size) foilFx.stop();
});

describe('FoilWrap', () => {
  it('renders children only when the associate is unobtained or 1★', () => {
    const { container, rerender } = render(
      <FoilWrap rarity={3} obtained={false}>
        <img alt="" />
      </FoilWrap>,
    );
    expect(container.querySelector('.foil')).toBeNull();
    rerender(
      <FoilWrap rarity={1} obtained={true}>
        <img alt="" />
      </FoilWrap>,
    );
    expect(container.querySelector('.foil')).toBeNull();
  });

  it('wraps an obtained 2★ / 3★ and keeps foil layers inert', () => {
    applyReducedMotionSetting('off');
    const { container, rerender } = render(
      <FoilWrap rarity={3} obtained>
        <img alt="" />
      </FoilWrap>,
    );
    const wrap = container.querySelector('[data-testid="foil-wrap"]');
    expect(wrap?.getAttribute('data-foil')).toBe('3');
    const layers = container.querySelectorAll('.foil-holo, .foil-spec');
    expect(layers).toHaveLength(2);
    layers.forEach((n) => {
      expect(n.getAttribute('aria-hidden')).toBe('true');
      expect(getComputedStyle(n).pointerEvents === 'none' || n.className.includes('foil')).toBe(
        true,
      );
    });
    rerender(
      <FoilWrap rarity={2} obtained>
        <img alt="" />
      </FoilWrap>,
    );
    expect(container.querySelector('[data-testid="foil-wrap"]')?.getAttribute('data-foil')).toBe(
      '2',
    );
  });

  it('uses a static rim and no layers when motion is reduced', () => {
    applyReducedMotionSetting('on');
    const { container } = render(
      <FoilWrap rarity={3} obtained>
        <img alt="" />
      </FoilWrap>,
    );
    const wrap = container.querySelector('.foil');
    expect(wrap?.classList.contains('foil-still')).toBe(true);
    expect(container.querySelector('.foil-holo')).toBeNull();
    expect(foilFx.running).toBe(false);
  });

  it('does not open a click target after a drag past the tilt threshold', () => {
    applyReducedMotionSetting('off');
    const onHostClick = vi.fn();
    const { getByTestId } = render(
      <button type="button" onClick={onHostClick}>
        <FoilWrap rarity={3} obtained>
          <img alt="" />
        </FoilWrap>
      </button>,
    );
    const wrap = getByTestId('foil-wrap');
    fireEvent.pointerDown(wrap, { clientX: 10, clientY: 10, pointerType: 'touch' });
    fireEvent.pointerMove(wrap, {
      clientX: 10 + FOIL_DRAG_THRESHOLD_PX + 2,
      clientY: 10,
      pointerType: 'touch',
    });
    fireEvent.click(wrap);
    expect(onHostClick).not.toHaveBeenCalled();
    fireEvent.pointerDown(wrap, { clientX: 10, clientY: 10, pointerType: 'touch' });
    fireEvent.pointerUp(wrap, { clientX: 10, clientY: 10, pointerType: 'touch' });
    fireEvent.click(wrap);
    expect(onHostClick).toHaveBeenCalled();
  });
});
