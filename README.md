# The Gameshow

Jeu solo **mobile first** gacha/idle éducatif sur la finance personnelle : Aoi, candidate d'un gameshow à Tokyo. Aucune monnaie réelle, aucun serveur, aucun classement. Hébergement prévu : https://geraldy1st.github.io/thegameshow/ (fixe : changer d'origine ferait perdre les sauvegardes locales).

## Stack

React 19 + TypeScript 6 + Vite 8 (SPA statique, `base: /thegameshow/`), Zustand 5, idb 8 (IndexedDB), Vitest 5, ESLint 10 + typescript-eslint, Prettier 3. Polices Fredoka/Inter auto-hébergées (`@fontsource`). Node ≥ 22.12 (`.nvmrc`).

## Mobile first

CSS de base pour un téléphone en portrait (360 px, une main), agrandissement par `min-width` ; cibles ≥ 44 px, aucun survol requis, `env(safe-area-inset-*)`, `100dvh`, champs ≥ 16 px. Recette sur iPhone Safari et Android Chrome (GS-CA19).

## Scripts

| Script                                                 | Rôle                                                                                                                              |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                                          | serveur de dev                                                                                                                    |
| `npm run typecheck` / `lint` / `format:check` / `test` | contrôles                                                                                                                         |
| `npm run build`                                        | build de production (`dist/`)                                                                                                     |
| `npm run build:test-harness`                           | build de test (`dist-test/`) avec horloge/graine injectables                                                                      |
| `npm run check:no-test-hook`                           | échoue si `dist/` contient le mode de test, une API de paiement ou de notification push                                           |
| `npm run check:harness-detected`                       | contrôle positif : le build de test doit être détecté                                                                             |
| `npm run check:no-budget-fake`                         | échoue si `dist/` contient le faux fichier de jauge ou un fichier > 500 000 octets                                                |
| `npm run budget:home`                                  | mesure l'accueil (Chromium 360×640, gzip) jusqu'à `tgs:home-ready` ; bloquant > 500 Ko                                            |
| `npm run budget:gauge`                                 | contrôle de la jauge : un build avec un faux fichier de 600 Ko doit échouer                                                       |
| `npm run budget:work`                                  | entrée de Travailler (Google Chrome, H.264) : depuis l'accueil ≤ 200 Ko hors socle, chargement direct `#work` ≤ 530 Ko ; bloquant |
| `npm run budget:work:still`                            | Travailler en images fixes (reduced-motion) ≤ 150 Ko, aucune source vidéo montée                                                  |
| `npm run budget:work:gauge`                            | jauge : une vidéo H.264 valide ≥ 600 Ko (ffmpeg) doit faire échouer `budget:work`                                                 |
| `tools/encode-work-video.sh <sources> [crf]`           | ré-encodage reproductible des vidéos de Travailler (480 px, CRF 30, sans son, faststart) et des WebP fixes                        |

### Mode de test

Uniquement dans `build:test-harness` (`import.meta.env.MODE === 'test-harness'`) : URL `?now=<ms>&seed=<n>`, puis `window.__TGS_TEST__` (`now`, `setNow`, `advance(ms)`, `state()`, au lot 2 `seed(n)`, `setTickets(n)`, `setPity(n)`, au lot 3 `setEnergy(n)`, au lot 4 `loadSave(obj)` (valide, migre et écrit par le compare-and-set normal, refuse un objet invalide), `seedRng(n)`, `setVisibility(v)`, `setCursor(p)`, `boostShow()`, `boostPhase()`, `mediaOverride(o)`). Liste de clés contrôlée par `HARNESS_KEYS` (test unitaire). Les tests E2E qui en ont besoin tournent sur le build de test servi au port 4181 (second serveur de `playwright.config.ts`) ; les autres écrivent encore directement dans IndexedDB avant le chargement (`e2e/lot3.spec.ts`, `seed`). Éliminé du build de production (vérifié en CI : chaque clé est cherchée dans le build minifié ; `check:harness-detected` vérifie que le build de test est refusé et que les 10 clés sont nommées).

## Structure

```
src/core/    logique pure (économie, idle/hors ligne, PRNG à graine, horloge injectable, état initial)
src/data/    balance.ts : seule table d'équilibrage
src/save/    schéma SaveV4 (migrations v1→v2→v3→v4, copie avant migration) + validation stricte, migrations, export/import, IndexedDB, sauvegardes de référence
src/store/   store Zustand : orchestre core + save (écriture conditionnelle par révision, lecture seule du 2e onglet)
src/ui/      accueil (hub, sans défilement), navigation par hash (#home, #invest, #friends, #partners, #quests, #work, #settings), Travailler (src/ui/work), Investir/Amis/Associés, quêtes, tirage (tokens du brief design)
public/game/ accueil WebP (public/game/home), Travailler MP4 H.264 + WebP (public/game/work), portraits WebP + JPEG (tools/import-assets.py, manifeste src/data/assets-manifest.json)
src/i18n/    textes FR (EN/ES dans un lot suivant)
tools/       contrôles de build et de contraste
```

Spécification : `SPEC-ADDENDUM.md` (hors dépôt, dossier de plan), DESIGN-BRIEF.md de Mirage.

## Journal

- 2026-10-25 — Lot 1 « noyau » (branche `lot-1-core`) : clic, 3 investissements, gains idle et hors ligne plafonnés à 8 h, sauvegarde v1. Tirage, quêtes, amis et PWA : lots suivants.
- 2026-10-25 — Lot 2 « tirage » (branche `lot-2-draw`) : tirage d'associés (70/25/5, pitié au 50e), 5 quêtes du jour (7 tickets max, sans série), amis Ren/Mio/Sora (scène 1), sauvegarde v2. Tickets uniquement en jouant, aucun achat possible. Pas de PWA.
- 2026-10-27 — Lot 3 « accueil » (branche `lot-3-home`, 0.3.0) : accueil hub v5 (profil, énergie, 6 activités verrouillées, Aoi au centre), navigation par hash avec retour navigateur, sauvegarde v3 (copie avant migration, copie avant restauration), DEF-GS-10/11 corrigés, budget accueil 500 Ko bloquant en CI (mesuré 329,0 Ko). Pas de vidéo.
- 2026-11-01 — Lot 4 « Travailler » (branche `lot-4-work`, 0.4.0) : bouton jaune retiré, tuile Travailler ouverte (écran `#work` : frappe 1 énergie → points, Roman/Presse, conversion 100 pts = 10 ¥ + 1 Créativité, power boost x2 5 s à l'horloge du jeu, vidéos d'Aoi et images fixes), onglet Menu → Paramètres (sauvegarde), accueil sans défilement, sauvegarde v4 (copie `backup-before-migration-v3`), quête « clic » par frappe acceptée, budgets Travailler bloquants, artefacts `dist`/`dist-test` en CI.
- 2026-11-01 — Corrections recette lot 4 (0.4.1) : DEF-GS-15 (oracle E2E, écriture déjà atomique, test d'atomicité), retour arrière v4→v3 sans perte (correctif 0.3.2 en patch dans `hotfix-0.3.2/`, non publié ; restauration de `work` au retour), annonce « Plus d'énergie » relue à chaque fois, tuiles sans recouvrement à 360×640, simulation 30 jours en test et script `tools/cmp-builds.mjs`.
