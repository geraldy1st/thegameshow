# The Gameshow

Jeu solo **mobile first** gacha/idle éducatif sur la finance personnelle : Aoi, candidate d'un gameshow à Tokyo. Aucune monnaie réelle, aucun serveur, aucun classement. Hébergement prévu : https://geraldy1st.github.io/thegameshow/ (fixe : changer d'origine ferait perdre les sauvegardes locales).

## Stack

React 19 + TypeScript 6 + Vite 8 (SPA statique, `base: /thegameshow/`), Zustand 5, idb 8 (IndexedDB), Vitest 5, ESLint 10 + typescript-eslint, Prettier 3. Polices Fredoka/Inter auto-hébergées (`@fontsource`). Node ≥ 22.12 (`.nvmrc`).

## Mobile first

CSS de base pour un téléphone en portrait (360 px, une main), agrandissement par `min-width` ; cibles ≥ 44 px, aucun survol requis, `env(safe-area-inset-*)`, `100dvh`, champs ≥ 16 px. Recette sur iPhone Safari et Android Chrome (GS-CA19).

## Scripts

| Script                                                 | Rôle                                                                                    |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `npm run dev`                                          | serveur de dev                                                                          |
| `npm run typecheck` / `lint` / `format:check` / `test` | contrôles                                                                               |
| `npm run build`                                        | build de production (`dist/`)                                                           |
| `npm run build:test-harness`                           | build de test (`dist-test/`) avec horloge/graine injectables                            |
| `npm run check:no-test-hook`                           | échoue si `dist/` contient le mode de test, une API de paiement ou de notification push |
| `npm run check:harness-detected`                       | contrôle positif : le build de test doit être détecté                                   |

### Mode de test

Uniquement dans `build:test-harness` (`import.meta.env.MODE === 'test-harness'`) : URL `?now=<ms>&seed=<n>`, puis `window.__TGS_TEST__` (`now`, `setNow`, `advance(ms)`, `state()`). Éliminé du build de production (vérifié en CI).

## Structure

```
src/core/    logique pure (économie, idle/hors ligne, PRNG à graine, horloge injectable, état initial)
src/data/    balance.ts : seule table d'équilibrage
src/save/    schéma SaveV1 + validation stricte, migrations, export/import, IndexedDB, sauvegardes de référence
src/store/   store Zustand : orchestre core + save (écriture conditionnelle par révision, lecture seule du 2e onglet)
src/ui/      écran minimal (tokens du brief design), formatage
src/i18n/    textes FR (EN/ES dans un lot suivant)
tools/       contrôles de build et de contraste
```

Spécification : `SPEC-ADDENDUM.md` (hors dépôt, dossier de plan), DESIGN-BRIEF.md de Mirage.

## Journal

- 2026-10-25 — Lot 1 « noyau » (branche `lot-1-core`) : clic, 3 investissements, gains idle et hors ligne plafonnés à 8 h, sauvegarde v1. Tirage, quêtes, amis et PWA : lots suivants.
