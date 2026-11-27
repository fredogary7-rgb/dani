/*
 * Programme des crashs — source unique de vérité pour les deux pages.
 *
 * - Le jeu (index.html) CONSOMME la file au décollage : le multiplicateur de crash
 *   affiché est exactement la valeur programmée.
 * - Le bot (bot.html) LIT la file sans la consommer : il annonce le prochain crash.
 *
 * Rien n'est aléatoire : la suite commence par PROGRAM (modifiable), puis continue
 * avec une suite déterministe (même graine = mêmes valeurs) répartie comme le jeu.
 */
(() => {
  'use strict';

  const KEY = 'crash-script-v1';
  const SEED = 20260202;
  const MAX = 500;
  const EDGE = 0.03;
  const CAP = 5000;

  // ---- Programme manuel : multiplicateurs de crash (2.47 = 2,47×). Modifie librement.
  const PROGRAM = [
    1.24, 3.81, 1.05, 2.47, 1.93,
    7.12, 1.38, 12.4, 1.11, 2.02,
    1.56, 4.65, 1.02, 2.88, 1.75,
    9.36, 1.44, 3.1, 1.87, 6.05,
  ];

  // Générateur déterministe (mulberry32)
  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function round2(v) {
    return Math.round(v * 100) / 100;
  }

  function build() {
    const rnd = mulberry32(SEED);
    const rounds = [];
    for (let i = 0; i < PROGRAM.length; i++) {
      rounds.push(Math.max(1, round2(PROGRAM[i])));
    }
    while (rounds.length < MAX) {
      const u = rnd();
      const raw = (1 - EDGE) / Math.max(1e-9, 1 - u);
      rounds.push(Math.min(CAP, Math.max(1, Math.floor(raw * 100) / 100)));
    }
    return { index: 0, rounds: rounds };
  }

  const memory = { index: 0, rounds: [] };

  function write(s) {
    try {
      localStorage.setItem(KEY, JSON.stringify({ index: s.index, rounds: s.rounds }));
    } catch (err) { /* stockage indisponible */ }
  }

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
    } catch (err) { /* ignore */ }

    if (!memory.rounds.length) {
      const fresh = build();
      memory.index = fresh.index;
      memory.rounds = fresh.rounds;
      write(memory);
    }
    return memory;
  }

  window.GameScript = {
    // Prochain multiplicateur (sans avancer la file)
    peek() {
      const s = read();
      const i = s.index % s.rounds.length;
      return { value: s.rounds[i], position: i + 1, total: s.rounds.length };
    },
    // Consomme la valeur (appelé par le jeu au décollage)
    next() {
      const s = read();
      const i = s.index % s.rounds.length;
      const value = s.rounds[i];
      s.index = (i + 1) % s.rounds.length;
      write(s);
      return { value: value, position: i + 1 };
    },
    // Les n prochaines valeurs (lecture seule)
    ahead(n) {
      const s = read();
      const out = [];
      const count = Math.min(n || 5, s.rounds.length);
      for (let k = 0; k < count; k++) {
        const i = (s.index + k) % s.rounds.length;
        out.push({ value: s.rounds[i], position: i + 1 });
      }
      return out;
    },
    reset() {
      const fresh = build();
      memory.index = fresh.index;
      memory.rounds = fresh.rounds;
      write(memory);
      return fresh.index;
    },
    program: PROGRAM.slice(),
  };
})();
