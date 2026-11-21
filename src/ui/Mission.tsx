import type { StoreApi } from 'zustand';
import { t } from '../i18n/fr';
import type { GameStoreState } from '../store/gameStore';
import { Tile } from './Home';

/**
 * Patch 0.4.3 (P2): « Mission » screen. Dice stays locked (« bientôt »).
 * I2: when the tab is read-only, the official v13 copy is shown exactly
 * (« Cette manche ne rapporte rien. ») — no Buck, no skills.
 */
export function Mission({ store }: { store: StoreApi<GameStoreState> }) {
  const readonly = store.getState().status === 'readonly';
  return (
    <section className="mission" aria-labelledby="mission-title">
      <h1 id="mission-title" className="screen-title" tabIndex={-1}>
        {t('missionTitle')}
      </h1>
      <p className="mission-intro">{t('missionIntro')}</p>
      {readonly ? (
        <p className="small bike-reader-note" data-testid="bike-reader-note">
          {t('bikeReaderNoReward')}
        </p>
      ) : (
        <p className="small" id="mission-soon">
          {t('missionSoonNote')}
        </p>
      )}
      <div className="mission-grid" aria-describedby={readonly ? undefined : 'mission-soon'}>
        <Tile store={store} id="tileBike" />
        <Tile store={store} id="tileDice" />
      </div>
    </section>
  );
}
