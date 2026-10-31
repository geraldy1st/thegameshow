import { useEffect, useRef, useState } from 'react';
import { Modal } from './common';
import { download, claimableCount, revealPending } from './helpers';
import { Home } from './Home';
import { goHome, navigate, replaceRoute, useRoute, type Route } from './router';
import { Partners } from './Partners';
import { Friends } from './Friends';
import { Quests } from './Quests';
import { useStore, type StoreApi } from 'zustand';
import { INVESTMENT_IDS, INVESTMENTS, type InvestmentId } from '../data/balance';
import { canBuy, nextCostYen } from '../core/economy';
import { centsToYen } from '../core/numbers';
import { t, type MessageKey } from '../i18n/fr';
import type { GameStoreState } from '../store/gameStore';
import { formatRate, formatYen } from './format';

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
      <h2 id={`inv-${id}`}>{name}</h2>
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
      <h1 id="invest-title" className="screen-title" tabIndex={-1}>
        {t('investTitle')}
      </h1>
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

function Recovery({ store }: { store: Store }) {
  const reason = useStore(store, (s) => s.recoveryReason);
  const kind = useStore(store, (s) => s.recoveryKind);
  const [confirm, setConfirm] = useState(false);
  return (
    <main className="app" aria-labelledby="recovery-title">
      <section>
        <h1 id="recovery-title">{t('recoveryTitle')}</h1>
        <p>{kind === 'future' ? t('futureVersion') : t('recoveryBody')}</p>
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

type BackupKind = 'none' | 'unreadable' | 'ok';

/**
 * Manual restore of a backup slot with confirmation: `backup-before-reset` (lot 2 scope e,
 * « Partie précédente ») or `backup-before-migration` (lot 3, MVP v1.3 step 8). Both copy the
 * current state into `backup-before-restore` first (R12).
 */
function BackupRestore({ store, slot }: { store: Store; slot: 'reset' | 'migration' }) {
  const revision = useStore(store, (s) => s.game?.revision ?? 0);
  const readonly = useStore(store, (s) => s.status !== 'ready');
  const [kind, setKind] = useState<BackupKind>('none');
  const [confirm, setConfirm] = useState(false);
  const keys =
    slot === 'reset'
      ? {
          title: 'resetBackupTitle',
          body: 'resetBackupBody',
          restore: 'resetBackupRestore',
          confirm: 'resetBackupConfirm',
          done: 'resetBackupDone',
        }
      : {
          title: 'migrationBackupTitle',
          body: 'migrationBackupBody',
          restore: 'migrationBackupRestore',
          confirm: 'migrationBackupConfirm',
          done: 'migrationBackupDone',
        };
  useEffect(() => {
    let live = true;
    const st = store.getState();
    void (slot === 'reset' ? st.resetBackup() : st.migrationBackup()).then(
      (r) => live && setKind(r.kind),
    );
    return () => {
      live = false;
    };
  }, [store, revision, slot]);
  if (kind === 'none' || readonly) return null;
  const id = `${slot}-backup`;
  return (
    <section aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>{t(keys.title as MessageKey)}</h2>
      <p>{t(keys.body as MessageKey)}</p>
      {kind === 'unreadable' ? (
        <p className="muted">{t('resetBackupUnreadable')}</p>
      ) : (
        <button type="button" className="btn btn-ghost" onClick={() => setConfirm(true)}>
          {t(keys.restore as MessageKey)}
        </button>
      )}
      <Modal open={confirm} onClose={() => setConfirm(false)} labelId={`${id}-confirm`}>
        <h2 id={`${id}-confirm`}>{t(keys.restore as MessageKey)}</h2>
        <p>{t(keys.confirm as MessageKey)}</p>
        <div className="row">
          <button type="button" className="btn btn-ghost" onClick={() => setConfirm(false)}>
            {t('cancel')}
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              setConfirm(false);
              const st = store.getState();
              void (slot === 'reset' ? st.restoreResetBackup() : st.restoreMigrationBackup()).then(
                (ok) =>
                  store.getState().announce(ok ? t(keys.done as MessageKey) : t('writeFailed')),
              );
            }}
          >
            {t(keys.restore as MessageKey)}
          </button>
        </div>
      </Modal>
    </section>
  );
}

type Tab = 'home' | 'invest' | 'friends' | 'partners';
const TABS: readonly Tab[] = ['home', 'invest', 'friends', 'partners'];
const TAB_LABEL = {
  home: 'tabHome',
  invest: 'tabInvest',
  friends: 'tabFriends',
  partners: 'tabPartners',
} as const;
const TAB_ICON = { home: '⌂', invest: '📈', friends: '♥', partners: '★' } as const;

function TabBar({ route }: { route: Route }) {
  return (
    <nav className="tabbar" aria-label={t('tabsLabel')}>
      {TABS.map((id) => {
        const on = route === id || (id === 'home' && route === 'quests');
        return (
          <button
            key={id}
            type="button"
            className={`tab ${on ? 'on' : ''}`}
            aria-current={on ? 'page' : undefined}
            onClick={() => (id === 'home' ? goHome() : navigate(id))}
          >
            <span aria-hidden="true">{TAB_ICON[id]}</span>
            {t(TAB_LABEL[id])}
          </button>
        );
      })}
    </nav>
  );
}

/** « ← Accueil » on every non-home screen (MVP v1.3 lot 3, menu). */
function BackHome() {
  return (
    <button type="button" className="btn btn-ghost back" onClick={() => goHome()}>
      {t('backHome')}
    </button>
  );
}

export function App({ store }: { store: Store }) {
  const status = useStore(store, (s) => s.status);
  const announcement = useStore(store, (s) => s.announcement);
  const motion = useStore(store, (s) => s.game?.settings.reducedMotion ?? 'auto');
  const writeError = useStore(store, (s) => s.writeError);
  const route = useRoute();
  const screen: Route = route;
  // DEF-GS-08: a reveal interrupted by a reload is shown again once, on the Associés screen.
  const resumed = useRef(false);
  useEffect(
    () =>
      store.subscribe((st) => {
        if (st.status !== 'ready' || resumed.current) return;
        resumed.current = true;
        if (revealPending(st.game, st.game?.gacha.last ?? null)) {
          if (screen === 'home') navigate('partners');
          else replaceRoute('partners');
        }
      }),
    [store, screen],
  );
  // GS-V5-04 / GS-V5-17: after every screen change the focus goes to the screen's h1 (the
  // quests dialog focuses its own title). A focus() on an element made inert by an open
  // dialog is ignored, so a dialog keeps the focus.
  const shown = status === 'ready' || status === 'readonly';
  useEffect(() => {
    if (!shown || route === 'quests') return;
    document.querySelector<HTMLElement>('main .screen-title')?.focus();
  }, [route, shown]);

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
      <TopBar store={store} onQuests={() => navigate('quests')} />
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
        {(screen === 'home' || screen === 'quests') && (
          <Home store={store}>
            <SaveMenu store={store} />
            <BackupRestore store={store} slot="reset" />
            <BackupRestore store={store} slot="migration" />
          </Home>
        )}
        {screen !== 'home' && screen !== 'quests' && <BackHome />}
        {screen === 'invest' && <Invest store={store} />}
        {screen === 'friends' && <Friends store={store} />}
        {screen === 'partners' && <Partners store={store} />}
      </main>
      <TabBar route={route} />
      <Quests store={store} open={route === 'quests'} onClose={() => goHome()} />
      {live}
    </div>
  );
}
