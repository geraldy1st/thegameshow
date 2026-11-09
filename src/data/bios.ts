import type { AssociateId } from './balance';

/**
 * Partner biographies (Associés v11). Copied exactly from the Geraldy-approved FR source
 * in docs/BIOS-SOURCE.md (associes-bios/bios-proposees.json, 2026-11-09). No invented text.
 * EN/ES are not validated: callers show these FR strings in every locale.
 */
export const BIOS: Readonly<Partial<Record<AssociateId, string>>> = {
  haru: "Haru tient un petit carnet où chaque yen a sa ligne. Ancien livreur, il a appris à mettre un peu de côté à chaque paie plutôt que d'attendre un gros coup de chance. Calme et patient, il aime montrer qu'une épargne régulière, même modeste, finit par compter. Son envie : que plus personne n'ait peur d'ouvrir ses relevés.",
  kei: 'Kei gère une supérette ouverte tard et connaît le prix de chaque article par cœur. Directe, un brin taquine, elle compte vite et juste. Pour elle, chaque geste du quotidien a une valeur : un rayon bien rangé, une erreur de caisse évitée, un client qui revient. Elle montre comment mesurer ce que rapporte vraiment une heure de travail.',
  lila: "Lila joue de la basse le soir et lit des rapports annuels le matin. Curieuse, elle veut comprendre ce que fait une entreprise avant d'en acheter une part. Elle rappelle qu'une action peut monter puis baisser, et qu'il vaut mieux répartir que tout miser au même endroit. Sa règle : ne jamais investir dans ce qu'elle ne sait pas expliquer.",
  nana: "Nana fait visiter des appartements toute la semaine. Douce mais exigeante, elle vérifie tout : charges, travaux, isolation, état du toit. Elle sait qu'un logement coûte cher au départ, puis demande entretien et patience. Ce qu'elle veut transmettre : un bien se juge sur des années, pas sur une seule visite, et chaque frais caché doit entrer dans le calcul.",
  noa: "Noa passe ses journées entre graphiques et carnets de notes. Réservée et méthodique, elle compare les entreprises sur leurs comptes plutôt que sur les rumeurs. Elle a déjà vu des cours chuter et sait garder son sang-froid. Elle insiste sur la diversification, le long terme, et rappelle que les gains passés ne garantissent pas l'avenir.",
  yuu: "Yuu tient un stand de ramen qui ne désemplit pas. Rieur et énergique, il improvise beaucoup mais note tout : ingrédients, temps de préparation, ventes du jour. Il a compris que travailler plus vite ne sert à rien si chaque bol coûte plus qu'il ne rapporte. Avec bonne humeur, il relie effort, prix de vente et marge.",
  daichi:
    'Daichi rénove de vieilles maisons en bois depuis trente ans. Peu bavard, il préfère mesurer deux fois avant de couper. Il a vu des voisins acheter trop vite puis regretter le prix des travaux. Sa leçon : un bien durable se prépare avec un budget réaliste, une réserve pour les imprévus et du temps. Il transmet son savoir aux jeunes du quartier.',
  jun: "Jun enseigne les maths et tient les comptes d'une association de quartier. Curieux de tout, il réunit épargne, actions, immobilier et travail dans un même tableau. Avant chaque décision, il pose la même question : « et si ça tournait mal ? » Son objectif : t'aider à regarder ton budget en entier plutôt qu'un seul chiffre, et à choisir en connaissant les risques.",
  omar: "Omar a lancé un club où des étudiants partagent leurs objectifs : un vélo, un voyage, un premier loyer. Chaleureux et organisé, il découpe chaque objectif en petites étapes avec une date. Il conseille de constituer une réserve d'urgence avant tout le reste. Avec lui, épargner devient un projet concret qu'on choisit, pas une privation qu'on subit.",
};
