import type { StoreApi } from 'zustand';
import { t } from '../i18n/fr';
import type { GameStoreState } from '../store/gameStore';
import { Tile } from './Home';

/**
 * Patch 0.4.3 (P2): « Mission » screen. Both missions are locked: « bientôt », no date, no
 * state write (ethics rule 7, R-P43-14).
 */
export function Mission({ store }: { store: StoreApi<GameStoreState> }) {
  return (
    <section className="mission" aria-labelledby="mission-title">
      <h1 id="mission-title" className="screen-title" tabIndex={-1}>
        {t('missionTitle')}
      </h1>
      <p className="mission-intro">{t('missionIntro')}</p>
      <p className="small" id="mission-soon">
        {t('missionSoonNote')}
      </p>
      <div className="mission-grid" aria-describedby="mission-soon">
        <Tile store={store} id="tileBike" />
        <Tile store={store} id="tileDice" />
      </div>
    </section>
  );
}
