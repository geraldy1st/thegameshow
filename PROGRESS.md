## 2026-10-31 — Lot 3, corrections recette (0.3.1)

- Recette Crypto : GO AVEC RÉSERVES (420a06c). Corrigés : DEF-GS-12 (garde fausse jauge dans pages.yml), DEF-GS-13 (verrou rédacteur retenté 50→800 ms), DEF-GS-14 (harnais `setEnergy`, docs alignées), titre save.test.ts, fast-check 1 000 cas.
- Vérifiés sans correctif : 404 non reproduit (preview + Pages), cible 1×1 = champ fichier masqué.
- Contrôles : 142 vitest, 72 Playwright, accueil 329,1 Ko / 500 Ko, audit critique OK.
- Reste : confirmer DEF-GS-13 sur un vrai iPhone ; pages.yml prend effet au prochain déploiement depuis main.

## 2026-11-01 — Lot 3 publié (0.3.1)

- Publication autorisée par Geraldy le 01/11 ; recette Crypto GO AVEC RÉSERVES sur 5894cb8.
- `main` avancé en avance rapide de48a09 → 5894cb8 (aucun changement de contenu), déployé par pages.yml (run 41285073773 : build, check:no-test-hook, check:no-budget-fake, déploiement OK ; CI 41285073857 OK).
- Fumée sur https://geraldy1st.github.io/thegameshow/ : 200, `h1` « Accueil », 0 réponse ≥ 400, 0 erreur console, aucune trace du harnais ni fichier de test, accueil 326,8 Ko transférés / 500 Ko.

## 2026-11-01 — Lot 4 « Travailler » codé (0.4.0, branche `lot-4-work`)

- GO AVEC RÉSERVES de Crypto (v1.2) ; docs v1.3 (copies v1.2 gardées hors dépôt).
- Incréments : schéma v4 + migration ; cœur frappe/boost/conversion ; accueil sans défilement + Menu/Paramètres + écran Travailler + vidéos ; harnais lot 4 ; budgets + CI ; E2E lot 4 et suites adaptées (QA §2.4) ; docs.
- Mesures locales : accueil 336,2 Ko / 500 ; Travailler 162,3 Ko / 200 hors socle (direct 346,2 / 530, fixe 22,4 / 150) ; jauges qui échouent comme prévu.
- Reste : fixtures lot 4 de Crypto absentes (fixtures du dépôt utilisées), simulation 30 jours (`workSim`) non faite, script de comparaison d'état final (QA §2.4) non écrit, WebKit non lancé localement (CI), revue visuelle des tuiles à 360×640 sur iPhone.

## 2026-11-01 — Lot 4, corrections recette (0.4.1)

- Recette Crypto : GO AVEC RÉSERVES (db109ce). Corrigés : DEF-GS-15 (oracle), DEF-GS-16, DEF-GS-17, R-LOT4-1 (correctif 0.3.2 en patch, non poussé), R-LOT4-2 (simulation + comparaison adoptées).
- Contrôles : vitest 212, E2E Chromium tout vert ; lot2 « rechargement pendant la révélation » ×20 : 40/40, ×50 : 100/100 (2 moteurs) ; aller-retour 0.3.2 ↔ 0.4.1 : 5/5 (Chromium) ; accueil 336,6 Ko / 500 Ko ; §2.4 : 0 champ différent.
- Reste : R-LOT4-3 (stocker l'énergie pour le boost : 1,72, équilibrage non touché), R-LOT4-4/5, fiche iPhone, crash vidéo de WebKit local (#work testé en CI).
