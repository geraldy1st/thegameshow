import { describe, expect, it } from 'vitest';
import { ASSOCIATES, type AssociateId } from './balance';
import {
  APPEL_REPLIQUE_FALLBACK,
  APPEL_REPLIQUE_TEMPLATES,
  KEI_APPEL_REPLIQUE,
  fillAppelReplique,
} from './appelRepliques';
import { callBonusLabel, callDurationLabel } from '../ui/format';

const FINAL: Record<AssociateId, string> = {
  haru: "Merci de m'avoir appelé, Aoi ! Un peu de côté chaque mois, ça finit par compter : bonus Épargne ×2 pendant 30 min.",
  kei: "Tu as bien fait de m'appeler, Aoi ! Chaque effort au travail se compte aussi : bonus Clic ×2 pendant 30 min.",
  lila: "Merci pour l'appel, Aoi ! Si tu ne peux pas l'expliquer, n'achète pas. Je reste avec toi : bonus Actions ×2 pendant 30 min.",
  nana: "Merci de m'avoir appelée, Aoi ! Un logement se juge sur des années, frais compris. Je suis là : bonus Immobilier ×2 pendant 30 min.",
  noa: "Merci d'avoir pensé à moi, Aoi. Les rumeurs vont vite, les comptes vont juste : bonus Actions ×2 pendant 30 min.",
  yuu: "Merci de m'avoir appelé, Aoi ! Un bol vendu à perte reste un bol perdu. On vise juste : bonus Clic ×2 pendant 30 min !",
  daichi:
    "Merci d'avoir appelé, Aoi. Mesure deux fois avant d'acheter. Je reste dans le coin : bonus Immobilier ×2 pendant 30 min.",
  jun: "Merci de m'avoir appelé, Aoi. Un seul chiffre ne raconte jamais toute l'histoire, regarde le budget entier : bonus tous les revenus + clic ×2 pendant 1 h.",
  omar: "Merci de m'avoir appelé, Aoi ! Un objectif sans date, c'est juste un souhait. On découpe le plan : bonus Épargne ×2 pendant 1 h.",
};

describe('appel répliques (R-052D-04 / R-052D-05 / R-052D-06)', () => {
  it('keeps Kei’s template isolated for a later editorial swap', () => {
    expect(APPEL_REPLIQUE_TEMPLATES.kei).toBe(KEI_APPEL_REPLIQUE);
    expect(KEI_APPEL_REPLIQUE).toBe(
      "Tu as bien fait de m'appeler, Aoi ! Chaque effort au travail se compte aussi : {bonus} pendant {durée}.",
    );
  });

  it('templates stay ≤ 140 characters before replacement and only use {bonus}/{durée}', () => {
    for (const a of ASSOCIATES) {
      const tmpl = APPEL_REPLIQUE_TEMPLATES[a.id];
      expect(tmpl.length, a.id).toBeLessThanOrEqual(140);
      expect(tmpl).toContain('{bonus}');
      expect(tmpl).toContain('{durée}');
      expect(tmpl).not.toMatch(/\d+\s*%/);
    }
  });

  it('fills the 9 catalogue lines word for word', () => {
    for (const a of ASSOCIATES) {
      const text = fillAppelReplique(
        a.id,
        a.id.charAt(0).toUpperCase() + a.id.slice(1),
        callBonusLabel(a.target),
        callDurationLabel(a.rarity),
      );
      expect(text, a.id).toBe(FINAL[a.id]);
    }
  });

  it('uses the colon fallback when the id has no template (R-052D-05)', () => {
    expect(fillAppelReplique('inconnu', 'Inconnu', 'bonus Épargne ×2', '30 min')).toBe(
      "Inconnu arrive pour t'aider : bonus Épargne ×2 pendant 30 min.",
    );
    expect(APPEL_REPLIQUE_FALLBACK).toBe("{Nom} arrive pour t'aider : {bonus} pendant {durée}.");
  });
});
