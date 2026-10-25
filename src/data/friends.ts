import type { FriendId } from './balance';

/** Scene 1 dialogue of each friend (mockup /workspace/gacha-mockups/proto/main.js, FR). */
export const SCENE1: Readonly<Record<FriendId, readonly string[]>> = {
  ren: [
    'Aoi ! Je t’ai gardé une place au café.',
    'J’ai enfin ouvert mon livret d’épargne. Petit à petit, mais tous les mois.',
    'Si tu veux, on fait le point sur nos budgets ensemble ce week-end ?',
  ],
  mio: [
    'Regarde cette vitrine… mais je me suis promis d’attendre 48 h avant tout achat.',
    'Souvent, après deux jours, je n’en ai même plus envie !',
    'Viens, on va plutôt se balader à Harajuku, c’est gratuit.',
  ],
  sora: [
    'J’ai lu un truc sur les intérêts composés, c’est fou.',
    'Plus tu commences tôt, plus le temps travaille pour toi.',
    'Le meilleur moment pour commencer, c’était hier. Le deuxième, c’est aujourd’hui !',
  ],
};
