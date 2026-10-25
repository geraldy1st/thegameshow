/** French UI strings (lot 1). EN/ES dictionaries share this type and arrive in a later lot. */
export const fr = {
  appTitle: 'The Gameshow',
  loading: 'Chargement de la partie…',
  yen: 'Yens',
  tickets: 'Tickets',
  ticketsValue: '{n} tickets',
  playTitle: 'Jouer',
  clickAoi: 'Travailler avec Aoi',
  clickHint: '+{n} ¥ par clic',
  incomePerSecond: '{n} ¥/s en revenus passifs',
  investTitle: 'Investir',
  level: 'Niveau {n}',
  perSecond: '+{n} ¥/s par niveau',
  buy: 'Acheter {n} ¥',
  buyLabel: 'Acheter un niveau de {name} pour {n} yens',
  notEnough: 'Pas assez de yens',
  bought: '{name} : niveau {n}',
  save: 'Épargne',
  saveTip: 'Sans risque : un petit revenu régulier qui s’additionne.',
  stock: 'Actions',
  stockTip:
    'Risque : la valeur des actions monte et descend. Rapporte plus sur la durée, sans garantie.',
  estate: 'Immobilier',
  estateTip: 'Cher au départ, mais revenu stable et élevé ensuite.',
  welcomeTitle: 'Bon retour !',
  welcomeBody: 'Pendant ton absence ({t}), tes investissements ont rapporté :',
  welcomeCap: 'Les gains hors ligne sont plafonnés à 8 h.',
  collect: 'Récupérer',
  collected: '+{n} ¥ récupérés',
  menuTitle: 'Sauvegarde',
  exportSave: 'Exporter la sauvegarde',
  importSave: 'Importer une sauvegarde',
  importConfirm:
    'Remplacer ta partie actuelle par ce fichier ? Une copie de ta partie actuelle est gardée.',
  importDone: 'Sauvegarde importée.',
  importFailed: 'Fichier refusé : {reason}',
  exportDone: 'Sauvegarde exportée.',
  checksumNote: 'Le contrôle détecte un fichier abîmé, pas une modification volontaire.',
  reset: 'Nouvelle partie',
  resetTitle: 'Recommencer de zéro ?',
  resetBody:
    'Ta progression (yens, tickets, investissements) sera effacée. Rien n’est conservé, sauf si tu exportes d’abord ta sauvegarde.',
  resetConfirm: 'Oui, recommencer',
  cancel: 'Annuler',
  readonlyBanner: 'Le jeu est ouvert dans un autre onglet. Recharge cette page pour continuer ici.',
  recoveryTitle: 'Sauvegarde illisible',
  recoveryBody:
    'Ta sauvegarde n’a pas pu être lue. Tu peux importer un fichier exporté, ou commencer une nouvelle partie.',
  recoveryNew: 'Commencer une nouvelle partie',
  recoveryConfirmTitle: 'Commencer une nouvelle partie ?',
  recoveryConfirmBody: 'La partie illisible sera remplacée. Tu perdras dans le jeu :',
  recoveryLossYen: 'tes yens',
  recoveryLossTickets: 'tes tickets',
  recoveryLossInvestments: 'tes investissements et leurs niveaux',
  recoveryLossProgress: 'ta progression et tes statistiques',
  recoveryKeepNote:
    'Une copie brute de la sauvegarde illisible est conservée sur cet appareil. Tu peux aussi la télécharger avant de continuer.',
  recoveryDownload: 'Télécharger la sauvegarde illisible',
  recoveryDownloaded: 'Copie de la sauvegarde illisible téléchargée.',
  recoveryConfirm: 'Oui, commencer une nouvelle partie',
  noPurchase: 'Aucun achat possible : tout se gagne en jouant.',
} as const;

export type Messages = { readonly [K in keyof typeof fr]: string };
export type MessageKey = keyof typeof fr;

export function t(key: MessageKey, vars: Record<string, string | number> = {}): string {
  return fr[key].replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));
}
