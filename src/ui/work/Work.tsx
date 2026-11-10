import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore, type StoreApi } from 'zustand';
import { BALANCE } from '../../data/balance';
import { boostMult, cursorAt, secondsLeft } from '../../core/boost';
import { clickValuePoints } from '../../core/work';
import { t } from '../../i18n/fr';
import type { GameStoreState } from '../../store/gameStore';
import { centsToYen } from '../../core/numbers';
import { formatYen } from '../format';
import { AoiVideo, type AoiState } from './AoiVideo';
import { boostStore, resetBoost, setVisible, takeJoy, tick, touch } from './boostStore';
import { FloatingPoints, type FloatingHandle } from './FloatingPoints';
import { onMediaOverride, readMediaEnv, shouldUseStill } from './media';

type Store = StoreApi<GameStoreState>;

function useStill(store: Store): boolean {
  const setting = useStore(store, (s) => s.game?.settings.reducedMotion ?? 'auto');
  const [still, setStill] = useState(() => shouldUseStill(readMediaEnv(setting)));
  useEffect(() => {
    const update = () => setStill(shouldUseStill(readMediaEnv(setting)));
    update();
    const mq =
      typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    mq?.addEventListener('change', update);
    const off = onMediaOverride(update);
    return () => {
      mq?.removeEventListener('change', update);
      off();
    };
  }, [setting]);
  return still;
}

/**
 * Travailler (#work, lot 4): Aoi writes, each accepted tap on the document gives points;
 * 100 pts = 10 ¥ (+1 Créativité); the power boost doubles points for 5 s. Every gain is
 * decided in core/ from the game clock at the event; timers here only redraw.
 */
