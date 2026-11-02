import { RARITY_RATES, type Rarity } from '../data/balance';
import { POOLS, effectiveThreeStarRate } from '../core/gacha';
import { t } from '../i18n/fr';
import { Modal } from './common';
import { displayName } from './helpers';

const pct = (x: number, digits = 1) =>
  new Intl.NumberFormat('fr-FR', { maximumFractionDigits: digits }).format(x * 100);

/**
 * Draw rates (ethics rule 1). Patch 0.4.3 (P9): extracted from Partners.tsx without any change;
 * opened from #partners AND from Menu (Geraldy 02/11, option A).
 */
export function Rates({ open, onClose }: { open: boolean; onClose: () => void }) {
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
