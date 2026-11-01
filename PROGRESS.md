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

## 2026-11-01 — Lot 4 publié (0.4.1)

- Publication selon la consigne permanente de Geraldy (31/10) ; recette Crypto GO AVEC RÉSERVES sur 9fa3e02.
- `main` avancé en avance rapide 5894cb8 → 9fa3e02 (aucun changement de contenu) ; 0.3.2 non publiée (patch dans `hotfix-0.3.2/`).
- pages.yml run 41332459752 : build, check:no-test-hook, check:no-budget-fake, budgets accueil/Travailler, déploiement OK.
- Fumée sur https://geraldy1st.github.io/thegameshow/ (360×640) : 200, « Accueil » sans défilement (640/640), tuile Travailler sans cadenas → `#work`, onglet Menu → Paramètres (Sauvegarde, Exporter, Importer), aucun harnais (`__TGS_TEST__`, `setEnergy`, `loadSave` absents du JS), accueil 336,8 Ko / 500 Ko, 0 erreur console, 0 réponse ≥ 400 ; bundle identique au build local.

## 2026-11-01 — Patch 0.4.2 codé (branche `patch-042`, non publié)

- GO AVEC RÉSERVES de Crypto pour coder (pas pour publier) ; docs patch v1.1 avec les 12 réserves (copies v1.0 hors dépôt).
- Contrôles locaux : vitest 255 ; E2E Chromium 59/59 (lots 1-4 + patch042) ; WebKit local 45/59, les 14 échecs sont tous sur `#work` (crash connu à l'affichage d'une vidéo) ; mutation « hors zone → hit » détectée (4 unitaires + 2 E2E) ; lot2 ×50 : 450/450 ; `workSim` : tapeur continu 1,071, actif 1,041, idle 1,017, reduced-motion 1,070 ; budgets : accueil 337,5 Ko / 500, Travailler direct 347,6 / 530, fixe 22,4 / 150, jauges qui échouent comme prévu ; `cmp-builds` 0.4.1 / 0.4.2 : sans option, `--work roman` et `--work presse` OK (presse : seuls `mode` et `cursor` diffèrent).
- Écarts : le chargement écrit toujours une fois (revision +1, existant) ; à 200 % de police le document déborde en largeur dès l'accueil (40 / 10 px), identique en 0.4.1 ; « Gains hors ligne » peut garder une ellipse à 120 % quand « Récolter » est affiché.
- 2026-11-01 vers 23:30 (heure des Canaries) : NO-GO de Crypto sur 5c7ffa2, correctifs en commit sur `patch-042`. DEF-GS-18 : « Fermer » passe de 1:1 à 13,26:1 ; inventaire `.btn-ghost` : « Voir la scène 1 » et « Annuler » de « Nouvelle partie » étaient aussi à 1:1, corrigés ; les autres sont sur fond sombre (10,52 / 13,26). DEF-GS-19 : panneau 89 / 70 px → 56 / 56 px. Contrôles : vitest 255, E2E Chromium 79/79 (chromium-mobile + chromium-390), WebKit local : les 3 tests de contraste passent, celui du panneau plante (crash vidéo `#work` connu) ; mutation de contraste détectée.
- 2026-11-01 vers 23:40 (heure des Canaries) : GO AVEC RÉSERVES de Crypto sur 6a0fadd, réserve DEF-GS-20 corrigée par un nouveau commit. À 360×640, police 120 % : le nombre et le taux finissaient sous le bouton (x = 136) ; maintenant le bouton commence à x = 180 et le panneau fait 62 px (56 px à 100 %). Le nouvel E2E échoue sur 6a0fadd. Contrôles : vitest 255, E2E Chromium 80/80, WebKit local DEF-GS-18 3/3.
- Reste : réponses de Geraldy (R-P42-12 : publication après GO de recette, point 4) ; GS-V5-67 sur WebKit en CI ; fiche iPhone (pastilles, cadrage, frappe sur Aoi).
