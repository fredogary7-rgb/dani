/*
 * Page bot du Crash.
 *
 * 1) Si le serveur de démo répond (/api/crash) : le bot affiche la manche en cours telle
 *    qu'elle tourne côté serveur — même si la page du jeu est fermée, et depuis un autre
 *    appareil du réseau (mêmes tours, mêmes valeurs).
 * 2) Sinon (fichier ouvert sans serveur) : il lit la file locale via GameScript.
 */
(() => {
  'use strict';

  const API = '/api/crash';
  const SCRIPT_KEY = 'crash-script-v1';

  const id = (x) => document.getElementById(x);
  const el = {
    live: id('live'),
    pred: id('pred'),
    value: id('pred-value'),
    detail: id('pred-detail'),
    ahead: id('ahead'),
    count: id('ahead-count'),
  };

  const fmt = (v) => Number(v).toFixed(2);
  let timer = 0;

  function label(v) {
    if (v < 1.5) return 'crash quasi immédiat';
    if (v < 2) return 'crash rapide';
    if (v < 5) return 'crash moyen';
    if (v < 10) return 'bon multiplicateur';
    return 'gros multiplicateur';
  }

  function setValue(v) {
    el.value.textContent = fmt(v);
    el.pred.classList.toggle('is-hot', v >= 10);
  }

  function renderAhead(list) {
    el.ahead.textContent = '';
    for (let i = 0; i < list.length; i++) {
      const pill = document.createElement('span');
      pill.className = 'ahead-pill' + (list[i].value >= 10 ? ' is-hot' : '') + (i === 0 ? ' is-first' : '');
      pill.textContent = fmt(list[i].value) + '×';

      const small = document.createElement('small');
      small.textContent = 'n°' + list[i].pos;
      pill.appendChild(small);

      el.ahead.appendChild(pill);
    }
    el.count.textContent = list.length + ' valeurs';
  }

  // ---------- Mode serveur ----------
  function renderServer(data) {
    const r = data.round;
    const crashed = r.phase === 'crashed';
    const target = crashed && data.next && data.next.length
      ? data.next[0]
      : { value: r.crashAt, pos: r.pos };

    setValue(target.value);

    if (r.phase === 'waiting') {
      const left = Math.max(0, (r.endsAt - data.serverTime) / 1000);
      el.detail.textContent = label(target.value) + ' · mise ouverte · ' + left.toFixed(1) + ' s';
      el.live.textContent = 'en direct';
    } else if (r.phase === 'flying') {
      el.detail.textContent = 'en vol · ' + fmt(r.mult) + '× → crash à ' + fmt(r.crashAt) + '×';
      el.live.textContent = 'en vol';
    } else {
      el.detail.textContent = 'crashé à ' + fmt(r.crashAt) + '× · prochaine manche dans ' +
        Math.max(0, (r.endsAt - data.serverTime) / 1000).toFixed(1) + ' s';
      el.live.textContent = 'nouvelle manche';
    }

    renderAhead(data.next || []);
  }

  // ---------- Mode local (sans serveur) ----------
  function renderLocal() {
    if (!window.GameScript) {
      el.value.textContent = '—';
      el.detail.textContent = 'programme indisponible';
      el.ahead.textContent = '';
      return;
    }
    const next = window.GameScript.peek();
    setValue(next.value);
    el.detail.textContent = label(next.value) + ' · ' + fmt(next.value) + '×';
    el.live.textContent = 'hors serveur';
    renderAhead(window.GameScript.ahead(5).map((x) => ({ value: x.value, pos: x.position })));
  }

  async function poll() {
    try {
      const res = await fetch(API, { cache: 'no-store' });
      if (!res.ok) throw new Error('http ' + res.status);
      const data = await res.json();
      if (!data || !data.round) throw new Error('payload');
      renderServer(data);
    } catch (err) {
      renderLocal();
    }
    timer = setTimeout(poll, 700);
  }

  window.addEventListener('storage', (e) => {
    if (e.key === SCRIPT_KEY) renderLocal();
  });

  poll();
})();
