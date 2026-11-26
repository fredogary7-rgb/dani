/*
 * Tableau des résultats — Under / Over 7.
 * Affiche les tirages RÉELS enregistrés par le jeu, notés −7 / 7 / +7,
 * avec compteurs, séries et probabilités du prochain tirage (fixes, non prédictives).
 */
(() => {
  'use strict';

  const KEY = 'under-over-seven-results-v1';
  const SIGN = { under: '−7', seven: '7', over: '+7' };
  const NAME = { under: 'moins de 7', seven: 'sept exact', over: 'plus de 7' };
  const OUTCOMES = ['under', 'seven', 'over'];

  const nf0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
  const pctTxt = (v) => (v * 100).toFixed(1).replace('.', ',') + ' %';
  const id = (x) => document.getElementById(x);

  const el = {
    hero: id('hero'),
    sign: id('hero-sign'),
    sub: id('hero-sub'),
    time: id('hero-time'),
    live: id('live'),
    strip: id('strip'),
    empty: id('strip-empty'),
    total: id('total-label'),
    count: { under: id('count-under'), seven: id('count-seven'), over: id('count-over') },
    pct: { under: id('pct-under'), seven: id('pct-seven'), over: id('pct-over') },
    streak: { under: id('streak-under'), seven: id('streak-seven'), over: id('streak-over') },
    best: { under: id('best-under'), seven: id('best-seven'), over: id('best-over') },
    last: { under: id('last-under'), seven: id('last-seven'), over: id('last-over') },
    bar: { under: id('bar-under'), seven: id('bar-seven'), over: id('bar-over') },
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

  function clock(ts) {
    const d = new Date(ts);
    const hm = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    if (d.toDateString() === new Date().toDateString()) return hm;
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) + ' ' + hm;
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
    const total = rounds.length;
    const last = rounds[0];

    // ---- Dernier tirage
    el.hero.classList.remove('is-under', 'is-seven', 'is-over');
    if (last) {
      el.hero.classList.add('is-' + last.outcome);
      el.sign.textContent = SIGN[last.outcome];
      el.sub.textContent = 'somme ' + last.sum + ' · dés ' + last.d1 + ' + ' + last.d2;
      el.time.textContent = NAME[last.outcome] + ' — ' + clock(last.ts);
    } else {
      el.sign.textContent = '—';
      el.sub.textContent = 'aucun tirage enregistré';
      el.time.textContent = '';
    }

    // ---- Compteurs, séries
    const counts = { under: 0, seven: 0, over: 0 };
    const firstIdx = { under: -1, seven: -1, over: -1 };

    for (let i = 0; i < total; i++) {
      const o = rounds[i].outcome;
      if (counts[o] === undefined) continue;
      counts[o] += 1;
      if (firstIdx[o] < 0) firstIdx[o] = i;
    }

    const current = { under: 0, seven: 0, over: 0 };
    if (last) {
      const o = last.outcome;
      for (let i = 0; i < total && rounds[i].outcome === o; i++) current[o] += 1;
    }

    const best = { under: 0, seven: 0, over: 0 };
    let run = 0;
    let prev = null;
    for (let i = 0; i < total; i++) {
      const o = rounds[i].outcome;
      if (o === prev) run += 1;
      else { run = 1; prev = o; }
      if (best[o] !== undefined && run > best[o]) best[o] = run;
    }

    for (let i = 0; i < OUTCOMES.length; i++) {
      const o = OUTCOMES[i];
      el.count[o].textContent = nf0.format(counts[o]);
      el.pct[o].textContent = total ? pctTxt(counts[o] / total) : '0 %';
      el.streak[o].textContent = current[o];
      el.best[o].textContent = best[o];
      el.bar[o].style.width = total ? ((counts[o] / total) * 100).toFixed(1) + '%' : '0%';
      el.last[o].textContent = firstIdx[o] >= 0 ? clock(rounds[firstIdx[o]].ts) : '—';
    }

    // ---- Bande des 40 derniers
    el.strip.textContent = '';
    const frag = document.createDocumentFragment();
    for (let i = 0; i < Math.min(total, 40); i++) {
      const r = rounds[i];
      const pill = document.createElement('span');
      pill.className = 'pill ' + r.outcome + (i === 0 ? ' is-last' : '');
      pill.textContent = SIGN[r.outcome];
      const small = document.createElement('small');
      small.textContent = r.sum;
      pill.appendChild(small);
      frag.appendChild(pill);
    }
    el.strip.appendChild(frag);
    el.strip.style.display = total ? '' : 'none';
    el.empty.style.display = total ? 'none' : 'block';

    el.total.textContent = nf0.format(total) + (total > 1 ? ' tours' : ' tour');

    if (lastCount >= 0 && total > lastCount) flashLive(total - lastCount);
    if (lastCount < 0 && total > 0) el.live.textContent = 'en direct';
    lastCount = total;
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) render();
  });
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) render();
  });

  render();
  setInterval(() => { if (!document.hidden) render(); }, 1500);
})();
