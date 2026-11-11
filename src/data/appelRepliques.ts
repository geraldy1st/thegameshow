import type { AssociateId } from './balance';

/**
 * R-052D-06: Kei's line is isolated so a later editorial swap is a one-line change.
 * Mirage updated the wording (11/11/2026) to drop the ambiguous « Une heure de travail »
 * (Kei is 1★, so the call lasts 30 min). Validated by Geraldy (via Mirage, 11/11/2026);
 * the text is unchanged.
 */
export const KEI_APPEL_REPLIQUE =
  "Tu as bien fait de m'appeler, Aoi ! Chaque effort au travail se compte aussi : {bonus} pendant {durée}.";

/** Source of truth: associes-bios/appel-dialogue/repliques-appel.json (Mirage, 11/11/2026). */
export const APPEL_REPLIQUE_TEMPLATES: Record<AssociateId, string> = {
  haru: "Merci de m'avoir appelé, Aoi ! Un peu de côté chaque mois, ça finit par compter : {bonus} pendant {durée}.",
  kei: KEI_APPEL_REPLIQUE,
  lila: "Merci pour l'appel, Aoi ! Si tu ne peux pas l'expliquer, n'achète pas. Je reste avec toi : {bonus} pendant {durée}.",
  nana: "Merci de m'avoir appelée, Aoi ! Un logement se juge sur des années, frais compris. Je suis là : {bonus} pendant {durée}.",
  noa: "Merci d'avoir pensé à moi, Aoi. Les rumeurs vont vite, les comptes vont juste : {bonus} pendant {durée}.",
  yuu: "Merci de m'avoir appelé, Aoi ! Un bol vendu à perte reste un bol perdu. On vise juste : {bonus} pendant {durée} !",
  daichi:
    "Merci d'avoir appelé, Aoi. Mesure deux fois avant d'acheter. Je reste dans le coin : {bonus} pendant {durée}.",
  jun: "Merci de m'avoir appelé, Aoi. Un seul chiffre ne raconte jamais toute l'histoire, regarde le budget entier : {bonus} pendant {durée}.",
  omar: "Merci de m'avoir appelé, Aoi ! Un objectif sans date, c'est juste un souhait. On découpe le plan : {bonus} pendant {durée}.",
};

/** R-052D-05: colon, not an exclamation mark, so `{bonus}` does not follow « ! ». */
export const APPEL_REPLIQUE_FALLBACK = "{Nom} arrive pour t'aider : {bonus} pendant {durée}.";

export function fillAppelReplique(id: string, name: string, bonus: string, duree: string): string {
  const template =
    id in APPEL_REPLIQUE_TEMPLATES
      ? APPEL_REPLIQUE_TEMPLATES[id as AssociateId]
      : APPEL_REPLIQUE_FALLBACK.replaceAll('{Nom}', name);
  return template.replaceAll('{bonus}', bonus).replaceAll('{durée}', duree);
}
