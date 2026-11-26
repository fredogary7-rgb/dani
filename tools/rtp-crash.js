/*
 * Vérification du modèle mathématique du jeu (Node, sans dépendance).
 *   node tools/rtp-check.js
 *
 * Attendu : espérance de retour ≈ 97 % (soit -3 % pour le joueur) quel que
 * soit le multiplicateur de retrait choisi.
 */
'use strict';

const CFG = { houseEdge: 0.03, growth: 0.07, maxMultiplier: 5000 };
const N = 1000000;

function drawCrashPoint() {
  const u = Math.random();
  const raw = (1 - CFG.houseEdge) / Math.max(1e-9, 1 - u);
  return Math.min(CFG.maxMultiplier, Math.max(1, Math.floor(raw * 100) / 100));
}

const targets = [1.2, 1.5, 2, 3, 10, 100];

// 1) Espérance simulée : on mise 1 € et on retire au multiplicateur cible.
const results = targets.map((k) => {
  let total = 0;
  let hits = 0;
  for (let i = 0; i < N; i++) {
    const c = drawCrashPoint();
    if (c >= k) {
      total += k;
      hits += 1;
    }
  }
  return { k, rtp: total / N, hitRate: hits / N, theoretical: k * (1 - CFG.houseEdge) / k };
});

console.log('Simulation sur ' + N.toLocaleString('fr-FR') + ' tours, mise 1 € :\n');
console.log('cible   RTP simulé   fréquence de réussite   RTP théorique');
for (const r of results) {
  console.log(
    (r.k + 'x').padEnd(7),
    (r.rtp * 100).toFixed(2).padStart(8) + ' %',
    (r.hitRate * 100).toFixed(2).padStart(14) + ' %',
    ((1 - CFG.houseEdge) * 100).toFixed(2).padStart(12) + ' %'
  );
}

// 2) Distribution des crashs + durées de tour
let medians = [];
let over2 = 0;
let over10 = 0;
let max = 0;
let sum = 0;
const samples = new Float64Array(N);
for (let i = 0; i < N; i++) {
  const c = drawCrashPoint();
  samples[i] = c;
  sum += c;
  if (c >= 2) over2 += 1;
  if (c >= 10) over10 += 1;
  if (c > max) max = c;
}
samples.sort();
for (let i = 0; i < N; i += 1) medians.push(samples[i]);

const median = samples[Math.floor(N / 2)];
const p90 = samples[Math.floor(N * 0.9)];
const avgDuration = samples.reduce((acc, c) => acc + Math.log(c) / CFG.growth, 0) / N;

console.log('\nDistribution des crashs :');
console.log('  médiane........... ' + median.toFixed(2) + '×');
console.log('  P(crash >= 2×).... ' + ((over2 / N) * 100).toFixed(2) + ' %  (théorie 48.50 %)');
console.log('  P(crash >= 10×)... ' + ((over10 / N) * 100).toFixed(3) + ' %  (théorie 9.70 %)');
console.log('  p90............... ' + p90.toFixed(2) + '×');
console.log('  maximum........... ' + max.toFixed(2) + '×');
console.log('  durée moyenne..... ' + avgDuration.toFixed(1) + ' s par manche (hors attente)');
