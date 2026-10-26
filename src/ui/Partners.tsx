import { useEffect, useRef, useState } from 'react';
import { useStore, type StoreApi } from 'zustand';
import {
  ASSOCIATES,
  PITY_LIMIT,
  RARITY_RATES,
  REVEAL_MS,
  REVEAL_REDUCED_MS,
  SKIP_HOLD_MS,
  type AssociateDef,
  type Rarity,
} from '../data/balance';
import { POOLS, effectiveThreeStarRate, pullsUntilGuarantee } from '../core/gacha';
import type { LastPull } from '../core/types';
import { t, type MessageKey } from '../i18n/fr';
import type { GameStoreState } from '../store/gameStore';
import { Modal, Portrait } from './common';
import { displayName, prefersReducedMotion } from './helpers';

type Store = StoreApi<GameStoreState>;

const pct = (x: number, digits = 1) =>
  new Intl.NumberFormat('fr-FR', { maximumFractionDigits: digits }).format(x * 100);
const stars = (n: number) => '★'.repeat(n);
const target = (a: AssociateDef) => t(`target${a.target}` as MessageKey);

function pityText(pity: number): string {
  const left = pullsUntilGuarantee(pity);
  return left === 1 ? t('pityNext') : t('pityLine', { n: left });
}

function Rates({ open, onClose }: { open: boolean; onClose: () => void }) {
  const eff = effectiveThreeStarRate();
  return (
    <Modal open={open} onClose={onClose} labelId="rates-title">
      <h2 id="rates-title">{t('ratesTitle')}</h2>
      <p className="rates-nobuy">{t('ratesNoPurchase')}</p>
      <table className="rates num">
        <caption>{t('ratesBase')}</caption>
        <tbody>
          {([1, 2, 3] as Rarity[]).map((r) => (
            <tr key={r}>
              <th scope="row">{t('rarity', { n: r })}</th>
              <td>{pct(RARITY_RATES[r], 0)} %</td>
              <td className="meta">
                {POOLS[r]
                  .map((a) =>
                    t('ratesEach', {
                      name: displayName(a.id),
                      p: pct(RARITY_RATES[r] / POOLS[r].length, 2),
                    }),
                  )
                  .join(' · ')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>{t('ratesRule', { p: pct(eff, 1) })}</p>
      <p>
        {t('ratesAverage', {
          n: new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(1 / eff),
        })}
      </p>
      <p className="meta">{t('ratesSplit')}</p>
      <p className="meta">{t('ratesDuplicate')}</p>
      <button type="button" className="btn btn-primary" onClick={onClose}>
        {t('close')}
      </button>
    </Modal>
  );
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
function Reveal({ store, last, onDone }: { store: Store; last: LastPull; onDone: () => void }) {
  const reduced = prefersReducedMotion();
  const [done, setDone] = useState(false);
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pity = useStore(store, (s) => s.game?.gacha.pity ?? 0);
  const def = ASSOCIATES.find((a) => a.id === last.id)!;
  useEffect(() => {
    const id = setTimeout(() => setDone(true), reduced ? REVEAL_REDUCED_MS : REVEAL_MS);
    return () => clearTimeout(id);
  }, [reduced]);
  useEffect(() => {
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

function PartnerCard({ store, a }: { store: Store; a: AssociateDef }) {
  const s = useStore(store, (st) => st.game?.gacha.stars[a.id] ?? 0);
  return (
    <li className={`card acard r${a.rarity} ${s ? '' : 'lock'}`}>
      <Portrait id={a.id} alt="" className="portrait" />
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

export function Partners({ store }: { store: Store }) {
  const drawBtn = useRef<HTMLButtonElement>(null);
  const pity = useStore(store, (s) => s.game?.gacha.pity ?? 0);
  const tickets = useStore(store, (s) => s.game?.tickets ?? 0);
  const owned = useStore(store, (s) => Object.keys(s.game?.gacha.stars ?? {}).length);
  const readonly = useStore(store, (s) => s.status !== 'ready');
  const [rates, setRates] = useState(false);
  const [reveal, setReveal] = useState<LastPull | null>(null);
  const [busy, setBusy] = useState(false);
  const disabled = tickets < 1 || readonly || busy;
  const onDraw = async () => {
    if (disabled) return;
    setBusy(true);
    const r = await store.getState().pull(); // awaited write BEFORE the reveal (RES-2)
    setBusy(false);
    if (r.ok) setReveal(r.last);
    else if (r.reason === 'write-failed') store.getState().announce(t('writeFailed'));
    else if (store.getState().status === 'readonly') store.getState().announce(t('readonlyBanner'));
  };
  return (
    <section aria-labelledby="partners-title">
      <h2 id="partners-title">{t('partnersTitle')}</h2>
      <div className="pity card">
        <p className="pity-main num">{pityText(pity)}</p>
        <progress
          id="pity-bar"
          max={PITY_LIMIT}
          value={pity}
          aria-label={t('pityCount', { n: pity })}
        />
        <p className="meta num">{t('pityCount', { n: pity })}</p>
      </div>
      <div className="draw-row">
        <button
          type="button"
          className="btn btn-primary draw"
          aria-disabled={disabled}
          onClick={() => void onDraw()}
        >
          {t('draw')}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setRates(true)}>
          {t('ratesLink')}
        </button>
      </div>
      {tickets < 1 && <p className="muted">{t('noTicket')}</p>}
      <h3 className="sub">{t('collection', { a: owned, b: ASSOCIATES.length })}</h3>
      <ul className="grid">
        {ASSOCIATES.map((a) => (
          <PartnerCard key={a.id} store={store} a={a} />
        ))}
      </ul>
      <Rates open={rates} onClose={() => setRates(false)} />
      {reveal && (
        <Reveal
          store={store}
          last={reveal}
          onDone={() => {
            setReveal(null);
            drawBtn.current?.focus(); // DEF-GS-09
          }}
        />
      )}
    </section>
  );
}
