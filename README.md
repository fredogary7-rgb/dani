# dani — deux jeux de casino jouables (démo, argent fictif)

Deux jeux de démonstration entièrement côté navigateur, **sans dépendance ni build** :
un **Crash** (courbe + avion) et un **Under / Over 7** (deux dés).

> ⚠️ Projet de démonstration technique. Aucun lien avec 1xBet ou un autre opérateur,
> **aucune transaction réelle** : le solde est fictif et stocké dans le navigateur.
> Jouer de l'argent réel sur un site non agréé ANJ est illégal en France et prive de
> toute protection. 18+.

**Devise : franc CFA (XOF)**, sans sous-unité — les montants sont arrondis à l'unité
(**1 000 000 FCFA** de solde de départ, remis à zéro avec le bouton ↺).

## Lancer

```bash
# option 1 : serveur fourni (aucune dépendance)
node tools/serve.js 8080      # puis http://localhost:8080

# option 2 : python
python -m http.server 8080
```

`index.html` s'ouvre aussi directement en double-clic (le serveur est juste plus confortable
pour tester les deux jeux et le hub).

## Les deux jeux

### 1. Crash — `crash/`

Une courbe monte, un avion file le long de la trajectoire, il faut encaisser avant le crash.

- Boucle : 6 s de paris → vol → crash (2,8 s) → tour suivant
- Avion **vectoriel** (fuselage, ailes, dérive, verrière, hélice animée, feu de navigation),
  orienté sur la tangente de la courbe, halo + traînée d'étincelles
- **Explosion** au crash : flash, boule de feu, onde de choc, débris
- Multiplicateur `m(t) = e^(0,07·t)`, retrait auto, historique, joueurs simulés, sons WebAudio
- Math : `P(crash ≥ x) = 0,97 / x` → **RTP 97 %** (modèle théorique ; ici les crashs sont **programmés**)
- **Page bot** : `/crash/bot.html` — annonce le prochain crash exact (lu dans `script.js`)
  et les 5 suivants ; le jeu consomme la même file au décollage

### 2. Under / Over 7 — `under-over-seven/`

Deux dés à six faces, somme de 2 à 12.

| Pari | Combinaisons | Paiement | Fréquence |
| --- | --- | --- | --- |
| Under 7 (2 → 6) | 15/36 | ×2 | 41,67 % |
| Sept exact | 6/36 | ×5 | 16,67 % |
| Over 7 (8 → 12) | 15/36 | ×2 | 41,67 % |

- Tapis vert feutré, bordures or, trois zones de mise cliquables
- **100 % manuel** : tu places la mise, tu cliques « Lancer les dés » ; rien ne relance
  tout seul. Le **bot de prédiction** est sur une page séparée (`bot.html`) : il annonce
  une issue, ne lance rien, et se note lui-même sur les résultats réels.
- **Dés 3D isométriques** dessinés au canvas (faces, pips en dégradé, ombre portée),
  animation de lancer : rebonds, rotation, écrasement à l'impact, atterrissage
- Jetons de mise ronds, historique des sommes coloré, « Effacer » / « Rejouer »
- Math : RTP = 15/36 × 2 = 6/36 × 5 = **83,33 %** (avantage maison 16,67 %)
- **Page « Résultats »** : `/under-over-seven/results.html` — journal exact des tours
  (dés, somme, issue, mise, gain/perte), KPI et histogramme des sommes comparé à la théorie
- **Tableau d'affichage** : `/under-over-seven/board.html` — dernier tirage en très grand
  noté **−7 / 7 / +7**, compteurs et séries par issue, 40 derniers tirages
- **Bot de prédiction** : `/under-over-seven/bot.html` — prédiction du prochain tirage,
  confiance réelle, et auto-évaluation sur les tirages passés (il ne lance jamais les dés)

## Structure

```
index.html                    hub (choix du jeu)
crash/                        jeu 1 : index.html, style.css, game.js
under-over-seven/             jeu 2 : index.html, style.css, game.js,
                              results.html / results.css / results.js (journal des tours)
tools/serve.js                serveur statique local (port 8080)
tools/rtp-crash.js            simulation 1 M de tours → RTP du Crash
tools/rtp-under-over.js       simulation 1 M de lancers → distribution + RTP des dés
tools/browser-check-crash.js  test fonctionnel réel du Crash (Edge headless + CDP)
tools/browser-check-under-over.js  test fonctionnel des dés
tools/*.png                   captures de contrôle
```

## Vérifications

```bash
node --check crash/game.js
node --check under-over-seven/game.js

node tools/rtp-crash.js          # RTP ≈ 97 %, distribution des crashs
node tools/rtp-under-over.js     # sommes ≈ théorie, RTP ≈ 83,3 %

node tools/browser-check-crash.js
node tools/browser-check-under-over.js
```

Les tests navigateur pilotent **Edge en headless via le protocole DevTools** : ils placent
des mises, déclenchent les animations, vérifient les paiements, l'historique, l'absence
d'erreur console, et enregistrent des captures. Adapter la constante `EDGE` en haut des
scripts pour Chrome/Chromium sur macOS ou Linux.

## Détails d'implémentation notables

- **Canvas haute densité** : `devicePixelRatio` plafonné à 2, redimensionnement via
  `ResizeObserver`.
- **Horloge du jeu** (`Clock`) : le temps passé onglet masqué est compensé, donc un tour
  se **met en pause** au lieu de « sauter » au retour.
- **Tirages programmés** : une file de résultats déterministe (`script.js`) est consommée par
  le jeu, manche après manche. Le bouton ↺ remet le programme au début.
- **Aucune image externe** : avion, courbe, dés, pips, ombres, particules = code.
- **Persistance** : solde en `localStorage` (bouton ↺ pour réinitialiser).
