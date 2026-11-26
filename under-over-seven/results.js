/*
 * Page « Résultats » de Under & Over 7.
 * Lit le journal écrit par game.js dans localStorage (clé partagée) et l'affiche :
 * KPI, répartition des sommes, journal détaillé des tours.
 */
(() => {
  'use strict';

  const KEY = 'under-over-seven-results-v1';
  const WAYS = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };
  const LABELS = { under: 'Under 7', seven: 'Sept exact', over: 'Over 7' };
  const MAX_ROWS = 200;

  const nf0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
  const money = (v) => nf0.format(Math.round(v)) + ' FCFA';
  const pctTxt = (v) => (v * 100).toFixed(1).replace('.', ',') + ' %';

  const el = {
    live: document.getElementById('live'),
    clear: document.getElementById('clear-btn'),
    rounds: document.getElementById('kpi-rounds'),
    last: document.getElementById('kpi-last'),
    under: document.getElementById('kpi-under'),
    underPct: document.getElementById('kpi-under-pct'),
    seven: document.getElementById('kpi-seven'),
    sevenPct: document.getElementById('kpi-seven-pct'),
    over: document.getElementById('kpi-over'),
    overPct: document.getElementById('kpi-over-pct'),
    rtp: document.getElementById('kpi-rtp'),
    net: document.getElementById('kpi-net'),
    dist: document.getElementById('dist'),
    rows: document.getElementById('rows'),
    wrap: document.querySelector('.table-wrap'),
    countLabel: document.getElementById('count-label'),
  };

  const distRows = {};

  function buildDist() {
    el.dist.textContent = '';
    for (let s = 2; s <= 12; s++) {
      const row = document.createElement('div');
      row.className = 'dist-row';

      const sum = document.createElement('span');
      sum.className = 'dist-sum';
      sum.textContent = s;

      const track = document.createElement('div');
      track.className = 'dist-track';
      const bar = document.createElement('div');
      bar.className = 'dist-bar';
      const mark = document.createElement('div');
      mark.className = 'dist-mark';
      track.append(bar, mark);

      const val = document.createElement('span');
      val.className = 'dist-val';
      val.title = 'théorie : ' + pctTxt(WAYS[s] / 36);

      row.append(sum, track, val);
      el.dist.appendChild(row);
      distRows[s] = { bar: bar, mark: mark, val: val };
    }
  }

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

  function timeLabel(ts) {
    const d = new Date(ts);
    const hm = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    if (d.toDateString() === new Date().toDateString()) return hm;
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) + ' ' + hm;
  }

  function cell(className, text) {
    const td = document.createElement('td');
    if (className) td.className = className;
    td.textContent = text;
    return td;
  }

  let lastCount = -1;
  let liveTimer = 0;

  function flashLive(n) {
    el.live.textContent = n > 1 ? '+' + n + ' tours' : 'nouveau tour';
    el.live.classList.add('is-new');
    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => {
      el.live.textContent = 'à jour';
      el.live.classList.remove('is-new');
    }, 1800);
  }

  function render() {
    const rounds = load();
    const total = rounds.length;

    // ---- KPI
    const counts = { under: 0, seven: 0, over: 0 };
    const sums = new Array(13).fill(0);
    let staked = 0;
    let won = 0;

    for (let i = 0; i < total; i++) {
      const r = rounds[i];
      if (counts[r.outcome] !== undefined) counts[r.outcome] += 1;
      if (r.sum >= 2 && r.sum <= 12) sums[r.sum] += 1;
      staked += Number(r.stake) || 0;
      won += Number(r.win) || 0;
    }

    el.rounds.textContent = nf0.format(total);
    el.under.textContent = nf0.format(counts.under);
    el.underPct.textContent = total ? pctTxt(counts.under / total) : '0 %';
    el.seven.textContent = nf0.format(counts.seven);
    el.sevenPct.textContent = total ? pctTxt(counts.seven / total) : '0 %';
    el.over.textContent = nf0.format(counts.over);
    el.overPct.textContent = total ? pctTxt(counts.over / total) : '0 %';

    const last = rounds[0];
    el.last.textContent = last
      ? 'dernier : ' + last.d1 + ' + ' + last.d2 + ' = ' + last.sum
      : 'dernier : —';

    el.rtp.textContent = staked > 0 ? pctTxt(won / staked) : '—';
    const net = won - staked;
    el.net.textContent = 'net : ' + (net > 0 ? '+' : '') + money(net);
    el.net.style.color = net > 0 ? '#55e39a' : net < 0 ? '#ff7f8a' : '';

    // ---- Répartition des sommes
    let maxEmp = 0;
    for (let s = 2; s <= 12; s++) {
      const emp = total ? sums[s] / total : 0;
      if (emp > maxEmp) maxEmp = emp;
    }
    for (let s = 2; s <= 12; s++) {
      const emp = total ? sums[s] / total : 0;
      const ref = distRows[s];
      ref.bar.style.width = (maxEmp > 0 ? (emp / maxEmp) * 100 : 0).toFixed(1) + '%';
      const markPos = maxEmp > 0 ? Math.min(1, (WAYS[s] / 36) / maxEmp) * 100 : 0;
      ref.mark.style.left = 'calc(' + markPos.toFixed(1) + '% - 1px)';

      ref.val.textContent = '';
      const b = document.createElement('b');
      b.textContent = nf0.format(sums[s]);
      const rest = document.createElement('span');
      rest.textContent = ' · ' + (total ? pctTxt(emp) : '0 %');
      ref.val.append(b, rest);
    }

    // ---- Journal
    el.countLabel.textContent = nf0.format(total) + (total > 1 ? ' tours' : ' tour');
    el.rows.textContent = '';
    const frag = document.createDocumentFragment();

    for (let i = 0; i < Math.min(total, MAX_ROWS); i++) {
      const r = rounds[i];
      const tr = document.createElement('tr');
      tr.appendChild(cell('num', '#' + r.n));
      tr.appendChild(cell('', timeLabel(r.ts)));
      tr.appendChild(cell('', String(r.d1)));
      tr.appendChild(cell('', String(r.d2)));

      const sumTd = document.createElement('td');
      const pill = document.createElement('span');
      pill.className = 'sum-pill sum-' + (LABELS[r.outcome] ? r.outcome : 'under');
      pill.textContent = r.sum;
      sumTd.appendChild(pill);
      tr.appendChild(sumTd);

      tr.appendChild(cell('', LABELS[r.outcome] || '—'));
      tr.appendChild(cell('', r.stake ? money(r.stake) : '—'));

      if (!r.stake) {
        tr.appendChild(cell('muted', '—'));
      } else if (r.win > 0) {
        tr.appendChild(cell('pos', '+ ' + money(r.win - r.stake)));
      } else {
        tr.appendChild(cell('neg', '- ' + money(r.stake)));
      }

      frag.appendChild(tr);
    }

    el.rows.appendChild(frag);
    el.wrap.classList.toggle('is-empty', total === 0);

    if (lastCount >= 0 && total > lastCount) flashLive(total - lastCount);
    lastCount = total;
  }

  el.clear.addEventListener('click', () => {
    if (!window.confirm('Effacer tout le journal des tours ?')) return;
    try { localStorage.removeItem(KEY); } catch (err) { /* ignore */ }
    lastCount = -1;
    el.live.textContent = 'à jour';
    el.live.classList.remove('is-new');
    render();
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) render();
  });
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) render();
  });

  buildDist();
  render();
  setInterval(() => { if (!document.hidden) render(); }, 1500);
})();

