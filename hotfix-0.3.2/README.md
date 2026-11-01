# Correctif 0.3.2 (R-LOT4-1, OD-18 v1.3) — non publié

Patch `git format-patch` du commit local 37c418e (branche locale `hotfix-0.3.2`, partie de 5894cb8, **non poussée**). Il fait passer une sauvegarde lot 4 (v4) en v3 sans perte au lieu de la refuser :

- une seule transaction : v4 brute copiée dans `backup-before-downgrade-v4`, puis v3 (= v4 sans `work`, validée v3) écrite avec revision+1 ;
- annonce « Sauvegarde ramenée à la version précédente du jeu » ;
- version future = 5 et au-delà.

Au retour sur 0.4.1, `loadSave` relit la copie et restaure `work` si les champs v3 sont identiques (sinon `work` repart à l'état initial, règle OD-18).

Appliquer : `git checkout -b hotfix-0.3.2 5894cb8 && git am hotfix-0.3.2/*.patch`. Vérifié localement : check:all, vitest 150, E2E 82/82 (Chromium + WebKit), lot2 « rechargement pendant la révélation » ×20 sur les 2 moteurs : 80/80. Aller-retour entre les deux builds : `node tools/gs-v5-65-cross.mjs <dist-test 0.3.2> dist-test` (Chromium : 5/5 fixtures OK).
