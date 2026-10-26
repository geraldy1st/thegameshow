import { useEffect, useRef, useState } from 'react';
import { Modal } from './common';
import { download, claimableCount } from './helpers';
import { Partners } from './Partners';
import { Friends } from './Friends';
import { Quests } from './Quests';
import { useStore, type StoreApi } from 'zustand';
import { INVESTMENT_IDS, INVESTMENTS, type InvestmentId } from '../data/balance';
import { canBuy, clickValueYen, incomeCentsPerSecond, nextCostYen } from '../core/economy';
import { centsToYen } from '../core/numbers';
import { t, type MessageKey } from '../i18n/fr';
import type { GameStoreState } from '../store/gameStore';
import { formatDuration, formatRate, formatYen, formatYenLong } from './format';

type Store = StoreApi<GameStoreState>;

function TopBar({ store, onQuests }: { store: Store; onQuests: () => void }) {
  const ready = useStore(store, (s) => claimableCount(s.game));
  const yen = useStore(store, (s) => centsToYen(s.game?.yenCents ?? 0));
  const tickets = useStore(store, (s) => s.game?.tickets ?? 0);
  return (
    <header className="topbar">
      {/* Plain text, read in document order; no aria-label on <p> (axe aria-prohibited-attr),
          no live region so per-second income does not spam screen readers. */}
      <p className="pill pill-yen num">
        <span className="visually-hidden">{t('yen')} : </span>
        <span aria-hidden="true">¥</span>
        <span>{formatYen(yen)}</span>
      </p>
      <p className="pill pill-tickets num">
        <span className="visually-hidden">{t('tickets')} : </span>
        <span aria-hidden="true">🎟</span>
        <span>{tickets}</span>
      </p>
      <button type="button" className="btn btn-secondary quests-btn" onClick={onQuests}>
        {t('questsOpen')}
        {ready > 0 && <span className="badge num">{t('questsReady', { n: ready })}</span>}
      </button>
    </header>
  );
}

function Play({ store }: { store: Store }) {
  const value = useStore(store, (s) => (s.game ? clickValueYen(s.game) : 1));
  const income = useStore(store, (s) => (s.game ? incomeCentsPerSecond(s.game) / 100 : 0));
  const readonly = useStore(store, (s) => s.status !== 'ready');
  return (
    <section aria-labelledby="play-title" className="stage">
      <h2 id="play-title">{t('playTitle')}</h2>
      <button
        type="button"
        className="btn btn-primary aoi"
        onClick={() => store.getState().click()}
        aria-disabled={readonly}
      >
        {t('clickAoi')}
      </button>
      <p className="num">{t('clickHint', { n: value })}</p>
      <p className="muted num">{t('incomePerSecond', { n: formatRate(income) })}</p>
    </section>
  );
}

function InvestmentCard({ store, id }: { store: Store; id: InvestmentId }) {
  const level = useStore(store, (s) => s.game?.investments[id] ?? 0);
  const affordable = useStore(store, (s) => (s.game ? canBuy(s.game, id) : false));
  const readonly = useStore(store, (s) => s.status !== 'ready');
  const cost = nextCostYen(id, level);
  const name = t(id);
  const disabled = !affordable || readonly;
  const onBuy = async () => {
    if (disabled) return;
    if (await store.getState().buy(id))
      store.getState().announce(t('bought', { name, n: level + 1 }));
    else if (store.getState().status === 'readonly') store.getState().announce(t('readonlyBanner'));
  };
  return (
    <article className="card" aria-labelledby={`inv-${id}`}>
      <h3 id={`inv-${id}`}>{name}</h3>
      <p className="meta num">
        {t('level', { n: level })} ·{' '}
        <span className="gain">
          {t('perSecond', { n: formatRate(INVESTMENTS[id].ratePerLevel) })}
        </span>
      </p>
      <p className={id === 'stock' ? 'risk' : 'meta'}>{t(`${id}Tip` as MessageKey)}</p>
      <div className="row">
        <button
          type="button"
          className="btn btn-primary num"
          aria-disabled={disabled}
          onClick={onBuy}
        >
          {/* Accessible name starts with the visible text (WCAG 2.5.3). */}
          {t('buy', { n: formatYen(cost) })}
          <span className="visually-hidden">{t('buyLabelSuffix', { name })}</span>
        </button>
        {!affordable && <span className="meta">{t('notEnough')}</span>}
      </div>
    </article>
  );
}

function Invest({ store }: { store: Store }) {
  return (
    <section aria-labelledby="invest-title">
      <h2 id="invest-title">{t('investTitle')}</h2>
      {INVESTMENT_IDS.map((id) => (
        <InvestmentCard key={id} store={store} id={id} />
      ))}
    </section>
  );
}

