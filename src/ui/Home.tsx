import { useEffect, useState, type ReactNode } from 'react';
import { DESC_TODO, Dot, Modal } from './common';
import { pendingQuests, pendingQuestsFor } from '../core/questTargets';
import { navigate } from './router';
import { useStore, type StoreApi } from 'zustand';
import { PITY_LIMIT, QUEST_IDS, STAT_IDS, MAX_STAT, BALANCE, xpNeed } from '../data/balance';
import { incomeCentsPerSecond } from '../core/economy';
import { questDone } from '../core/quests';
import { centsToYen } from '../core/numbers';
import { t, type MessageKey } from '../i18n/fr';
import type { GameStoreState } from '../store/gameStore';
import { formatDuration, formatRate, formatYen } from './format';

type Store = StoreApi<GameStoreState>;
const asset = (name: string) => `${import.meta.env.BASE_URL}game/home/${name}`;

/**
 * Patch 0.4.3 (P2): four home tiles. « Travailler » and « Mission » are active; « Course à
 * vélo » and « Dé du destin » moved to the Mission screen.
 */
const TILES_LEFT = ['tileWork', 'tileLearn'] as const;
const TILES_RIGHT = ['tileHouse', 'tileMission'] as const;
export type TileKey =
  (typeof TILES_LEFT)[number] | (typeof TILES_RIGHT)[number] | 'tileBike' | 'tileDice';
const TILE_ICON: Record<TileKey, string> = {
  tileWork: '💻',
  tileLearn: '🎓',
  tileBike: '',
  tileHouse: '🏠',
  tileMission: '🎯',
  tileDice: '🎲',
};
const OPEN: Partial<Record<TileKey, 'work' | 'mission'>> = {
  tileWork: 'work',
  tileMission: 'mission',
};

/**
 * Tiles. Open tiles keep their exact accessible name and navigate. Locked tiles only
 * announce « bientôt »: no state write, no hash change (GS-V5-03). They are not links.
 */
export function Tile({ store, id }: { store: Store; id: TileKey }) {
  const name = t(id);
  const target = OPEN[id];
  const ill = (
    <span className="hub-ill" aria-hidden="true">
      {id === 'tileBike' ? (
        <img className="ill-photo" src={asset('bike-160.webp')} alt="" width={80} height={80} />
      ) : (
        <span className="hub-emoji">{TILE_ICON[id]}</span>
      )}
      {!target && <span className="hub-lock">🔒</span>}
    </span>
  );
  if (target) return <OpenTile store={store} ill={ill} name={name} target={target} />;
  return (
    <button
      type="button"
      className="hub-btn is-lock"
      aria-disabled="true"
      aria-label={t('tileLocked', { name })}
      onClick={() => store.getState().announce(t('tileSoon', { name }))}
    >
      {ill}
      <span className="hub-lbl" aria-hidden="true">
        {name}
      </span>
    </button>
  );
}

/** « Travailler » keeps the exact name; the pending « clic » quest is a description (D7). */
function OpenTile({
  store,
  ill,
  name,
  target,
}: {
  store: Store;
  ill: ReactNode;
  name: string;
  target: 'work' | 'mission';
}) {
  const todo = useStore(store, (s) =>
    s.game && target === 'work' ? pendingQuestsFor('work', s.game).length > 0 : false,
  );
  return (
    <button
      type="button"
      className={todo ? 'hub-btn is-open has-dot' : 'hub-btn is-open'}
      aria-describedby={todo ? DESC_TODO : undefined}
      onClick={() => navigate(target)}
    >
      {ill}
      <span className="hub-lbl">{name}</span>
      {todo && <Dot />}
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
      {/* Lot 4 (OD-9, Geraldy 01/11): the yellow « Travailler avec Aoi » button is removed;
          Aoi is a picture only, work happens on the Travailler screen. */}
      <div className="hub-aoi">
        <span className="halo" aria-hidden="true" />
        {/* Only the jean asset exists until the wardrobe (lot 6). */}
        <img
          src={asset('aoi-jean-720.webp')}
          alt={t('hubAoiAlt', { outfit: t(`outfit_${outfit}` as MessageKey) })}
          width={184}
          height={720}
          draggable={false}
        />
      </div>
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
  const todo = useStore(store, (s) => (s.game ? pendingQuests(s.game).length > 0 : false));
  const [statsOpen, setStatsOpen] = useState(false);
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
      <article
        className="card info has-dot"
        aria-labelledby="quests-card-title"
        aria-describedby={todo ? DESC_TODO : undefined}
      >
        {todo && <Dot />}
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
      <article className="card info stats">
        <button type="button" className="stats-open" onClick={() => setStatsOpen(true)}>
          <span className="stats-t">{t('statsTitle')}</span>
          <span className="small">{t('statsSub')}</span>
        </button>
      </article>
      <Modal open={statsOpen} onClose={() => setStatsOpen(false)} labelId="stats-title">
        <h2 id="stats-title">{t('statsTitle')}</h2>
        <div className="stats">
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
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => setStatsOpen(false)}>
          {t('close')}
        </button>
      </Modal>
    </section>
  );
}

/**
 * Home v5: profile, hub with the 6 tiles and Aoi, info cards. Lot 4: no save block (moved to
 * Paramètres) and no scrolling on a phone (GS-V5-64 f).
 */
export function Home({ store }: { store: Store }) {
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
    </div>
  );
}
