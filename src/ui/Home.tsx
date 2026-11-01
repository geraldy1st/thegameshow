import { useEffect } from 'react';
import { useStore, type StoreApi } from 'zustand';
import { PITY_LIMIT, QUEST_IDS, STAT_IDS, MAX_STAT, BALANCE, xpNeed } from '../data/balance';
import { clickValueYen, incomeCentsPerSecond } from '../core/economy';
import { questDone } from '../core/quests';
import { centsToYen } from '../core/numbers';
import { t, type MessageKey } from '../i18n/fr';
import type { GameStoreState } from '../store/gameStore';
import { formatDuration, formatRate, formatYen } from './format';

type Store = StoreApi<GameStoreState>;
const asset = (name: string) => `${import.meta.env.BASE_URL}game/home/${name}`;

/** Activity tiles in the mockup order; none is delivered in lot 3 (GS-V5-03). */
const TILES_LEFT = ['tileWork', 'tileLearn', 'tileBike'] as const;
const TILES_RIGHT = ['tileHouse', 'tileFree', 'tileDice'] as const;
type TileKey = (typeof TILES_LEFT)[number] | (typeof TILES_RIGHT)[number];
const TILE_ICON: Record<TileKey, string> = {
  tileWork: '💻',
  tileLearn: '🎓',
  tileBike: '',
  tileHouse: '🏠',
  tileFree: '💼',
  tileDice: '🎲',
};

/**
 * A locked tile: announced as locked, and a press only announces « bientôt »: no state write,
 * no hash change (GS-V5-03).
 */
function Tile({ store, id }: { store: Store; id: TileKey }) {
  const name = t(id);
  return (
    <button
      type="button"
      className="hub-btn is-lock"
      aria-disabled="true"
      aria-label={t('tileLocked', { name })}
      onClick={() => store.getState().announce(t('tileSoon', { name }))}
    >
      <span className="hub-ill" aria-hidden="true">
        {id === 'tileBike' ? (
          <img className="ill-photo" src={asset('bike-160.webp')} alt="" width={80} height={80} />
        ) : (
          <span className="hub-emoji">{TILE_ICON[id]}</span>
        )}
        <span className="hub-lock">🔒</span>
      </span>
      <span className="hub-lbl" aria-hidden="true">
        {name}
      </span>
    </button>
  );
}

function Profile({ store }: { store: Store }) {
  const level = useStore(store, (s) => s.game?.profile.level ?? 1);
  const xp = useStore(store, (s) => s.game?.profile.xp ?? 0);
  const energy = useStore(store, (s) => s.game?.energy.value ?? 0);
  const income = useStore(store, (s) => (s.game ? incomeCentsPerSecond(s.game) / 100 : 0));
  const need = xpNeed(level);
  const max = BALANCE.energy.max;
  return (
    <section className="profile card" aria-label={t('profileLabel')}>
      <img
        className="pf-ph"
        src={asset('aoi-portrait-192.webp')}
        alt={t('profilePortraitAlt')}
        width={96}
        height={96}
      />
      <div className="pf-main">
        <div className="pf-row">
          <h2>{t('profileName')}</h2>
          <span className="lv-chip num">{t('profileLevel', { n: level })}</span>
        </div>
        <div
          className="xp"
          role="progressbar"
          aria-label={t('xpLabel')}
          aria-valuemin={0}
          aria-valuemax={need}
          aria-valuenow={xp}
        >
          <i style={{ transform: `scaleX(${xp / need})` }} />
        </div>
        <p className="pf-sub num">
          {t('xpText', { a: xp, b: need })} · {t('passive', { n: formatRate(income) })}
        </p>
        <div
          className="energy"
          role="progressbar"
          aria-label={t('energyLabel')}
          aria-valuemin={0}
          aria-valuemax={max}
          aria-valuenow={energy}
          aria-valuetext={`${energy} sur ${max}`}
        >
          <i style={{ transform: `scaleX(${Math.min(1, energy / max)})` }} />
          <span className="num" aria-hidden="true">
            {t('energyText', { a: energy, b: max })}
          </span>
        </div>
      </div>
    </section>
  );
}