export function Work({ store }: { store: Store }) {
  const game = useStore(store, (s) => s.game);
  const readonly = useStore(store, (s) => s.status !== 'ready');
  const boost = useStore(boostStore, (s) => s.boost);
  const still = useStill(store);
  const [now, setNow] = useState(() => store.getState().now());
  const [joyUntil, setJoyUntil] = useState(0);
  const fx = useRef<FloatingHandle>(null);
  const cursorEl = useRef<HTMLSpanElement>(null);
  const lastNoEnergy = useRef(-Infinity);
  const lastPointsLive = useRef(-Infinity);
  const announce = useCallback((m: string) => store.getState().announce(m), [store]);

  const joy = useCallback(() => {
    const n = store.getState().now();
    // A trigger during a running joy does not restart it (OD-6).
    setJoyUntil((u) => (n < u ? u : n + BALANCE.work.joyMs));
  }, [store]);

  // Entry: fresh boost machine (§4.2), ready mark for the budget measure.
  useEffect(() => {
    resetBoost(store.getState().now());
    setVisible(document.visibilityState === 'visible');
    if (!performance.getEntriesByName('tgs:work-ready').length) performance.mark('tgs:work-ready');
  }, [store]);

  // Announcements on boost transitions (one polite live region, no per-tap announcement).
  useEffect(
    () =>
      boostStore.subscribe((s, prev) => {
        const a = prev.boost.phase;
        const b = s.boost.phase;
        if (a === b) return;
        if (b === 'shown') announce(t('boostReady'));
        else if (b === 'active') announce(t('boostHitLive'));
        else if (a === 'active') {
          announce(t('boostEnded'));
          if (takeJoy()) joy();
        }
      }),
    [announce, joy],
  );

  // Redraw loop: boost transitions at the game clock, countdown and cursor (display only).
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const n = store.getState().now();
      tick(n);
      setNow(n);
      const s = boostStore.getState();
      if (cursorEl.current && s.boost.phase === 'shown') {
        const p = still ? BALANCE.boost.reducedCursor : (s.cursor ?? cursorAt(s.boost, n));
        cursorEl.current.style.left = `${p * 100}%`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const onVis = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [store, still]);

  const write = (x: number, y: number) => {
    const st = store.getState();
    const n = st.now();
    tick(n);
    const out = st.tap(boostMult(boostStore.getState().boost, n));
    if (!out.accepted) {
      if (out.reason === 'energy' && n - lastNoEnergy.current >= BALANCE.work.noEnergyMessageMs) {
        lastNoEnergy.current = n;
        announce(t('workNoEnergy'));
      }
      return;
    }
    fx.current?.spawn(`+${formatYen(out.gained)} pts`, x, y);
    if (out.levelUp) announce(t('workLevelUp', { n: st.game?.profile.level ?? 1 }));
    else if (n - lastPointsLive.current >= BALANCE.fx.announceEveryMs) {
      lastPointsLive.current = n;
      announce(t('workPointsLive', { n: formatYen(st.game?.work.points ?? 0) }));
    }
    if (out.milestone) joy();
  };
  const aoiRef = useRef<HTMLButtonElement>(null);
  const centre = () => {
    const d = aoiRef.current;
    return d ? { x: d.offsetLeft + d.offsetWidth / 2, y: d.offsetTop + 30 } : { x: 0, y: 0 };
  };
  /** Time of the last pointerdown: the click that follows it is the same gesture (R-P42-2). */
  const lastPointer = useRef(-Infinity);

  /**
   * One gesture on Aoi (patch 0.4.2, 3d and 3e): write first, at the multiplier in force
   * before the gesture (D4: the triggering tap is paid x1), then try the boost while the
   * gauge is shown (D3). A refused tap (rate or energy) writes nothing but may still catch
   * the boost (D5). Outside the zone nothing happens: no miss, no announcement (R-P42-1).
   */
  const gesture = (x: number, y: number) => {
    const n = store.getState().now();
    write(x, y);
    tick(n);
    if (boostStore.getState().boost.phase === 'shown')
      touch(n, still ? BALANCE.boost.reducedCursor : undefined);
  };

  const convert = async () => {
    if ((store.getState().game?.work.points ?? 0) < BALANCE.work.pointsPerConversion) {
      announce(t('workConvertMin'));
      return;
    }
    const yen = await store.getState().convertPoints();
    if (yen > 0) {
      const balance = centsToYen(store.getState().game?.yenCents ?? 0);
      announce(t('workConverted', { n: formatYen(yen), s: formatYen(balance) }));
      joy();
    }
  };

  if (!game) return null;
  const { work, energy } = game;
  const max = BALANCE.energy.max;
  const value = clickValuePoints(game);
  const aoi: AoiState =
    now < joyUntil ? 'joy' : energy.value < max * BALANCE.work.thinkBelowRatio ? 'think' : 'work';
  const left = secondsLeft(boost, now);
  const active = boost.phase === 'active' && left > 0;

  return (
    <section
      className={`work ${active ? 'boosted' : ''}`}
      aria-labelledby="work-title"
      data-boost-phase={boost.phase}
      data-aoi-state={aoi}
      data-still={still ? 'true' : 'false'}
    >
      <AoiVideo state={aoi} still={still} />
      <h1 id="work-title" className="visually-hidden screen-title" tabIndex={-1}>
        {t('workTitle')}
      </h1>
      <div
        className="energy work-e"
        role="progressbar"
        aria-label={t('energyLabel')}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={energy.value}
        aria-valuetext={`${energy.value} sur ${max}`}
      >
        <i style={{ transform: `scaleX(${Math.min(1, energy.value / max)})` }} />
        <span className="num" aria-hidden="true">
          {t('energyText', { a: energy.value, b: max })}
        </span>
      </div>
      <p className="ws-label">
        {t(aoi === 'joy' ? 'workStateJoy' : aoi === 'think' ? 'workStateThink' : 'workStateWork')}
      </p>
      <button
        ref={aoiRef}
        type="button"
        className="aoi-hit"
        aria-disabled={readonly}
        aria-describedby={boost.phase === 'shown' ? 'boost-desc' : undefined}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse' && e.button !== 0) return;
          lastPointer.current = performance.now();
          const box = e.currentTarget.parentElement!.getBoundingClientRect();
          gesture(e.clientX - box.left, e.clientY - box.top - 20);
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault(); // no synthetic click
          if (e.repeat) return;
          const c = centre();
          gesture(c.x, c.y);
        }}
        onClick={(e) => {
          // A pointer already counted on pointerdown (detail ≥ 1, or a late click right after
          // it on touch screens). detail 0 without a recent pointerdown = assistive tech.
          if (e.detail !== 0 || performance.now() - lastPointer.current < 1000) return;
          const c = centre();
          gesture(c.x, c.y);
        }}
      >
        {/* Name from content (no aria-label: WCAG 2.5.3). */}
        <span className="visually-hidden">{t('workDocLabel', { n: value })}</span>
      </button>
      <span id="boost-desc" className="visually-hidden">
        {t('boostDesc')}
      </span>
      {boost.phase === 'shown' && (
        <div className={`boost ${still ? 'still' : ''}`}>
          <div className="b-head">
            <b>{t('boostTitle')}</b>
            <span className="small">{t(still ? 'boostHintStill' : 'boostHint')}</span>
          </div>
          <div className="b-track" aria-hidden="true">
            <span className="b-zone" />
            <span className="b-cur" ref={cursorEl} style={{ left: '50%' }} />
          </div>
        </div>
      )}
      {active && (
        <p className="b-on num">
          <b>{t('boostHit')}</b> <span>{t('boostLeft', { n: left })}</span>
        </p>
      )}
      <FloatingPoints ref={fx} />
      <div className="work-panel card">
        <p className="pts">
          <span className="small">{t('workPoints')}</span>
          <b className="num">{formatYen(work.points)}</b>
        </p>
        <p className="small rate-l">{t('workRate')}</p>
        <button
          type="button"
          className="btn btn-primary"
          disabled={readonly}
          onClick={() => void convert()}
        >
          {t('workConvert')}
        </button>
      </div>
    </section>
  );
}
