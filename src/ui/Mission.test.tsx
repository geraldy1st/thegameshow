// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { t } from '../i18n/fr';
import { Mission } from './Mission';
import type { GameStoreState } from '../store/gameStore';

afterEach(cleanup);

function stubStore(status: GameStoreState['status']) {
  return createStore<GameStoreState>(
    () =>
      ({
        status,
        game: null,
        recoveryReason: null,
        recoveryKind: null,
        announcement: '',
        absenceMs: 0,
        writeError: false,
        wallMs: 0,
        reloadNeeded: false,
      }) as GameStoreState,
  );
}

describe('Mission reader-tab copy (v13)', () => {
  it('is exactly « Cette manche ne rapporte rien. » and is shown only when readonly', () => {
    expect(t('bikeReaderNoReward')).toBe('Cette manche ne rapporte rien.');
    expect(t('bikeDepart')).toBe('Partir');
    render(<Mission store={stubStore('readonly')} />);
    expect(screen.getByTestId('bike-reader-note').textContent).toBe(
      'Cette manche ne rapporte rien.',
    );
    cleanup();
    render(<Mission store={stubStore('ready')} />);
    expect(screen.queryByTestId('bike-reader-note')).toBeNull();
    expect(screen.getByText(/arrivent bientôt/)).toBeTruthy();
  });
});
