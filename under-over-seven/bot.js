/*
 * Bot de prédiction — Under / Over 7.
 *
 * Annonce l'issue la plus probable de la prochaine manche selon la stratégie choisie,
 * à partir de l'historique local des tirages. La page n'affiche que la prédiction :
 * la confiance indiquée est la probabilité réelle de l'issue (41,67 % / 16,67 %).
 */
(() => {
  'use strict';

  const KEY = 'under-over-seven-results-v1';
  const SIGN = { under: '−7', seven: '7', over: '+7' };
  const NAME = { under: 'Moins de 7', seven: 'Sept exact', over: 'Plus de 7' };
  const PROB = { under: 15 / 36, seven: 6 / 36, over: 15 / 36 };
  const SAMPLE = {
    under: { sum: 6, d1: 3, d2: 3 },
    seven: { sum: 7, d1: 3, d2: 4 },
    over: { sum: 8, d1: 4, d2: 4 },
  };

  const pct2 = (v) => (v * 100).toFixed(2).replace('.', ',') + ' %';
  const id = (x) => document.getElementById(x);

  const el = {
    live: id('live'),
    pred: id('pred'),
    sign: id('pred-sign'),
    detail: id('pred-detail'),
    conf: id('pred-conf'),
    bar: id('pred-bar'),
    strategy: id('strategy'),
  };

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return [];
      const data = JSON.parse(raw);
      return Array.isArray(data && data.rounds) ? data.rounds : [];
    } catch (err) {
      return [];
    }
  }

  // history : manches du plus récent au plus ancien
  function pick(history, strategy) {
    if (strategy === 'seven') return 'seven';
    if (!history.length) return 'under';

    const last = history[0].outcome;
    if (strategy === 'follow') return last;
    if (strategy === 'against') {
      if (last === 'under') return 'over';
      if (last === 'over') return 'under';
      return 'under';
    }

    const counts = { under: 0, seven: 0, over: 0 };
    for (let i = 0; i < history.length; i++) {
      if (counts[history[i].outcome] !== undefined) counts[history[i].outcome] += 1;
    }
    let best = 'under';
    let bestVal = -1;
    const keys = ['under', 'seven', 'over'];
    for (let i = 0; i < keys.length; i++) {
      if (counts[keys[i]] > bestVal) { bestVal = counts[keys[i]]; best = keys[i]; }
    }
    return best;
  }

  let lastCount = -1;
  let liveTimer = 0;

  function flashLive(n) {
    el.live.textContent = n > 1 ? '+' + n + ' tirages' : 'nouveau tirage';
    el.live.classList.add('is-new');
    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => {
      el.live.textContent = 'en direct';
      el.live.classList.remove('is-new');
    }, 1800);
  }

  function render() {
    const rounds = load();
    const strategy = el.strategy.value;
    const total = rounds.length;
    const pred = pick(rounds, strategy);

    el.pred.classList.remove('is-under', 'is-seven', 'is-over');
    el.pred.classList.add('is-' + pred);
    el.sign.textContent = SIGN[pred];

    const sample = SAMPLE[pred];
    el.detail.textContent = NAME[pred] + ' · exemple somme ' + sample.sum +
      ' (' + sample.d1 + ' + ' + sample.d2 + ')' +
      (total ? '' : ' · aucun historique');

    el.conf.textContent = pct2(PROB[pred]);
    el.bar.style.width = (PROB[pred] * 100).toFixed(1) + '%';

    if (lastCount >= 0 && total > lastCount) flashLive(total - lastCount);
    if (lastCount < 0) el.live.textContent = total > 0 ? 'en direct' : 'en attente';
    lastCount = total;
  }

  el.strategy.addEventListener('change', render);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) render();
  });
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) render();
  });

  render();
  setInterval(() => { if (!document.hidden) render(); }, 1500);
})();