function ImportButton({ store }: { store: Store }) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<string | null>(null);
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setPending(await file.text());
    if (input.current) input.current.value = '';
  };
  const confirm = async () => {
    if (pending === null) return;
    const r = await store.getState().importSave(pending);
    setPending(null);
    store.getState().announce(r.ok ? t('importDone') : t('importFailed', { reason: r.reason }));
  };
  return (
    <>
      <input
        id="import-file"
        ref={input}
        className="visually-hidden file-input"
        type="file"
        accept="application/json,.json"
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
      {/* The label follows the hidden input so CSS can mirror the input focus on it. */}
      <label className="btn btn-ghost row file-label" htmlFor="import-file">
        {t('importSave')}
      </label>
      <Modal open={pending !== null} onClose={() => setPending(null)} labelId="import-title">
        <h2 id="import-title">{t('importSave')}</h2>
        <p>{t('importConfirm')}</p>
        <p className="meta">{t('checksumNote')}</p>
        <div className="row">
          <button type="button" className="btn btn-primary" onClick={() => void confirm()}>
            {t('importSave')}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setPending(null)}>
            {t('cancel')}
          </button>
        </div>
      </Modal>
    </>
  );
}

function SaveMenu({ store }: { store: Store }) {
  const [confirmReset, setConfirmReset] = useState(false);
  const readonly = useStore(store, (s) => s.status !== 'ready');
  return (
    <section aria-labelledby="save-title">
      <h2 id="save-title">{t('menuTitle')}</h2>
      <div className="row">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            const text = store.getState().exportSave();
            if (text) {
              download(text);
              store.getState().announce(t('exportDone'));
            }
          }}
        >
          {t('exportSave')}
        </button>
        {!readonly && <ImportButton store={store} />}
        {!readonly && (
          <button type="button" className="btn btn-ghost" onClick={() => setConfirmReset(true)}>
            {t('reset')}
          </button>
        )}
      </div>
      <p className="muted">{t('noPurchase')}</p>
      <Modal open={confirmReset} onClose={() => setConfirmReset(false)} labelId="reset-title">
        <h2 id="reset-title">{t('resetTitle')}</h2>
        <p>{t('resetBody')}</p>
        <div className="row">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setConfirmReset(false)}
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              void store.getState().newGame();
              setConfirmReset(false);
            }}
          >
            {t('resetConfirm')}
          </button>
        </div>
      </Modal>
    </section>
  );
}

function WelcomeBack({ store }: { store: Store }) {
  const pending = useStore(store, (s) => centsToYen(s.game?.pendingOfflineCents ?? 0));
  const absence = useStore(store, (s) => s.absenceMs);
  const ready = useStore(store, (s) => s.status === 'ready');
  const collect = async () => {
    await store.getState().collectOffline();
    store.getState().announce(t('collected', { n: formatYen(pending) }));
  };
  return (
    <Modal open={ready && pending > 0} onClose={() => void collect()} labelId="welcome-title">
      <h2 id="welcome-title">{t('welcomeTitle')}</h2>
      <p>{t('welcomeBody', { t: absence > 0 ? formatDuration(absence) : '—' })}</p>
      <p className="big num" aria-label={formatYenLong(pending)}>
        +{formatYen(pending)} ¥
      </p>
      <p className="meta">{t('welcomeCap')}</p>
      <button type="button" className="btn btn-primary" onClick={() => void collect()} autoFocus>
        {t('collect')}
      </button>
    </Modal>
  );
}

function Recovery({ store }: { store: Store }) {
  const reason = useStore(store, (s) => s.recoveryReason);
  const [confirm, setConfirm] = useState(false);
  return (
    <main className="app" aria-labelledby="recovery-title">
      <section>
        <h1 id="recovery-title">{t('recoveryTitle')}</h1>
        <p>{t('recoveryBody')}</p>
        <p className="muted">{reason}</p>
        <div className="row">
          <ImportButton store={store} />
          <button type="button" className="btn btn-ghost" onClick={() => setConfirm(true)}>
            {t('recoveryNew')}
          </button>
        </div>
      </section>
      {/* RES-7 / ethics rule 14: list what is lost and offer to keep a copy first (DEF-GS-01). */}
      <Modal open={confirm} onClose={() => setConfirm(false)} labelId="recovery-confirm-title">
        <h2 id="recovery-confirm-title">{t('recoveryConfirmTitle')}</h2>
        <p>{t('recoveryConfirmBody')}</p>
        <ul>
          <li>{t('recoveryLossYen')}</li>
          <li>{t('recoveryLossTickets')}</li>
          <li>{t('recoveryLossInvestments')}</li>
          <li>{t('recoveryLossProgress')}</li>
        </ul>
        <p>{t('recoveryKeepNote')}</p>
        <div className="row">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() =>
              void store
                .getState()
                .rawCurrentSave()
                .then((raw) => {
                  if (raw) {
                    download(raw, 'thegameshow-illisible');
                    store.getState().announce(t('recoveryDownloaded'));
                  }
                })
            }
          >
            {t('recoveryDownload')}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setConfirm(false)}>
            {t('cancel')}
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              setConfirm(false);
              void store.getState().newGame();
            }}
          >
            {t('recoveryConfirm')}
          </button>
        </div>
      </Modal>
    </main>
  );
}

