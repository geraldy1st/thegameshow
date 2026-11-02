import { useEffect, useRef, useState } from 'react';
import { useStore, type StoreApi } from 'zustand';
import {
  ASSOCIATES,
  PITY_LIMIT,
  REVEAL_MS,
  REVEAL_REDUCED_MS,
  SKIP_HOLD_MS,
  type AssociateDef,
} from '../data/balance';
import { BIOS } from '../data/bios';
import { pullsUntilGuarantee } from '../core/gacha';
import { TEN, readTenMarker, writeTenMarker } from './partners/tenMarker';
import type { LastPull } from '../core/types';
import { t, type MessageKey } from '../i18n/fr';
import type { GameStoreState } from '../store/gameStore';
import { Modal, Portrait } from './common';
import { Rates } from './Rates';
import { displayName, markRevealSeen, prefersReducedMotion, revealPending } from './helpers';

type Store = StoreApi<GameStoreState>;

const stars = (n: number) => '★'.repeat(n);
const target = (a: AssociateDef) => t(`target${a.target}` as MessageKey);

function pityText(pity: number): string {
  const left = pullsUntilGuarantee(pity);
  return left === 1 ? t('pityNext') : t('pityLine', { n: left });
}

function resultText(last: LastPull): string {
  const name = displayName(last.id);
  if (last.wasted) return t('revealWasted', { name });
  return last.isNew
    ? t('revealNew', { name, n: last.stars })
    : t('revealDup', { name, n: last.stars });
}

/**
 * Reveal (~2.3 s, DESIGN-BRIEF). The result is ALREADY saved when this opens. A long press
 * (>= 400 ms) or "Passer" jumps to the end; reduced motion = 180 ms fade.
 */
