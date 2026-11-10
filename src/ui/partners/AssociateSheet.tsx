import { useId, useRef } from 'react';
import {
  MAX_STARS,
  type AssociateDef,
  type AssociateId,
  type BonusTarget,
} from '../../data/balance';
import { ASSOCIATE_PROFILES } from '../../data/associateProfiles';
import { BIOS } from '../../data/bios';
import {
  associatePercent,
  drawChancePercent,
  type AppelEntry,
  type AppelStatus,
} from '../../core/appel';
import { formatPercent } from '../format';
import { t } from '../../i18n/fr';
import { Modal, Portrait } from '../common';

/**
 * Isolated associate sheet (Associés v11 core). Props-only: not wired to the store, save,
 * idle, Travailler or routes. FR bios/profiles shown in every locale (EN/ES not validated).
 */
export interface AssociateSheetProps {
  a: AssociateDef;
  /** 0 = not owned. */
  starsNow: number;
  /** Player level on the associate's target (0 triggers the call confirm). */
  targetLevel: number;
  appel: AppelStatus;
  /** Remaining ms for the active or cooling state (0 otherwise). */
  remainingMs: number;
  /** Optional clocks + entry so « bonus actuel » uses associatePercent (DEF-GS-33). */
  now?: number;
  wallNow?: number;
  entry?: AppelEntry;
  onClose: () => void;
  /** Optional: parent handles confirmation for targetLevel === 0. */
  onCall?: () => void;
}

function targetLabel(target: BonusTarget): string {
  if (target === 'all') return t('targetall');
  return t(`target${target}` as 'targetsave');
}

function formatRemain(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h} h ${m} min`;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function displayName(id: AssociateId): string {
  return id.charAt(0).toUpperCase() + id.slice(1);
}

export function AssociateSheet({
  a,
  starsNow,
  targetLevel,
  appel,
  remainingMs,
  now = 0,
  wallNow = 0,
  entry,
  onClose,
  onCall,
}: AssociateSheetProps) {
  const owned = starsNow > 0;
  const profile = ASSOCIATE_PROFILES[a.id];
  const bio = BIOS[a.id];
  const titleId = useId();
  const liveRef = useRef<HTMLParagraphElement>(null);
  const targetForBonus: Exclude<BonusTarget, 'all'> = a.target === 'all' ? 'save' : a.target;
  // Single source: same associatePercent the economy uses (call ×2 when active).
  const activePct = associatePercent(a.id, starsNow, targetForBonus, entry, now, wallNow);
  const condition =
    a.target === 'all'
      ? t('sheetCondAll')
      : t('sheetCondTarget', { target: targetLabel(a.target), level: targetLevel });

  const callLabel = (() => {
    switch (appel) {
      case 'locked':
        return t('appelLocked', { name: displayName(a.id) });
      case 'active':
        return t('appelActive', { t: formatRemain(remainingMs) });
      case 'cooling':
        return t('appelCool', { t: formatRemain(remainingMs) });
      default:
        return t('appelAvailable', { name: displayName(a.id) });
    }
  })();

  function requestCall() {
    if (appel !== 'available' || !onCall) return;
    if (targetLevel === 0 && a.target !== 'all') {
      const ok = window.confirm(t('appelConfirmZero', { target: targetLabel(a.target) }));
      if (!ok) return;
    }
    onCall();
    if (liveRef.current)
      liveRef.current.textContent = t('appelStarted', { name: displayName(a.id) });
  }

  return (
    <Modal open onClose={onClose} labelId={titleId} initialFocusId={titleId}>
      <article className={`assoc-sheet r${a.rarity}${owned ? '' : ' lock'}`}>
        <button type="button" className="assoc-sheet-back btn btn-ghost" onClick={onClose}>
          {t('sheetBack')}
        </button>
        <h2 id={titleId} tabIndex={-1} className="assoc-sheet-title">
          {displayName(a.id)}
        </h2>
        <Portrait
          id={a.id}
          alt=""
          className={`portrait frame-${a.rarity}${owned ? '' : ' gray'}`}
        />
        <p className="assoc-sheet-meta">
          <span aria-hidden="true">{'★'.repeat(a.rarity)}</span>
          <span className="visually-hidden">{t('rarity', { n: a.rarity })}</span>
          {' · '}
          {profile.metier}
          {' · '}
          {owned ? t('sheetOwned') : t('locked')}
        </p>

        <section className="assoc-sheet-apport" aria-labelledby={`${titleId}-apport`}>
          <h3 id={`${titleId}-apport`}>{t('sheetApport')}</h3>
          <ul>
            <li>
              {t('sheetPerStar', {
                p: formatPercent(a.percentPerStar),
                target: targetLabel(a.target),
              })}
            </li>
            <li>
              {owned
                ? t('bonusNow', { p: formatPercent(activePct), target: targetLabel(a.target) })
                : t('sheetNoActive')}
            </li>
            <li>{condition}</li>
            <li>
              {t('sheetTable')}{' '}
              {Array.from({ length: MAX_STARS }, (_, i) => {
                const n = i + 1;
                return `${n}★ +${formatPercent(a.percentPerStar * n)} %`;
              }).join(' · ')}
            </li>
            <li>{t('sheetChance', { p: formatPercent(drawChancePercent(a.id)) })}</li>
            <li>{t('sheetPower')}</li>
          </ul>
        </section>

        {bio && (
          <section className="assoc-sheet-bio" aria-labelledby={`${titleId}-bio`}>
            <h3 id={`${titleId}-bio`}>{t('sheetBio')}</h3>
            <p>{bio}</p>
            <blockquote>« {profile.citation} »</blockquote>
            <p className="assoc-sheet-apprend">{t('sheetLearn', { s: profile.apprend })}</p>
          </section>
        )}

        <p ref={liveRef} className="visually-hidden" aria-live="polite" />

        <button
          type="button"
          className={`btn ${appel === 'available' ? 'btn-primary' : 'btn-ghost'}`}
          disabled={appel !== 'available'}
          aria-disabled={appel !== 'available'}
          onClick={requestCall}
        >
          {callLabel}
        </button>
      </article>
    </Modal>
  );
}