function Hub({ store }: { store: Store }) {
  const outfit = useStore(store, (s) => s.game?.wardrobe.outfit ?? 'jean');
  const value = useStore(store, (s) => (s.game ? clickValueYen(s.game) : 1));
  const readonly = useStore(store, (s) => s.status !== 'ready');
  return (
    <section className="hub" aria-label={t('hubLabel')}>
      <div className="hub-bg" aria-hidden="true">
        <img src={asset('rue-neon-720.webp')} alt="" width={720} height={706} />
      </div>
      <div className="hub-col l">
        {TILES_LEFT.map((id) => (
          <Tile key={id} store={store} id={id} />
        ))}
      </div>
      {/* The lot 1 click stays on Aoi herself (« Travailler avec Aoi », lot 1/2 E2E). */}
      <button
        type="button"
        className="hub-aoi"
        onClick={() => store.getState().tap()}
        aria-disabled={readonly}
        aria-describedby="hub-aoi-desc"
      >
        <span className="halo" aria-hidden="true" />
        {/* Only the jean asset exists until the wardrobe (lot 6). */}
        <img src={asset('aoi-jean-720.webp')} alt="" width={184} height={720} draggable={false} />
        {/* Accessible name = visible label (WCAG 2.5.3). */}
        <span className="hub-aoi-lbl">{t('clickAoi')}</span>
      </button>
      <p id="hub-aoi-desc" className="hub-aoi-hint num">
        <span className="visually-hidden">
          {t('hubAoiAlt', { outfit: t(`outfit_${outfit}` as MessageKey) })}.{' '}
        </span>
        {t('clickHint', { n: value })}
      </p>
      <div className="hub-col r">
        {TILES_RIGHT.map((id) => (
          <Tile key={id} store={store} id={id} />
        ))}
      </div>
    </section>
  );
}

function Infos({ store }: { store: Store }) {
  const pity = useStore(store, (s) => s.game?.gacha.pity ?? 0);
  const done = useStore(store, (s) =>
    s.game ? QUEST_IDS.filter((q) => questDone(s.game!, q)).length : 0,
  );
  const pending = useStore(store, (s) => centsToYen(s.game?.pendingOfflineCents ?? 0));
  const absence = useStore(store, (s) => s.absenceMs);
  const readonly = useStore(store, (s) => s.status !== 'ready');
  const stats = useStore(store, (s) => s.game?.stats);
  const left = PITY_LIMIT - pity;
  const collect = async () => {
    await store.getState().collectOffline();
    store.getState().announce(t('collected', { n: formatYen(pending) }));
  };
  return (
    <section className="infos" aria-label={t('homeTitle')}>
      <article className="card info goal" aria-labelledby="goal-title">
        <h2 id="goal-title">{t('goalTitle')}</h2>
        <p className="info-big num">{left <= 1 ? t('goalPityNext') : t('goalPity', { n: left })}</p>
        <div className="bar" aria-hidden="true">
          <i style={{ transform: `scaleX(${pity / PITY_LIMIT})` }} />
        </div>
        <p className="small num">{t('goalSub', { n: pity })}</p>
      </article>
      {/* Not a button: « Quêtes du jour » lives in the top bar (one control per action). */}
      <article className="card info" aria-labelledby="quests-card-title">
        <h2 id="quests-card-title">{t('questsCardTitle')}</h2>
        <p className="info-big num">{t('questsCardBig', { a: done, b: QUEST_IDS.length })}</p>
        <p className="small">{t('questsCardSub')}</p>
      </article>
      <article className="card info" aria-labelledby="offline-title">
        <h2 id="offline-title">{t('offlineTitle')}</h2>
        <p className="info-big num">
          {pending >= 1 ? `+${formatYen(pending)} ¥` : t('offlineNone')}
        </p>
        <p className="small">
          {pending >= 1 && absence > 0
            ? t('offlineCounted', { t: formatDuration(absence) })
            : t('offlineCapNote')}
        </p>
        {pending >= 1 && !readonly && (
          <button type="button" className="btn btn-primary sm" onClick={() => void collect()}>
            {t('offlineCollect')}
          </button>
        )}
      </article>
      <details className="card info stats">
        <summary>
          <h2>{t('statsTitle')}</h2>
          <span className="small">{t('statsSub')}</span>
        </summary>
        <ul>
          {STAT_IDS.map((k) => {
            const v = stats?.[k] ?? 0;
            const label = t(`stat_${k}` as MessageKey);
            return (
              <li key={k}>
                <span>{label}</span>
                <span
                  className="bar"
                  role="progressbar"
                  aria-label={label}
                  aria-valuemin={0}
                  aria-valuemax={MAX_STAT}
                  aria-valuenow={v}
                >
                  <i style={{ transform: `scaleX(${v / MAX_STAT})` }} />
                </span>
                <b className="num">{v}</b>
              </li>
            );
          })}
        </ul>
      </details>
    </section>
  );
}

/** Home v5 (lot 3): profile, hub with the 6 tiles and Aoi, info cards. */
export function Home({ store, children }: { store: Store; children?: React.ReactNode }) {
  useEffect(() => {
    // GS-V5-02: « accueil jouable » = h1 rendered, save loaded, tiles active.
    if (!performance.getEntriesByName('tgs:home-ready').length) performance.mark('tgs:home-ready');
  }, []);
  return (
    <div className="home">
      <h1 id="home-title" className="visually-hidden screen-title" tabIndex={-1}>
        {t('homeTitle')}
      </h1>
      <Profile store={store} />
      <Hub store={store} />
      <Infos store={store} />
      {children}
    </div>
  );
}
