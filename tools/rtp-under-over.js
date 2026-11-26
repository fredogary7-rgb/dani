/*
 * Vérification du modèle mathématique de Under & Over 7 (sans dépendance).
 *   node tools/rtp-under-over.js
 */
'use strict';

const N = 1000000;
const PAYOUTS = { under: 2, seven: 5, over: 2 };
const d6 = () => 1 + Math.floor(Math.random() * 6);
const nf = new Intl.NumberFormat('fr-FR');

const counts = new Array(13).fill(0);
const ret = { under: 0, seven: 0, over: 0 };

for (let i = 0; i < N; i++) {
  const s = d6() + d6();
  counts[s] += 1;
  if (s < 7) ret.under += PAYOUTS.under;
  else if (s === 7) ret.seven += PAYOUTS.seven;
  else ret.over += PAYOUTS.over;
}

console.log('Distribution des sommes sur ' + nf.format(N) + ' lancers :\n');
for (let s = 2; s <= 12; s++) {
  const ways = 6 - Math.abs(7 - s);
  const emp = counts[s] / N;
  const theo = ways / 36;
  const bar = '#'.repeat(Math.round(emp * 90));
  console.log(
    '  ' + String(s).padStart(2) + ' : ' + (emp * 100).toFixed(2).padStart(5) + ' %' +
    '   théorie ' + (theo * 100).toFixed(2).padStart(5) + ' %   ' + bar
  );
}

console.log('\nEspérance de retour pour 1 € misé :');
const rows = [
  ['Under 7', 'under', 15 / 36],
  ['Sept exact', 'seven', 6 / 36],
  ['Over 7', 'over', 15 / 36],
];
for (const [label, key, p] of rows) {
  console.log(
    '  ' + label.padEnd(11) +
    'RTP simulé ' + ((ret[key] / N) * 100).toFixed(2) + ' %' +
    '   théorique ' + (p * PAYOUTS[key] * 100).toFixed(2) + ' %' +
    '   (fréquence ' + (p * 100).toFixed(2) + ' %)'
  );
}

// 1 € sur chacune des trois zones : un seul gain possible par tour
const combo = (ret.under + ret.seven + ret.over) / N / 3;
console.log('\n  1 € sur chaque zone (3 € engagés) : RTP ' + (combo * 100).toFixed(2) + ' %');
console.log('  Avantage maison : ' + ((1 - combo) * 100).toFixed(2) + ' %');
