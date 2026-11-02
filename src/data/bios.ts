import type { AssociateId } from './balance';

/**
 * Partner biographies (patch 0.4.3, P8, R-P43-11). Empty on purpose: no text is shown until
 * one is written, dated and « approuvé par Geraldy » in docs/BIOS-SOURCE.md. A unit test
 * checks that this object matches that file exactly.
 */
export const BIOS: Readonly<Partial<Record<AssociateId, string>>> = {};
