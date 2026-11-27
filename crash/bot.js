/*
 * Page bot du Crash.
 *
 * Affiche le multiplicateur de crash du PROCHAIN vol, lu dans la file programmée
 * (script.js). Le jeu consomme la même file au décollage : la valeur annoncée ici est
 * exactement celle à laquelle le vol va crasher.
 */
(() => {
  'use strict';

  const SCRIPT_KEY = 'crash-script-v1';
  const id = (x) => document.getElementById(x);

  const el = {
    live: id('live'),
    pred: id('pred'),
    value: id('pred-value'),
    detail: id('pred-detail'),
    pos: id('pred-pos'),
    ahead: id('ahead'),
    count: id('ahead-count'),
  };

  const fmt = (v) => Number(v).toFixed(2);

  function label(v) {
    if (v < 1.5) return 'crash quasi immédiat';
    if (v < 2) return 'crash rapide';
    if (v < 5) return 'crash moyen';
    if (v < 10) return 'bon multiplicateur';
    return 'gros multiplicateur';
  }

  function render() {
    if (!window.GameScript) {
      el.value.textContent = '—';
      el.detail.textContent = 'programme indisponible';
      el.ahead.textContent = '';
      return;
    }

    const next = window.GameScript.peek();
    el.value.textContent = fmt(next.value);
    el.detail.textContent = label(next.value) + ' · ' + fmt(next.value) + '×';
    el.pos.textContent = 'programme n°' + next.position + ' / ' + next.total;
    el.pred.classList.toggle('is-hot', next.value >= 10);

    const list = window.GameScript.ahead(5);
    el.ahead.textContent = '';
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      const pill = document.createElement('span');
      pill.className = 'ahead-pill' + (item.value >= 10 ? ' is-hot' : '') + (i === 0 ? ' is-first' : '');
      pill.textContent = fmt(item.value) + '×';

      const small = document.createElement('small');
      small.textContent = 'n°' + item.position;
      pill.appendChild(small);

      el.ahead.appendChild(pill);
    }
    el.count.textContent = list.length + ' valeurs';
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
