/*
 * Page bot — Under / Over 7.
 *
 * Affiche la valeur du PROCHAIN tirage, lue dans la file programmée (script.js).
 * Le bot ne tire rien : il lit le programme. Le jeu consomme la même file, donc la
 * valeur annoncée ici est exactement celle qui sortira au prochain « Lancer les dés ».
 */
(() => {
  'use strict';

  const SIGN = { under: '−7', seven: '7', over: '+7' };
  const NAME = { under: 'moins de 7', seven: 'sept exact', over: 'plus de 7' };
  const SCRIPT_KEY = 'under-over-seven-script-v1';

  const id = (x) => document.getElementById(x);

  const el = {
    live: id('live'),
    pred: id('pred'),
    sign: id('pred-sign'),
    detail: id('pred-detail'),
    pos: id('pred-pos'),
  };

  function outcomeOf(sum) {
    return sum < 7 ? 'under' : sum === 7 ? 'seven' : 'over';
  }

  function render() {
    const upcoming = window.GameScript ? window.GameScript.peek() : null;

    if (!upcoming) {
      el.sign.textContent = '—';
      el.detail.textContent = 'programme indisponible';
      el.pos.textContent = 'programme';
      return;
    }

    const outcome = outcomeOf(upcoming.sum);
    el.pred.classList.remove('is-under', 'is-seven', 'is-over');
    el.pred.classList.add('is-' + outcome);

    el.sign.textContent = SIGN[outcome];
    el.detail.textContent = 'dé ' + upcoming.d1 + ' + dé ' + upcoming.d2 +
      ' = ' + upcoming.sum + ' · ' + NAME[outcome];
    el.pos.textContent = 'programme n°' + upcoming.position + ' / ' + upcoming.total;
    el.live.textContent = 'valeur programmée';
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) render();
  });
  window.addEventListener('storage', (e) => {
    if (e.key === SCRIPT_KEY) render();
  });

  render();
  setInterval(() => { if (!document.hidden) render(); }, 700);
})();
