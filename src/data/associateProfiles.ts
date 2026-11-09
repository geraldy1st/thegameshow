import type { AssociateId } from './balance';

/** Non-balance profile text (Associés v11). Kept out of BALANCE so the snapshot hash stays intact. */
export interface AssociateProfile {
  readonly metier: string;
  readonly citation: string;
  readonly apprend: string;
}

export const ASSOCIATE_PROFILES: Readonly<Record<AssociateId, AssociateProfile>> = {
  haru: {
    metier: 'Conseiller budget dans une maison de quartier',
    citation: 'Petit, mais tous les mois.',
    apprend: 'Épargner régulièrement, suivre ses dépenses.',
  },
  kei: {
    metier: "Gérante d'une supérette ouverte tard",
    citation: 'Une heure, ça se compte aussi.',
    apprend: 'Relier temps de travail et revenu.',
  },
  lila: {
    metier: 'Bassiste et étudiante en gestion',
    citation: "Si je ne peux pas l'expliquer, je n'achète pas.",
    apprend: "Comprendre ce qu'est une action, diversifier.",
  },
  nana: {
    metier: 'Agente de location',
    citation: "Le loyer, c'est la partie qu'on voit.",
    apprend: "Coût total d'un logement, frais cachés.",
  },
  noa: {
    metier: 'Analyste dans une petite société de gestion',
    citation: 'Les rumeurs vont vite, les comptes vont juste.',
    apprend: 'Risque, long terme, performances passées.',
  },
  yuu: {
    metier: "Cuisinier d'un stand de ramen",
    citation: 'Un bol vendu à perte reste un bol perdu.',
    apprend: 'Prix, coût, marge.',
  },
  daichi: {
    metier: 'Charpentier, rénovation de maisons anciennes',
    citation: 'Mesure deux fois, achète une fois.',
    apprend: 'Budget travaux, réserve pour imprévus.',
  },
  jun: {
    metier: "Professeur de maths et trésorier d'association",
    citation: "Un seul chiffre ne raconte jamais toute l'histoire.",
    apprend: "Vue d'ensemble du budget, scénarios.",
  },
  omar: {
    metier: "Étudiant ingénieur, fondateur d'un club d'épargne",
    citation: "Un objectif sans date, c'est juste un souhait.",
    apprend: "Objectifs d'épargne, réserve d'urgence.",
  },
};
