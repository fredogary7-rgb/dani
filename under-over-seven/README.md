# Under / Over 7 — démo jouable (argent fictif)

Deux dés à six faces, une somme de 2 à 12. On mise sur **Under 7**, **Sept exact** ou
**Over 7**, les dés roulent, le tapis s'illumine.

> ⚠️ Démo technique, argent fictif, aucun lien avec un opérateur. 18+.

## Jouer

Ouvrir `index.html` (ou `node ../tools/serve.js 8080` puis `/under-over-seven/`).

1. Choisir un jeton (10 / 50 / 100 / 500 / 1 000 FCFA) dans le panneau.
2. Cliquer une zone du tapis : chaque clic ajoute le jeton à cette zone.
3. **Lancer les dés** : le tirage ne part **que** sur ce clic — aucun compte à rebours,
   aucune relance automatique.
4. Après le résultat, la manche reste figée : **Nouvelle manche** pour rejouer.
   Le **bot de prédiction** est sur une page séparée (bouton 🤖) : il ne lance jamais les dés.
5. **Effacer** rembourse les mises, **Rejouer** rejoue la mise du tour précédent.

## Règles & maths

| Pari | Combinaisons | Paiement | Fréquence |
| --- | --- | --- | --- |
| Under 7 (2 → 6) | 15/36 | ×2 | 41,67 % |
| Sept exact | 6/36 | ×5 | 16,67 % |
| Over 7 (8 → 12) | 15/36 | ×2 | 41,67 % |

Avec deux dés honnêtes, RTP = 15/36 × 2 = 6/36 × 5 = **83,33 %** (avantage maison 16,67 %).
⚠️ Ici les tirages sont **programmés** (`script.js`) : le RTP théorique ne s'applique plus,
puisque la suite est fixée à l'avance — c'est une démo, pas un jeu exploitable.

## Programme des tirages (`script.js`)

```js
const PROGRAM = [
  [3, 4], // 7
  [1, 1], // 2
  // … ajoute / modifie les paires [dé 1, dé 2] que tu veux
];
```

- Le jeu **consomme** la file : chaque « Lancer les dés » prend la paire suivante.
- La page bot **lit** la file sans la consommer : elle annonce donc la valeur exacte à venir.
- Après `PROGRAM`, la suite continue de façon **déterministe** (même graine = mêmes valeurs).
- Le bouton ↺ du jeu réinitialise le solde **et** le programme (retour à la première paire).

## Contenu

- Tapis feutré vert, bordures or, zones de mise teintées (teal / or / violet)
- **Dés 3D isométriques** dessinés au canvas : 3 faces visibles, pips en dégradé
  (le 1 est rouge, comme sur les dés de casino), ombre portée, bords arrondis
- Animation de lancer : deux rebonds, rotation, écrasement à l'impact, atterrissage
- **Aucune automatisation** : ni compte à rebours ni relance auto — chaque tirage part
  d'un clic sur « Lancer les dés », la manche reste figée sur le résultat
- **Page Bot** (`bot.html`) : affiche la **valeur du prochain tirage**, lue dans la file
  programmée — elle sera tirée à l'identique au prochain « Lancer les dés ».
  Le bot ne lance rien et n'utilise aucun historique.
- Jetons de mise ronds, total engagé, table des gains, historique coloré des sommes
- **Page « Résultats »** (`results.html`) : journal exact de chaque tour (dé 1, dé 2, somme,
  issue, mise, gain/perte), KPI (Under/Sept/Over, RTP et net observés), histogramme des
  sommes 2 → 12 comparé à la théorie. Alimentée en direct par le jeu (localStorage), elle
  se rafraîchit toute seule et se met à jour si une autre fenêtre joue.
- **Tableau d'affichage** (`board.html`) : page dédiée, plein écran, avec le dernier tirage
  en très grand noté **−7 / 7 / +7**, les compteurs et séries par issue, la bande des
  40 derniers tirages et les probabilités du prochain tirage (fixes, non prédictives).
- Phase de résultat : somme géante colorée, zone gagnante illuminée, zones perdantes
  atténuées, message « Gagné / Perdu », sons de dés (secousses + impacts) et de gain
- Solde persistant (`localStorage`), bouton ↺ pour réinitialiser, clavier espace / Entrée

## Fichiers

```
index.html   structure du tapis et du panneau
style.css    thème tapis vert / or
game.js      moteur : tirage crypto, dés 3D, manches, paiements, sons, journal des tours
results.html page « Résultats » (journal + statistiques)
results.css  styles de la page de résultats
results.js   lecture du journal (localStorage) et rendu des stats
board.html   tableau d'affichage −7 / 7 / +7 (dernier tirage en grand + séries)
board.css    styles du tableau
board.js     rendu temps réel du tableau
bot.html     bot de prédiction (prédiction + auto-évaluation sur les résultats réels)
bot.css      styles du bot
bot.js       moteur de prédiction, backtest et scores
```