/** Restore the `backup-before-reset` slot (lot 2 scope e), with confirmation. */
function ResetBackup({ store }: { store: Store }) {
  const revision = useStore(store, (s) => s.game?.revision ?? 0);
  const readonly = useStore(store, (s) => s.status !== 'ready');
  const [kind, setKind] = useState<'none' | 'unreadable' | 'ok'>('none');
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    let live = true;
    void store
      .getState()
      .resetBackup()
      .then((r) => live && setKind(r.kind));
    return () => {
      live = false;
    };
  }, [store, revision]);
  if (kind === 'none' || readonly) return null;
  return (
    <section aria-labelledby="reset-backup-title">
      <h2 id="reset-backup-title">{t('resetBackupTitle')}</h2>
      <p>{t('resetBackupBody')}</p>
      {kind === 'unreadable' ? (
        <p className="muted">{t('resetBackupUnreadable')}</p>
      ) : (
        <button type="button" className="btn btn-ghost" onClick={() => setConfirm(true)}>
          {t('resetBackupRestore')}
        </button>
      )}
      <Modal open={confirm} onClose={() => setConfirm(false)} labelId="reset-backup-confirm">
        <h2 id="reset-backup-confirm">{t('resetBackupRestore')}</h2>
        <p>{t('resetBackupConfirm')}</p>
        <div className="row">
          <button type="button" className="btn btn-ghost" onClick={() => setConfirm(false)}>
            {t('cancel')}
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              setConfirm(false);
              void store
                .getState()
                .restoreResetBackup()
                .then((ok) =>
                  store.getState().announce(ok ? t('resetBackupDone') : t('writeFailed')),
                );
            }}
          >
            {t('resetBackupRestore')}
          </button>
        </div>
      </Modal>
    </section>
  );
}

type Tab = 'play' | 'invest' | 'friends' | 'partners';
const TABS: readonly Tab[] = ['play', 'invest', 'friends', 'partners'];
const TAB_LABEL = {
  play: 'tabPlay',
  invest: 'tabInvest',
  friends: 'tabFriends',
  partners: 'tabPartners',
} as const;
const TAB_ICON = { play: '🖱', invest: '📈', friends: '♥', partners: '★' } as const;

function TabBar({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  return (
    <nav className="tabbar" aria-label={t('tabsLabel')}>
      {TABS.map((id) => (
        <button
          key={id}
          type="button"
          className={`tab ${tab === id ? 'on' : ''}`}
          aria-current={tab === id ? 'page' : undefined}
          onClick={() => onTab(id)}
        >
          <span aria-hidden="true">{TAB_ICON[id]}</span>
          {t(TAB_LABEL[id])}
        </button>
      ))}
    </nav>
  );
}

export function App({ store }: { store: Store }) {
  const status = useStore(store, (s) => s.status);
  const announcement = useStore(store, (s) => s.announcement);
  const motion = useStore(store, (s) => s.game?.settings.reducedMotion ?? 'auto');
  const writeError = useStore(store, (s) => s.writeError);
  const [tab, setTab] = useState<Tab>('play');
  const [quests, setQuests] = useState(false);

  useEffect(() => {
    if (motion === 'on') document.documentElement.dataset.motion = 'reduce';
    else delete document.documentElement.dataset.motion;
  }, [motion]);

  useEffect(() => {
    const id = setInterval(() => store.getState().tick(), 1000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') store.getState().tick();
      else void store.getState().flush();
    };
    const onHide = () => void store.getState().flush();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pagehide', onHide);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pagehide', onHide);
    };
  }, [store]);

  const live = (
    <p className="visually-hidden" aria-live="polite" role="status">
      {announcement}
    </p>
  );

  if (status === 'loading') {
    return (
      <main className="app" aria-busy="true">
        <p>{t('loading')}</p>
      </main>
    );
  }
  if (status === 'recovery') {
    return (
      <>
        <Recovery store={store} />
        {live}
      </>
    );
  }
  return (
    <div className="app">
      <TopBar store={store} onQuests={() => setQuests(true)} />
      {status === 'readonly' && (
        <p className="banner" role="alert">
          {t('readonlyBanner')}
        </p>
      )}
      {writeError && status === 'ready' && (
        <p className="banner" role="alert">
          {t('writeFailed')}
        </p>
      )}
      <main>
        <h1 className="visually-hidden">{t('appTitle')}</h1>
        {tab === 'play' && (
          <>
            <Play store={store} />
            <SaveMenu store={store} />
            <ResetBackup store={store} />
          </>
        )}
        {tab === 'invest' && <Invest store={store} />}
        {tab === 'friends' && <Friends store={store} />}
        {tab === 'partners' && <Partners store={store} />}
      </main>
      <TabBar tab={tab} onTab={setTab} />
      <Quests store={store} open={quests} onClose={() => setQuests(false)} />
      <WelcomeBack store={store} />
      {live}
    </div>
  );
}
