## 2026-10-31 — Lot 3, corrections recette (0.3.1)

- Recette Crypto : GO AVEC RÉSERVES (420a06c). Corrigés : DEF-GS-12 (garde fausse jauge dans pages.yml), DEF-GS-13 (verrou rédacteur retenté 50→800 ms), DEF-GS-14 (harnais `setEnergy`, docs alignées), titre save.test.ts, fast-check 1 000 cas.
- Vérifiés sans correctif : 404 non reproduit (preview + Pages), cible 1×1 = champ fichier masqué.
- Contrôles : 142 vitest, 72 Playwright, accueil 329,1 Ko / 500 Ko, audit critique OK.
- Reste : confirmer DEF-GS-13 sur un vrai iPhone ; pages.yml prend effet au prochain déploiement depuis main.

## 2026-11-01 — Lot 3 publié (0.3.1)

- Publication autorisée par Geraldy le 01/11 ; recette Crypto GO AVEC RÉSERVES sur 5894cb8.
- `main` avancé en avance rapide de48a09 → 5894cb8 (aucun changement de contenu), déployé par pages.yml (run 41285073773 : build, check:no-test-hook, check:no-budget-fake, déploiement OK ; CI 41285073857 OK).
- Fumée sur https://geraldy1st.github.io/thegameshow/ : 200, `h1` « Accueil », 0 réponse ≥ 400, 0 erreur console, aucune trace du harnais ni fichier de test, accueil 326,8 Ko transférés / 500 Ko.
