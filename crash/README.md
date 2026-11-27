# Crash — démo jouable (argent fictif)

Une courbe monte, un avion file le long de la trajectoire, un multiplicateur grimpe :
il faut **encaisser avant le crash**.

> ⚠️ Démo technique, argent fictif, aucun lien avec un opérateur. 18+.

## Jouer

Ouvrir `index.html` (ou `node ../tools/serve.js 8080` puis `/crash/`).

## Règles & maths

Le point de crash est tiré ainsi (modèle du jeu réel) :

```js
u = random()                     // uniforme [0, 1)
crash = floor( (1 − 0,03) / (1 − u) × 100 ) / 100
```

D'où `P(crash ≥ x) = 0,97 / x` : **RTP 97 %** quel que soit le multiplicateur de retrait
(1,2× : 80,8 % de réussite × 1,2 = 0,97 — 10× : 9,7 % × 10 = 0,97).

> ⚠️ Dans cette démo, les crashs sont **programmés** (`script.js`) : la suite est fixée à
> l'avance, donc le RTP théorique ne s'applique plus. C'est un jeu scripté, pas un jeu
> exploitable.

## Programme des crashs (`script.js`)

```js
const PROGRAM = [
  1.24, 3.81, 1.05, 2.47, 1.93,   // multiplicateurs de crash, dans l'ordre
  // … ajoute / modifie les valeurs
];
```

- Le jeu **consomme** la file au décollage : le crash tombe exactement sur la valeur prévue.
- La page **bot** (`bot.html`) **lit** la file : elle annonce le prochain crash (et les 5 suivants).
- Après `PROGRAM`, la suite continue de façon déterministe (graine fixe, 500 valeurs).
- Le bouton ↺ du jeu remet le solde **et** le programme à zéro.

Aucune stratégie (Martingale, montants progressifs, « prédicteurs ») ne change cette
espérance : elle ne modifie que la variance.

## Contenu

- Boucle : 6 s de paris → vol → crash (2,8 s) → tour suivant
- Avion vectoriel dessiné au canvas : fuselage, ailes, dérive, verrière, hélice animée,
  feu de navigation, orientation sur la tangente, halo, traînée d'étincelles
- Explosion au crash : flash, boule de feu, onde de choc, débris avec traînées
- **Crashs programmés** (`script.js`) : le jeu consomme une file de multiplicateurs, et la
  page **bot** (`bot.html`) annonce le prochain crash exact + les 5 suivants
- Multiplicateur central géant + historique des 14 derniers crashs
- Mise, annulation remboursée, retrait manuel, **retrait automatique** à une cible
- Joueurs simulés qui encaissent en direct, sons WebAudio, solde persistant
- Clavier : espace / Entrée = action principale
- Aperçu figé pour la revue graphique : `?preview=2.5`

## Fichiers

```
index.html   structure
style.css    thème sombre / rouge
game.js      moteur (boucle, avion, explosion, sons, pari)
script.js    programme des crashs (file déterministe, partagée avec le bot)
bot.html     bot : prochain crash programmé + les 5 suivants
bot.css      styles du bot
bot.js       lecture de la file et rendu
```
