/**
 * Kyoko-sensei daily quiz, FR only (lot 2). Content copied from GameFlow
 * (src/game/quizzes.ts and src/minigames/quiz/questions.ts, read-only source).
 */
export interface QuizQuestion {
  q: string;
  choices: readonly [string, string, string, string];
  answer: 0 | 1 | 2 | 3;
  why: string;
}

export const QUIZ: readonly QuizQuestion[] = [
  {
    q: 'Le cash-flow d’un mois, c’est…',
    choices: [
      'Revenus moins dépenses',
      'Seulement le salaire',
      'Le prix d’un rêve',
      'Ce qui reste le jour de paie',
    ],
    answer: 0,
    why: 'Le cash-flow est ce qui reste quand les dépenses du mois sont parties.',
  },
  {
    q: 'Un passif, c’est…',
    choices: [
      'Quelque chose qui sort de l’argent chaque mois',
      'N’importe quel objet',
      'Un ami qui t’aime bien',
      'Du cash à la banque',
    ],
    answer: 0,
    why: 'Un passif demande un paiement. Un actif te paie.',
  },
  {
    q: 'Si les dépenses dépassent les revenus…',
    choices: [
      'Le mois finit plus pauvre qu’il n’a commencé',
      'Tu es diversifié',
      'Le fisc t’offre un cadeau',
      'Le revenu passif a commencé',
    ],
    answer: 0,
    why: 'Plus de sorties que d’entrées, c’est un cash-flow négatif.',
  },
  {
    q: 'Un fonds d’urgence, c’est du cash gardé pour…',
    choices: [
      'Une facture que tu n’avais pas prévue',
      'La prochaine paire de baskets',
      'Le tuyau boursier d’un ami',
      'Décorer avant le loyer',
    ],
    answer: 0,
    why: 'Le fonds sert à la surprise, pas à l’envie.',
  },
  {
    q: 'Se payer en premier, c’est…',
    choices: [
      'Mettre l’épargne de côté avant les envies',
      'Demander au patron de payer plus tôt',
      'Sauter le loyer',
      'Emprunter pour que le mois ait l’air plein',
    ],
    answer: 0,
    why: 'L’épargne part d’abord. Les envies ont ce qui reste.',
  },
  {
    q: 'Un actif, c’est…',
    choices: [
      'Quelque chose qui met de l’argent dans ta poche',
      'N’importe quoi de cher',
      'Un salaire',
      'Un dîner que tu as aimé',
    ],
    answer: 0,
    why: 'Le prix n’est pas le test. L’argent qui entre, si.',
  },
  {
    q: 'Un apport, c’est…',
    choices: [
      'Le cash que tu avances avant le prêt',
      'La mensualité',
      'Un impôt',
      'Des intérêts que la banque a oubliés',
    ],
    answer: 0,
    why: 'L’apport est ton cash. La mensualité est celle de la banque.',
  },
  {
    q: 'Un revenu passif, c’est de l’argent qui…',
    choices: [
      'Arrive sans échanger une heure de plus de ton service',
      'Vient seulement d’un second emploi',
      'N’est jamais imposé',
      'Remplace toutes les dépenses le jour où tu achètes une chose',
    ],
    answer: 0,
    why: 'L’actif travaille. Tu n’as pas à pointer pour ce dollar.',
  },
  {
    q: 'Emprunter pour acheter un actif peut se tenir quand…',
    choices: [
      'L’actif rapporte plus que le prêt ne coûte',
      'La brochure est jolie',
      'Un ami dit de se dépêcher',
      'Tu n’as aucun cash-flow',
    ],
    answer: 0,
    why: 'Une bonne dette est une mensualité plus petite que ce que l’actif renvoie.',
  },
  {
    q: 'Vendre plus cher que tu n’as payé peut encore…',
    choices: [
      'Laisser un impôt sur le gain',
      'Être sans aucune conséquence',
      'Transformer l’actif en salaire',
      'Effacer l’apport de l’histoire',
    ],
    answer: 0,
    why: 'Un gain peut être imposé. Lis ça avant de fêter.',
  },
  {
    q: 'Diversifier, c’est…',
    choices: [
      'Ne pas jouer tout le mois sur un seul pari',
      'Acheter le plus cher',
      'Avoir une seule action parfaite',
      'Ignorer toutes les offres',
    ],
    answer: 0,
    why: 'Plusieurs petits paris survivent à un mauvais.',
  },
  {
    q: 'Le coût d’opportunité, c’est…',
    choices: [
      'Ce à quoi tu renonces en choisissant ceci plutôt que cela',
      'Le prix affiché',
      'Des frais de retard',
      'Un tuyau d’un ami',
    ],
    answer: 0,
    why: 'Chaque oui est un non à autre chose.',
  },
  {
    q: 'Les intérêts composés, c’est…',
    choices: [
      'Des rendements qui produisent eux-mêmes des rendements',
      'Dépenser l’augmentation la semaine où elle arrive',
      'Des frais que la banque cache',
      'Des intérêts que tu ne paies qu’une fois',
    ],
    answer: 0,
    why: 'Laisse le gain en place, et il se met aussi au travail.',
  },
  {
    q: 'Un rendement promis plus haut vient en général avec…',
    choices: [
      'Plus de risque de perdre l’argent',
      'Une garantie',
      'Des dépenses plus basses pour toujours',
      'Aucune raison de lire les clauses',
    ],
    answer: 0,
    why: 'Si le chiffre est excitant, demande ce qui peut mal tourner.',
  },
  {
    q: 'Quand un ami souffle une action ou une boutique, le geste sensé est…',
    choices: [
      'Lire les chiffres avant d’acheter',
      'Acheter avant la fin de la phrase',
      'Hypothéquer le loyer',
      'Ignorer tous les amis pour toujours',
    ],
    answer: 0,
    why: 'Un tuyau est une porte. Le livre doit encore être d’accord.',
  },
];
