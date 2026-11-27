/*
 * Bot de prédiction — Under / Over 7.
 *
 * Le bot n'a AUCUN accès à l'avenir : il annonce l'issue la plus probable selon une
 * stratégie, puis se note lui-même sur les tirages réels déjà enregistrés (backtest).
 * Son taux de réussite doit converger vers 41,7 % (−7/+7) ou 16,7 % (7) : c'est la preuve
 * qu'aucun historique ne permet de prédire le tirage suivant.
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
  const STRATS = ['major', 'follow', 'against', 'seven'];
  const STRAT_NAMES = {
    major: 'Majorité historique',
    follow: 'Suivre la dernière issue',
    against: 'Contre la dernière issue',
    seven: 'Toujours le 7',
  };
  const MAX_ROWS = 15;

  const pctTxt = (v) => (v * 100).toFixed(1).replace('.', ',') + ' %';
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
    scores: id('scores'),
    scoreSub: id('score-sub'),
    rows: id('rows'),
    wrap: id('wrap'),
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

  // ---------- Moteur de prédiction ----------
  // history : tableau de manches, la plus récente en premier
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
    for (let i = 0; i < 3; i++) {
      const k = ['under', 'seven', 'over'][i];
      if (counts[k] > bestVal) { bestVal = counts[k]; best = k; }
    }
    return best;
  }

  // Backtest : pour chaque manche, on prédit avec les manches ANTÉRIEURES uniquement
  function backtest(rounds, strategy) {
    let hits = 0;
    let total = 0;
    const rows = [];

    for (let i = rounds.length - 1; i >= 0; i--) {
      const history = rounds.slice(i + 1);
      if (!history.length && strategy !== 'seven') continue;
      const pred = pick(history, strategy);
      const ok = pred === rounds[i].outcome;
      if (ok) hits += 1;
      total += 1;
      rows.push({ round: rounds[i], pred: pred, ok: ok });
    }

    rows.reverse(); // du plus récent au plus ancien
    return { hits: hits, total: total, rows: rows };
  }

  function clock(ts) {
    const d = new Date(ts);
    const hm = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    if (d.toDateString() === new Date().toDateString()) return hm;
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) + ' ' + hm;
  }

  function cell(text, cls) {
    const td = document.createElement('td');
    if (cls) td.className = cls;
    td.textContent = text;
    return td;
  }

  function pill(outcome) {
    const s = document.createElement('span');
    s.className = 'pill ' + outcome;
    s.textContent = SIGN[outcome];
    return s;
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

    // ---------- Prédiction du prochain tirage
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

    // ---------- Score de chaque stratégie
    el.scores.textContent = '';
    for (let i = 0; i < STRATS.length; i++) {
      const st = STRATS[i];
      const bt = backtest(rounds, st);
      const ref = st === 'seven' ? PROB.seven : PROB.under;
      const rate = bt.total ? bt.hits / bt.total : 0;
      const gap = bt.total ? (rate - ref) * 100 : 0;

      const row = document.createElement('div');
      row.className = 'score-row' + (st === strategy ? ' is-active' : '');

      const name = document.createElement('span');
      name.className = 'score-name';
      name.textContent = STRAT_NAMES[st];

      const hits = document.createElement('span');
      hits.className = 'score-hits';
      hits.textContent = bt.hits + '/' + bt.total;

      const pct = document.createElement('span');
      pct.className = 'score-pct';
      pct.textContent = bt.total ? pctTxt(rate) : '—';

      const gapEl = document.createElement('span');
      gapEl.className = 'score-gap';
      gapEl.textContent = bt.total
        ? 'réf. ' + pct2(ref) + ' · écart ' + (gap >= 0 ? '+' : '') + gap.toFixed(1) + ' pt'
        : 'réf. ' + pct2(ref);

      row.append(name, hits, pct, gapEl);
      el.scores.appendChild(row);
    }

    // ---------- Tableau prédiction / réel
    const bt = backtest(rounds, strategy);
    const list = bt.rows.slice(0, MAX_ROWS);

    el.rows.textContent = '';
    const frag = document.createDocumentFragment();

    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      const tr = document.createElement('tr');
      tr.appendChild(cell('num', '#' + r.round.n));
      tr.appendChild(cell('', clock(r.round.ts)));

      const predTd = document.createElement('td');
      predTd.appendChild(pill(r.pred));
      predTd.appendChild(document.createTextNode(' ' + NAME[r.pred]));
      tr.appendChild(predTd);

      const realTd = document.createElement('td');
      realTd.appendChild(pill(r.round.outcome));
      realTd.appendChild(document.createTextNode(' ' + NAME[r.round.outcome]));
      tr.appendChild(realTd);

      tr.appendChild(cell('', String(r.round.sum)));

      const markTd = document.createElement('td');
      markTd.className = 'mark ' + (r.ok ? 'ok' : 'ko');
      markTd.textContent = r.ok ? '✓' : '✗';
      tr.appendChild(markTd);

      frag.appendChild(tr);
    }

    el.rows.appendChild(frag);
    el.wrap.classList.toggle('is-empty', list.length === 0);
    el.scoreSub.textContent = bt.total + (bt.total > 1 ? ' tirages évalués' : ' tirage évalué');

    if (lastCount >= 0 && total > lastCount) flashLive(total - lastCount);
    if (lastCount < 0 && total > 0) el.live.textContent = 'en direct';
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

