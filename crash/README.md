# Crash — démo jouable (argent fictif)

Une courbe monte, un avion file le long de la trajectoire, un multiplicateur grimpe :
il faut **encaisser avant le crash**.

> ⚠️ Démo technique, argent fictif, aucun lien avec un opérateur. 18+.

## Jouer

Ouvrir `index.html` (ou `node ../tools/serve.js 8080` puis `/crash/`).

## Règles & maths

Le point de crash est tiré ainsi :

```js
u = random()                     // uniforme [0, 1)
crash = floor( (1 − 0,03) / (1 − u) × 100 ) / 100
```

D'où `P(crash ≥ x) = 0,97 / x` : **RTP 97 %** quel que soit le multiplicateur de retrait
(1,2× : 80,8 % de réussite × 1,2 = 0,97 — 10× : 9,7 % × 10 = 0,97).

Aucune stratégie (Martingale, montants progressifs, « prédicteurs ») ne change cette
espérance : elle ne modifie que la variance.

## Contenu

- Boucle : 6 s de paris → vol → crash (2,8 s) → tour suivant
- Avion vectoriel dessiné au canvas : fuselage, ailes, dérive, verrière, hélice animée,
  feu de navigation, orientation sur la tangente, halo, traînée d'étincelles
- Explosion au crash : flash, boule de feu, onde de choc, débris avec traînées
- Multiplicateur central géant + historique des 14 derniers crashs
- Mise, annulation remboursée, retrait manuel, **retrait automatique** à une cible
- Joueurs simulés qui encaissent en direct, sons WebAudio, solde persistant
- Clavier : espace / Entrée = action principale
- Aperçu figé pour la revue graphique : `?preview=2.5`

## Fichiers

```
index.html   structure
style.css    thème sombre / rouge
game.js      moteur (tirage, boucle, avion, explosion, sons, pari)
```
