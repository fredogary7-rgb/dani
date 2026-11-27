/*
 * Programme des tirages — source unique de vérité pour les deux pages.
 *
 * - Le jeu (index.html) CONSOMME la file : chaque « Lancer les dés » prend la valeur
 *   suivante du programme et l'affiche.
 * - Le bot (bot.html) LIT la file sans la consommer : il montre la valeur qui va sortir.
 *
 * Rien n'est aléatoire : la suite commence par PROGRAM (que tu peux modifier librement),
 * puis continue avec une suite déterministe (même graine = mêmes valeurs, rejouable).
 */
(() => {
  'use strict';

  const KEY = 'under-over-seven-script-v1';
  const SEED = 20260101;
  const MAX = 500;

  // ---- Programme manuel : paires [dé 1, dé 2]. Modifie / rallonge cette liste.
  const PROGRAM = [
    [3, 4], // 7
    [1, 1], // 2
    [6, 6], // 12
    [2, 5], // 7
    [4, 2], // 6
    [5, 6], // 11
    [1, 3], // 4
    [6, 2], // 8
    [3, 3], // 6
    [2, 6], // 8
    [5, 2], // 7
    [1, 5], // 6
    [4, 6], // 10
    [3, 1], // 4
    [6, 3], // 9
    [2, 2], // 4
    [5, 4], // 9
    [1, 6], // 7
    [4, 1], // 5
    [6, 5], // 11
  ];

  // Générateur déterministe (mulberry32) : aucune dépendance à crypto/random
  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function build() {
    const rnd = mulberry32(SEED);
    const rounds = [];
    for (let i = 0; i < PROGRAM.length; i++) {
      rounds.push([PROGRAM[i][0], PROGRAM[i][1]]);
    }
    while (rounds.length < MAX) {
      rounds.push([1 + Math.floor(rnd() * 6), 1 + Math.floor(rnd() * 6)]);
    }
    return { index: 0, rounds: rounds };
  }

  // Repli mémoire si localStorage est indisponible
  const memory = { index: 0, rounds: [] };

  function read() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s && Array.isArray(s.rounds) && s.rounds.length && typeof s.index === 'number') {
          memory.index = s.index;
          memory.rounds = s.rounds;
          return memory;
        }
      }
    } catch (err) { /* stockage indisponible */ }

    if (!memory.rounds.length) {
      const fresh = build();
      memory.index = fresh.index;
      memory.rounds = fresh.rounds;
      write(memory);
    }
    return memory;
  }

  function write(s) {
    try {
      localStorage.setItem(KEY, JSON.stringify({ index: s.index, rounds: s.rounds }));
    } catch (err) { /* plein ou privé */ }
  }

  window.GameScript = {
    // Valeur qui va sortir (sans avancer la file)
    peek() {
      const s = read();
      const i = s.index % s.rounds.length;
      const pair = s.rounds[i];
      return { d1: pair[0], d2: pair[1], sum: pair[0] + pair[1], position: i + 1, total: s.rounds.length };
    },
    // Consomme la valeur (appelé par le jeu au lancer)
    next() {
      const s = read();
      const i = s.index % s.rounds.length;
      const pair = s.rounds[i];
      s.index = (i + 1) % s.rounds.length;
      write(s);
      return { d1: pair[0], d2: pair[1], sum: pair[0] + pair[1], position: i + 1 };
    },
    reset() {
      const fresh = build();
      memory.index = fresh.index;
      memory.rounds = fresh.rounds;
      write(memory);
      return fresh.index;
    },
    program: PROGRAM.map((p) => p.slice()),
  };
})();
