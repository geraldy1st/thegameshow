import type { WorkMode } from '../core/types';

/** Texts that scroll in the document window (mockup, OD-T5: the 2 sentences of the mockup). */
export const WORK_TEXTS: Readonly<Record<WorkMode, string>> = {
  roman:
    'La pluie glissait sur les vitres de Shibuya. Aoi relut la première phrase de son roman et sourit : cette fois, l’histoire tenait debout. ',
  presse:
    'ÉCONOMIE — Les jeunes Tokyoïtes épargnent davantage : selon une étude récente, un sur deux met de côté chaque mois une part de son salaire. ',
};

/** Characters revealed per accepted tap (mockup). */
export const WORK_CURSOR_STEP = 6;
/** The cursor wraps at 3 × the longest text (mockup `wpos % length*3`, bounded). */
export const WORK_CURSOR_MAX = 3 * Math.max(WORK_TEXTS.roman.length, WORK_TEXTS.presse.length) - 1;
