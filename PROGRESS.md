## 2026-10-31 — Lot 3, corrections recette (0.3.1)

- Recette Crypto : GO AVEC RÉSERVES (420a06c). Corrigés : DEF-GS-12 (garde fausse jauge dans pages.yml), DEF-GS-13 (verrou rédacteur retenté 50→800 ms), DEF-GS-14 (harnais `setEnergy`, docs alignées), titre save.test.ts, fast-check 1 000 cas.
- Vérifiés sans correctif : 404 non reproduit (preview + Pages), cible 1×1 = champ fichier masqué.
- Contrôles : 142 vitest, 72 Playwright, accueil 329,1 Ko / 500 Ko, audit critique OK.
- Reste : confirmer DEF-GS-13 sur un vrai iPhone ; pages.yml prend effet au prochain déploiement depuis main.