function Reveal({
  store,
  last,
  onDone,
  resumed = false,
}: {
  store: Store;
  last: LastPull;
  onDone: () => void;
  resumed?: boolean;
}) {
  const reduced = prefersReducedMotion();
  const [done, setDone] = useState(resumed);
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pity = useStore(store, (s) => s.game?.gacha.pity ?? 0);
  const def = ASSOCIATES.find((a) => a.id === last.id)!;
  useEffect(() => {
    const id = setTimeout(() => setDone(true), reduced ? REVEAL_REDUCED_MS : REVEAL_MS);
    return () => clearTimeout(id);
  }, [reduced]);
  useEffect(() => {
    const g = store.getState().game;
    if (done && g) markRevealSeen(g, last.pull);
    if (done)
      store
        .getState()
        .announce(t('revealAnnounce', { result: resultText(last), pity: pityText(pity) }));
  }, [done, last, pity, store]);
  const startHold = () => {
    hold.current = setTimeout(() => setDone(true), SKIP_HOLD_MS);
  };
  const endHold = () => {
    if (hold.current) clearTimeout(hold.current);
  };
  return (
    <Modal open onClose={onDone} labelId="reveal-title">
      <div
        className={`reveal r${def.rarity} ${reduced ? 'reduced' : ''} ${done ? 'done' : ''}`}
        onPointerDown={startHold}
        onPointerUp={endHold}
        onPointerLeave={endHold}
        onPointerCancel={endHold}
        data-testid="reveal"
      >
        {!done ? (
          <>
            <h2 id="reveal-title">{t('drawing')}</h2>
            <div className="card-back" aria-hidden="true">
              <span>🎟</span>
            </div>
            <p className="meta">{t('skipHint')}</p>
            <button type="button" className="btn btn-secondary" onClick={() => setDone(true)}>
              {t('skip')}
            </button>
          </>
        ) : (
          <>
            <h2 id="reveal-title">{displayName(last.id)}</h2>
            {resumed && <p className="meta">{t('lastPullResumed')}</p>}
            <Portrait id={last.id} alt="" className={`portrait frame-${def.rarity}`} />
            <p className="stars-line" aria-hidden="true">
              {stars(last.stars)}
            </p>
            <p className="result">{resultText(last)}</p>
            {last.forced && <p className="meta">{t('revealForced')}</p>}
            <p className="meta num">
              {t('bonusPerStar', { p: def.percentPerStar, target: target(def) })}
            </p>
            <p className="lesson">{t(`lesson${def.target}` as MessageKey)}</p>
            <p className="num pity-result">{pityText(pity)}</p>
            <button type="button" className="btn btn-primary" onClick={onDone} autoFocus>
              {t('continue')}
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}

/**
 * Patch 0.4.3 (P8, R-P43-11): an owned partner's photo opens its profile. No biography is
 * shown until a text approved by Geraldy is in BIOS (data/bios.ts, docs/BIOS-SOURCE.md).
 */
function PartnerBio({
  a,
  starsNow,
  onClose,
}: {
  a: AssociateDef;
  starsNow: number;
  onClose: () => void;
}) {
  const bio = BIOS[a.id];
  return (
    <Modal open onClose={onClose} labelId="bio-title">
      <div className={`bio r${a.rarity}`}>
        <h2 id="bio-title">{displayName(a.id)}</h2>
        <Portrait id={a.id} alt="" className={`portrait frame-${a.rarity}`} />
        <p className="num">
          <span aria-hidden="true">{stars(starsNow)} </span>
          {t('rarity', { n: starsNow })}
        </p>
        <p className="num">
          {t('bonusNow', { p: a.percentPerStar * starsNow, target: target(a) })}
        </p>
        {bio && <p className="bio-text">{bio}</p>}
        <button type="button" className="btn btn-primary" onClick={onClose} autoFocus>
          {t('close')}
        </button>
      </div>
    </Modal>
  );
}

function PartnerCard({
  store,
  a,
  onProfile,
}: {
  store: Store;
  a: AssociateDef;
  onProfile: (a: AssociateDef) => void;
}) {
  const s = useStore(store, (st) => st.game?.gacha.stars[a.id] ?? 0);
  return (
    <li className={`card acard r${a.rarity} ${s ? '' : 'lock'}`}>
      {s ? (
        <button type="button" className="acard-photo" onClick={() => onProfile(a)}>
          <Portrait id={a.id} alt="" className="portrait" />
          <span className="visually-hidden">{t('bioOpen', { name: displayName(a.id) })}</span>
        </button>
      ) : (
        <Portrait id={a.id} alt="" className="portrait" />
      )}
      <p className="acard-name">{displayName(a.id)}</p>
      <p className="num">
        <span aria-hidden="true">{s ? stars(s) : '🔒'}</span>
        <span className="visually-hidden">{s ? t('rarity', { n: s }) : t('locked')}</span>
      </p>
      <p className="acard-bonus num">
        {s
          ? t('bonusNow', { p: a.percentPerStar * s, target: target(a) })
          : t('bonusPerStar', { p: a.percentPerStar, target: target(a) })}
      </p>
    </li>
  );
}

/** « 1 × 3 ★ · 2 × 2 ★ · 7 × 1 ★ · 4 nouveaux » */
function tenSummary(results: readonly LastPull[]): string {
  const parts = ([3, 2, 1] as const)
    .map((r) => {
      const n = results.filter((x) => ASSOCIATES.find((a) => a.id === x.id)!.rarity === r).length;
      return n ? t('tenCount', { n, r }) : '';
    })
    .filter(Boolean);
  const fresh = results.filter((x) => x.isNew).length;
  return t('tenSummary', { parts: parts.join(' · '), n: fresh });
}

/**
 * Patch 0.4.3 (P10, R-P43-7): the ten results in one grid. Already saved when it opens; the
 * pity shown is the one after the ten draws. Échap = « Continuer ». Summary announced once.
 */
function TenReveal({
  store,
  results,
  resumed = false,
  onDone,
}: {
  store: Store;
  results: readonly LastPull[];
  resumed?: boolean;
  onDone: () => void;
}) {
  const pity = useStore(store, (s) => s.game?.gacha.pity ?? 0);
  const announced = useRef(false);
  useEffect(() => {
    if (announced.current) return;
    announced.current = true;
    store.getState().announce(t('tenAnnounce', { s: tenSummary(results), pity: pityText(pity) }));
  }, [results, pity, store]);
  // Seen only once closed: a reload while the grid is open shows it again (R-P43-3).
  const close = () => {
    const g = store.getState().game;
    if (g) markRevealSeen(g, results[results.length - 1]!.pull);
    onDone();
  };
  return (
    <Modal open onClose={close} labelId="ten-title">
      <div className="ten" data-testid="ten-reveal">
        <h2 id="ten-title">{t('tenTitle')}</h2>
        {resumed && <p className="meta">{t('lastPullResumed')}</p>}
        <p className="ten-sum num">{tenSummary(results)}</p>
        <ol className="ten-grid">
          {results.map((r) => {
            const def = ASSOCIATES.find((a) => a.id === r.id)!;
            return (
              <li key={r.pull} className={`ten-item r${def.rarity}`}>
                <Portrait id={r.id} alt="" className={`portrait frame-${def.rarity}`} />
                <span className="ten-name">{displayName(r.id)}</span>
                <span className="num">{t('rarity', { n: def.rarity })}</span>
                <span className="ten-meta">
                  {r.wasted ? t('tenWasted') : r.isNew ? t('tenNew') : t('tenDup', { n: r.stars })}
                  {r.forced ? ` · ${t('tenForced')}` : ''}
                </span>
              </li>
            );
          })}
        </ol>
        <p className="num pity-result">{pityText(pity)}</p>
        <button type="button" className="btn btn-primary" onClick={close} autoFocus>
          {t('continue')}
        </button>
      </div>
    </Modal>
  );
}

export function Partners({ store }: { store: Store }) {
  const drawBtn = useRef<HTMLButtonElement>(null);
  const drawTenBtn = useRef<HTMLButtonElement>(null);
  const lastPull = useStore(store, (s) => s.game?.gacha.last ?? null);
  const [resume, setResume] = useState(() =>
    revealPending(store.getState().game, store.getState().game?.gacha.last ?? null),
  );
  // R-P43-3: a reload during a ×10 grid shows the grid again only if the marker is valid.
  const [resumeTen] = useState(() => (resume ? readTenMarker(store.getState().game) : null));
  const pity = useStore(store, (s) => s.game?.gacha.pity ?? 0);
  const tickets = useStore(store, (s) => s.game?.tickets ?? 0);
  const owned = useStore(store, (s) => Object.keys(s.game?.gacha.stars ?? {}).length);
  const readonly = useStore(store, (s) => s.status !== 'ready');
  const [rates, setRates] = useState(false);
  const [reveal, setReveal] = useState<LastPull | null>(null);
  const [ten, setTen] = useState<readonly LastPull[] | null>(null);
  const [profile, setProfile] = useState<AssociateDef | null>(null);
  const profileStars = useStore(store, (st) =>
    profile ? (st.game?.gacha.stars[profile.id] ?? 0) : 0,
  );
  const [busy, setBusy] = useState(false);
  // R-P43-7: one synchronous lock shared by ×1 and ×10, held from the activation until the
  // reveal closes (a double click, double tap or held Enter starts one draw only).
  const lock = useRef(false);
  const blocked = readonly || busy || reveal !== null || ten !== null;
  const disabled = tickets < 1 || blocked;
  const disabledTen = tickets < TEN || blocked;
  const failed = (reason: 'no-ticket' | 'write-failed') => {
    if (reason === 'write-failed') store.getState().announce(t('writeFailed'));
    else if (store.getState().status === 'readonly') store.getState().announce(t('readonlyBanner'));
  };
  const onDraw = async () => {
    if (disabled || lock.current) return;
    lock.current = true;
    setBusy(true);
    const r = await store.getState().pull(); // awaited write BEFORE the reveal (RES-2)
    setBusy(false);
    if (r.ok) setReveal(r.last);
    else {
      lock.current = false;
      failed(r.reason);
    }
  };
  const onDrawTen = async () => {
    if (disabledTen || lock.current) return;
    lock.current = true;
    setBusy(true);
    const r = await store.getState().pullTen(); // one IndexedDB write for the ten draws
    setBusy(false);
    if (r.ok) {
      const g = store.getState().game;
      if (g) writeTenMarker(g, r.results); // only after the write succeeded (R-P43-3)
      setTen(r.results);
    } else {
      lock.current = false;
      failed(r.reason);
    }
  };
  const release = () => {
    lock.current = false;
  };
  return (
    <section aria-labelledby="partners-title">
      <h1 id="partners-title" className="screen-title" tabIndex={-1}>
        {t('partnersTitle')}
      </h1>
      <div className="pity card">
        <p className="pity-main num">{pityText(pity)}</p>
        <progress
          id="pity-bar"
          max={PITY_LIMIT}
          value={pity}
          aria-label={t('pityCount', { n: pity })}
        />
        <p className="meta num">{t('pityCount', { n: pity })}</p>
        {lastPull && <p className="meta">{t('lastPull', { result: resultText(lastPull) })}</p>}
      </div>
      <div className="draw-row">
        <button
          ref={drawBtn}
          type="button"
          className="btn btn-primary draw"
          aria-disabled={disabled}
          onClick={() => void onDraw()}
        >
          {t('draw')}
        </button>
        <button
          ref={drawTenBtn}
          type="button"
          className="btn btn-secondary draw-ten"
          aria-disabled={disabledTen}
          aria-describedby={tickets < TEN ? 'ten-need' : undefined}
          onClick={() => void onDrawTen()}
        >
          {t('drawTen')}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setRates(true)}>
          {t('ratesLink')}
        </button>
      </div>
      {tickets < 1 && <p className="muted">{t('noTicket')}</p>}
      {tickets < TEN && (
        <p className="muted" id="ten-need">
          {t('tenNeed', { n: tickets })}
        </p>
      )}
      <h2 className="sub">{t('collection', { a: owned, b: ASSOCIATES.length })}</h2>
      <ul className="grid">
        {ASSOCIATES.map((a) => (
          <PartnerCard key={a.id} store={store} a={a} onProfile={setProfile} />
        ))}
      </ul>
      <Rates open={rates} onClose={() => setRates(false)} />
      {profile && profileStars > 0 && (
        <PartnerBio a={profile} starsNow={profileStars} onClose={() => setProfile(null)} />
      )}
      {reveal && (
        <Reveal
          store={store}
          last={reveal}
          onDone={() => {
            setReveal(null);
            release();
            drawBtn.current?.focus(); // DEF-GS-09
          }}
        />
      )}
      {ten && (
        <TenReveal
          store={store}
          results={ten}
          onDone={() => {
            setTen(null);
            release();
            // After the dialog unmount has handed focus back to its opener.
            setTimeout(() => drawTenBtn.current?.focus(), 0);
          }}
        />
      )}
      {!reveal && !ten && resume && resumeTen && (
        <TenReveal
          store={store}
          results={resumeTen}
          resumed
          onDone={() => {
            setResume(false);
            setTimeout(() => drawTenBtn.current?.focus(), 0);
          }}
        />
      )}
      {!reveal && !ten && resume && !resumeTen && lastPull && (
        <Reveal
          store={store}
          last={lastPull}
          resumed
          onDone={() => {
            setResume(false);
            // DEF-GS-10: the ref is now attached; focus after the dialog unmount has handed
            // focus back to its opener (body after a reload), hence the next task.
            setTimeout(() => drawBtn.current?.focus(), 0);
          }}
        />
      )}
    </section>
  );
}
