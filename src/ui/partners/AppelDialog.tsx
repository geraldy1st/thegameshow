import { useEffect, useRef, useState } from 'react';
import type { AssociateDef } from '../../data/balance';
import { fillAppelReplique } from '../../data/appelRepliques';
import { t } from '../../i18n/fr';
import { Portrait } from '../common';
import { callBonusLabel, callDurationLabel } from '../format';
import { displayName, prefersReducedMotion } from '../helpers';

const WRITE_MS = 600;
const CLOSE_MS = 180;
const CLOSE_REDUCED_MS = 120;
/** Ignore a second gesture in a rapid double-tap so only one state step happens (R-052D-01). */
const GESTURE_LOCK_MS = 250;

type Phase = 'writing' | 'reading' | 'closing';

/**
 * Second native <dialog showModal> stacked over the associate sheet (R-052D-01).
 * Props-only: the boost is already written by the parent before this mounts.
 */
export function AppelDialog({
  a,
  returnFocusId,
  onClose,
}: {
  a: AssociateDef;
  returnFocusId: string;
  onClose: () => void;
}) {
  const reduced = useRef(prefersReducedMotion()).current;
  const [phase, setPhase] = useState<Phase>(reduced ? 'reading' : 'writing');
  const dialogRef = useRef<HTMLDialogElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const liveRef = useRef<HTMLParagraphElement>(null);
  const lockUntil = useRef(0);
  const closed = useRef(false);
  const immediateClose = useRef(false);
  const bonus = callBonusLabel(a.target);
  const duree = callDurationLabel(a.rarity);
  const name = displayName(a.id);
  const text = fillAppelReplique(a.id, name, bonus, duree);
  const chip = `⚡ ${bonus} · ${duree}`;
  const hint = t('appelHint');

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (!d.open) d.showModal();
    sheetRef.current?.focus();
    return () => {
      if (d.open) d.close();
    };
  }, []);

  useEffect(() => {
    if (phase !== 'writing') return;
    const id = window.setTimeout(() => stepTo('reading'), WRITE_MS);
    return () => window.clearTimeout(id);
  }, [phase]);

  // Live region is in the first paint empty, then filled via the DOM (R-052D-03).
  useEffect(() => {
    if (!liveRef.current || phase === 'closing') return;
    liveRef.current.textContent =
      phase === 'writing' ? t('appelWriting', { name }) : `${text} ${chip} ${hint}`;
  }, [phase, name, text, chip, hint]);

  function stepTo(next: Phase) {
    setPhase(next);
    lockUntil.current = performance.now() + GESTURE_LOCK_MS;
  }

  function wrapUp() {
    if (closed.current) return;
    closed.current = true;
    const d = dialogRef.current;
    if (d?.open) d.close();
    const el = document.getElementById(returnFocusId);
    if (el instanceof HTMLElement) el.focus();
    onClose();
  }

  /** Escape closes immediately (validated R-052D-01 exception). Pointer / Enter / Space
   *  keep the dialog in the top layer until the exit animation ends (DEF-GS-40). */
  function finishClose(immediate = false) {
    if (closed.current) return;
    immediateClose.current = immediate;
    if (immediate) {
      wrapUp();
      return;
    }
    // No-arg / delayed close must still enter the exit phase, so a mutant that
    // calls finishClose() after reading (D15) is observable and killed.
    if (phase !== 'closing') stepTo('closing');
  }

  useEffect(() => {
    if (phase !== 'closing' || immediateClose.current || closed.current) return;
    const d = dialogRef.current;
    const ms = reduced ? CLOSE_REDUCED_MS : CLOSE_MS;
    let cancelled = false;
    const fallback = window.setTimeout(() => {
      if (!cancelled) wrapUp();
    }, ms + 50);
    const raf = window.requestAnimationFrame(() => {
      const listed =
        d && typeof d.getAnimations === 'function' ? d.getAnimations({ subtree: true }) : [];
      const anims = listed.filter((a) => {
        const iters = a.effect?.getComputedTiming().iterations;
        return iters !== Infinity && a.playState !== 'finished' && a.playState !== 'idle';
      });
      if (anims.length === 0) return;
      void Promise.all(anims.map((a) => a.finished.catch(() => undefined))).then(() => {
        if (!cancelled) {
          window.clearTimeout(fallback);
          wrapUp();
        }
      });
    });
    return () => {
      cancelled = true;
      window.clearTimeout(fallback);
      window.cancelAnimationFrame(raf);
    };
    // wrapUp reads refs; reduced is fixed at mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function advance(from: 'pointer' | 'escape' | 'key') {
    if (closed.current) return;
    // Lock only pointer bursts (R-052D-01 double-tap). Rapid Escape/keys must still step (1, 2, 3).
    if (from === 'pointer' && performance.now() < lockUntil.current) return;
    if (phase === 'closing' && from === 'escape') {
      wrapUp();
      return;
    }
    if (phase === 'writing') stepTo('reading');
    else if (phase === 'reading') {
      stepTo('closing');
      finishClose(from === 'escape');
    }
  }

  function onCancel(e: { preventDefault(): void; stopPropagation(): void }) {
    e.preventDefault();
    e.stopPropagation();
    advance('escape');
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDialogElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      advance('key');
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className={`amsg${reduced ? ' rmx' : ''}${phase === 'closing' ? ' out' : ''}`}
      aria-labelledby="amsg-name"
      aria-describedby="amsg-bubble"
      aria-modal="true"
      onCancel={onCancel}
      onClick={() => advance('pointer')}
      onKeyDown={onKeyDown}
    >
      <div className="amsg-veil" />
      <div ref={sheetRef} className="amsg-sheet" tabIndex={-1}>
        <header className="amsg-head">
          <Portrait id={a.id} alt="" className="amsg-av" />
          <div className="amsg-who">
            <p id="amsg-name" className="amsg-name">
              {name}
            </p>
            <p className="amsg-meta">
              <span className="amsg-stars" aria-hidden="true">
                {'★'.repeat(a.rarity)}
              </span>
              <span className="visually-hidden">{t('rarity', { n: a.rarity })}</span>
            </p>
          </div>
        </header>
        <div className="amsg-thread">
          {phase === 'writing' && !reduced && (
            <div className="amsg-type" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          )}
          <p id="amsg-bubble" className="amsg-bubble" hidden={phase === 'writing'}>
            {phase === 'writing' ? '' : text}
          </p>
          {phase !== 'writing' && <p className="amsg-chip">{chip}</p>}
        </div>
        <p className="amsg-hint">{hint}</p>
        <p id="amsg-live" ref={liveRef} className="visually-hidden" aria-live="polite" />
      </div>
    </dialog>
  );
}
