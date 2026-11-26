/*
 * Under & Over 7 — démo technique (argent fictif, aucun lien avec un opérateur).
 *
 * Règles : deux dés à six faces, somme de 2 à 12.
 *   Under 7 (2..6)  : 15/36 -> payé ×2
 *   Sept exact      :  6/36 -> payé ×5
 *   Over 7 (8..12)  : 15/36 -> payé ×2
 *   => RTP = 15/36×2 = 6/36×5 = 0,8333 (avantage maison 16,67 %)
 */
(() => {
  'use strict';

  const CFG = {
    betWindowMs: 9000,
    rollMs: 2100,
    holdMs: 3400,
    startBalance: 1000,
    maxHistory: 12,
    minChip: 10,
    payouts: { under: 2, seven: 5, over: 2 },
    storageKey: 'under-over-seven-demo-v1',
  };

  const $ = (sel) => document.querySelector(sel);

  const ui = {
    balance: $('#balance'),
    resetBtn: $('#reset-btn'),
    soundBtn: $('#sound-btn'),
    history: $('#history'),
    phaseTag: $('#phase-tag'),
    timer: $('#timer'),
    sumValue: $('#sum-value'),
    sumOutcome: $('#sum-outcome'),
    zones: Array.prototype.slice.call(document.querySelectorAll('.zone')),
    zoneStake: {
      under: $('#zone-stake-under'),
      seven: $('#zone-stake-seven'),
      over: $('#zone-stake-over'),
    },
    chips: $('#chips'),
    chipLabel: $('#chip-label'),
    stakeUnder: $('#stake-under'),
    stakeSeven: $('#stake-seven'),
    stakeOver: $('#stake-over'),
    stakeTotal: $('#stake-total'),
    rollBtn: $('#roll-btn'),
    hint: $('#hint'),
    clearBtn: $('#clear-btn'),
    rebetBtn: $('#rebet-btn'),
    roundFill: $('#round-fill'),
    footLeft: $('#foot-left'),
    canvas: $('#dice-canvas'),
  };

  // ---------- Formatage ----------
  const nf2 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nf0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
  const money = (v) => nf2.format(v) + ' €';
  const round2 = (v) => Math.round(v * 100) / 100;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  // Horloge : le temps passé onglet masqué ne s'écoule pas (le tour se met en pause)
  const Clock = {
    offset: 0,
    hiddenAt: 0,
    now() { return performance.now() - this.offset; },
  };

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      Clock.hiddenAt = performance.now();
    } else if (Clock.hiddenAt) {
      Clock.offset += performance.now() - Clock.hiddenAt;
      Clock.hiddenAt = 0;
    }
  });

  // ---------- État ----------
  const S = {
    phase: 'betting', // betting | rolling | result
    balance: CFG.startBalance,
    bets: { under: 0, seven: 0, over: 0 },
    lastBets: null,
    chip: 100,
    d1: 1,
    d2: 1,
    sum: null,
    outcome: null,
    history: [],
    rounds: 0,
    sound: true,
    rafId: 0,
    timerId: 0,
  };

  function loadBalance() {
    try {
      const raw = localStorage.getItem(CFG.storageKey);
      if (!raw) return CFG.startBalance;
      const parsed = JSON.parse(raw);
      const b = Number(parsed && parsed.balance);
      if (Number.isFinite(b) && b > 0) return b;
    } catch (err) { /* stockage indisponible */ }
    return CFG.startBalance;
  }

  function saveBalance() {
    try {
      localStorage.setItem(CFG.storageKey, JSON.stringify({ balance: round2(S.balance) }));
    } catch (err) { /* mode privé */ }
  }

  function setBalance(v) {
    S.balance = round2(Math.max(0, v));
    ui.balance.textContent = money(S.balance);
    saveBalance();
  }

  // ---------- Sons ----------
  const Sound = (() => {
    let ctx = null;

    function ac() {
      if (!S.sound) return null;
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }

    function tone(freq, dur, type, vol, toFreq) {
      const a = ac();
      if (!a) return;
      const t0 = a.currentTime;
      const osc = a.createOscillator();
      const gain = a.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      if (toFreq) osc.frequency.exponentialRampToValueAtTime(toFreq, t0 + dur);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain).connect(a.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    }

    function noise(dur, vol, cutoff, when) {
      const a = ac();
      if (!a) return;
      const t0 = a.currentTime + (when || 0);
      const len = Math.max(1, Math.floor(a.sampleRate * dur));
      const buffer = a.createBuffer(1, len, a.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = a.createBufferSource();
      src.buffer = buffer;
      const filter = a.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = cutoff || 2200;
      filter.Q.value = 1.1;
      const gain = a.createGain();
      gain.gain.value = vol;
      src.connect(filter).connect(gain).connect(a.destination);
      src.start(t0);
    }

    return {
      unlock() { ac(); },
      chip() { tone(940, 0.05, 'square', 0.05, 620); },
      rattle() {
        for (let i = 0; i < 7; i++) noise(0.05, 0.10, 2400 + Math.random() * 1800, i * 0.085);
      },
      knock() {
        tone(150, 0.12, 'sine', 0.16, 70);
        noise(0.09, 0.12, 900);
      },
      win() {
        tone(660, 0.11, 'sine', 0.13, 880);
        setTimeout(() => tone(990, 0.16, 'sine', 0.11, 1320), 90);
      },
      lose() {
        tone(220, 0.22, 'sine', 0.09, 130);
      },
      seven() {
        tone(520, 0.1, 'triangle', 0.12, 780);
        setTimeout(() => tone(780, 0.1, 'triangle', 0.12, 1040), 90);
        setTimeout(() => tone(1040, 0.18, 'triangle', 0.11, 1560), 180);
      },
    };
  })();

  // ---------- Dés 3D (projection isométrique, 100 % canvas) ----------
  const Dice = (() => {
    const canvas = ui.canvas;
    const ctx = canvas.getContext('2d');
    let w = 0;
    let h = 0;
    let raf = 0;
    let rollStart = 0;
    let onDone = null;
    let finals = [1, 1];
    let knocks = 0;

    const dice = [
      { x: 0, y: 0, hop: 0, rot: 0, squash: 1, faces: { top: 1, left: 2, right: 3 } },
      { x: 0, y: 0, hop: 0, rot: 0, squash: 1, faces: { top: 6, left: 5, right: 4 } },
    ];

    const PIP_LAYOUT = {
      1: [[0.5, 0.5]],
      2: [[0.28, 0.28], [0.72, 0.72]],
      3: [[0.28, 0.28], [0.5, 0.5], [0.72, 0.72]],
      4: [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]],
      5: [[0.28, 0.28], [0.72, 0.28], [0.5, 0.5], [0.28, 0.72], [0.72, 0.72]],
      6: [[0.28, 0.24], [0.72, 0.24], [0.28, 0.5], [0.72, 0.5], [0.28, 0.76], [0.72, 0.76]],
    };

    function facesFor(v) {
      return { top: v, left: (v % 6) + 1, right: ((v + 1) % 6) + 1 };
    }

    function radius() {
      return clamp(Math.min(w * 0.15, h * 0.3), 22, 60);
    }

    function layout() {
      const r = radius();
      const gap = r * 3.1;
      dice[0].x = w / 2 - gap / 2;
      dice[1].x = w / 2 + gap / 2;
      dice[0].y = h * 0.58;
      dice[1].y = h * 0.58;
    }

    function resize() {
      const rect = canvas.parentElement.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = Math.max(120, rect.width);
      h = Math.max(120, rect.height);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      layout();
      render();
    }

    function facePath(pts) {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();
    }

    function drawPips(o, u, v, value, r) {
      const pts = PIP_LAYOUT[value] || PIP_LAYOUT[1];
      const pr = Math.max(2, r * 0.084);
      for (let i = 0; i < pts.length; i++) {
        const x = o[0] + u[0] * pts[i][0] + v[0] * pts[i][1];
        const y = o[1] + u[1] * pts[i][0] + v[1] * pts[i][1];
        const g = ctx.createRadialGradient(x - pr * 0.35, y - pr * 0.35, pr * 0.1, x, y, pr);
        if (value === 1) {
          g.addColorStop(0, '#e4635a');
          g.addColorStop(1, '#9c1c19');
        } else {
          g.addColorStop(0, '#4d545e');
          g.addColorStop(1, '#12171c');
        }
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, pr, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function drawDie(d) {
      const r = radius();
      const ax = 0.866 * r;
      const ay = 0.5 * r;
      const cz = r;
      const cy = d.y - d.hop;

      // Ombre portée sur le tapis
      const shrink = clamp(1 - d.hop / (r * 3.4), 0.4, 1);
      const sy = d.y + ay * 1.03;
      const shadow = ctx.createRadialGradient(d.x, sy, 0, d.x, sy, ax * 1.75);
      shadow.addColorStop(0, 'rgba(0,0,0,' + (0.5 * shrink).toFixed(3) + ')');
      shadow.addColorStop(0.65, 'rgba(0,0,0,' + (0.22 * shrink).toFixed(3) + ')');
      shadow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = shadow;
      ctx.beginPath();
      ctx.ellipse(d.x, sy, ax * 1.75 * shrink, ay * 1.15 * shrink, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.translate(d.x, cy);
      ctx.rotate(d.rot);
      ctx.scale(1, d.squash);

      const P = (x, y, z) => [(x - y) * ax, (x + y) * ay - z * cz];
      const A = P(0, 1, 0);
      const B = P(1, 1, 0);
      const C = P(1, 1, 1);
      const D = P(0, 1, 1);
      const E = P(1, 0, 0);
      const F = P(1, 0, 1);
      const G = P(0, 0, 1);
      const H = P(1, 1, 1);
      const I = P(0, 1, 1);
      const J = P(1, 0, 1);

      const faces = [
        {
          pts: [A, B, C, D],
          o: A, u: [B[0] - A[0], B[1] - A[1]], v: [D[0] - A[0], D[1] - A[1]],
          value: d.faces.left, c0: '#ece8dd', c1: '#d1cdbf',
        },
        {
          pts: [E, B, C, F],
          o: E, u: [B[0] - E[0], B[1] - E[1]], v: [F[0] - E[0], F[1] - E[1]],
          value: d.faces.right, c0: '#fbf9f3', c1: '#e2ded0',
        },
        {
          pts: [G, J, H, I],
          o: G, u: [J[0] - G[0], J[1] - G[1]], v: [I[0] - G[0], I[1] - G[1]],
          value: d.faces.top, c0: '#ffffff', c1: '#f1ede2',
        },
      ];

      for (let i = 0; i < faces.length; i++) {
        const f = faces[i];
        const grad = ctx.createLinearGradient(f.pts[0][0], f.pts[0][1], f.pts[2][0], f.pts[2][1]);
        grad.addColorStop(0, f.c0);
        grad.addColorStop(1, f.c1);

        facePath(f.pts);
        ctx.fillStyle = grad;
        ctx.strokeStyle = grad;
        ctx.lineJoin = 'round';
        ctx.lineWidth = r * 0.1;
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(f.pts[0][0], f.pts[0][1]);
        ctx.lineTo(f.pts[1][0], f.pts[1][1]);
        ctx.strokeStyle = 'rgba(0,0,0,0.10)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      for (let i = 0; i < faces.length; i++) {
        drawPips(faces[i].o, faces[i].u, faces[i].v, faces[i].value, r);
      }

      ctx.restore();
    }

    function render() {
      ctx.clearRect(0, 0, w, h);
      drawDie(dice[0]);
      drawDie(dice[1]);
    }

    function frame() {
      const p = clamp((Clock.now() - rollStart) / CFG.rollMs, 0, 1);
      const r = radius();

      for (let i = 0; i < dice.length; i++) {
        const d = dice[i];
        const ph = clamp((p - i * 0.06) / (1 - i * 0.06), 0, 1);
        const air = Math.abs(Math.sin(ph * Math.PI * 2));
        d.hop = air * r * 1.15 * (1 - ph * 0.35);
        d.rot = Math.pow(1 - ph, 1.7) * Math.PI * 5 * (i ? -1 : 1);
        d.squash = 1 - 0.2 * Math.max(0, 1 - air * 6) * (1 - Math.pow(p, 8));
        d.faces = ph < 0.86
          ? facesFor(1 + ((Math.floor(ph * 26) * 3 + i * 2) % 6))
          : facesFor(finals[i]);
      }

      if (p >= 0.5 && knocks < 1) { knocks = 1; Sound.knock(); }
      if (p >= 0.995 && knocks < 2) { knocks = 2; Sound.knock(); }

      render();

      if (p < 1) {
        raf = requestAnimationFrame(frame);
      } else {
        for (let i = 0; i < dice.length; i++) {
          dice[i].hop = 0;
          dice[i].rot = 0;
          dice[i].squash = 1;
          dice[i].faces = facesFor(finals[i]);
        }
        render();
        const cb = onDone;
        onDone = null;
        if (cb) cb();
      }
    }

    return {
      init() {
        resize();
        if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas.parentElement);
        window.addEventListener('resize', resize);
      },
      roll(d1, d2, done) {
        finals = [d1, d2];
        onDone = done;
        knocks = 0;
        rollStart = Clock.now();
        Sound.rattle();
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(frame);
      },
      reset(d1, d2) {
        cancelAnimationFrame(raf);
        finals = [d1 || 1, d2 || 1];
        dice[0].faces = facesFor(finals[0]);
        dice[1].faces = facesFor(finals[1]);
        for (let i = 0; i < dice.length; i++) {
          dice[i].hop = 0;
          dice[i].rot = 0;
          dice[i].squash = 1;
        }
        layout();
        render();
      },
    };
  })();

  // ---------- Rendu de l'interface ----------
  function setHint(text, kind) {
    ui.hint.textContent = text;
    ui.hint.className = 'hint' + (kind ? ' is-' + kind : '');
  }

  function renderChips() {
    for (let i = 0; i < ui.chips.children.length; i++) {
      const btn = ui.chips.children[i];
      btn.classList.toggle('is-active', Number(btn.dataset.chip) === S.chip);
    }
    ui.chipLabel.textContent = 'Jeton ' + nf0.format(S.chip) + ' €';
  }

  function totalStake() {
    return S.bets.under + S.bets.seven + S.bets.over;
  }

  function renderBets() {
    const zones = ['under', 'seven', 'over'];
    for (let i = 0; i < zones.length; i++) {
      const z = zones[i];
      const stake = S.bets[z];
      ui.zoneStake[z].textContent = stake ? money(stake) : '—';
      ui.zoneStake[z].classList.toggle('is-empty', stake === 0);
    }
    ui.zones.forEach((el) => {
      el.classList.toggle('has-bet', S.bets[el.dataset.zone] > 0);
    });

    ui.stakeUnder.textContent = money(S.bets.under);
    ui.stakeSeven.textContent = money(S.bets.seven);
    ui.stakeOver.textContent = money(S.bets.over);
    ui.stakeTotal.textContent = money(totalStake());

    ui.clearBtn.disabled = totalStake() === 0 || S.phase !== 'betting';
    ui.rebetBtn.disabled = !S.lastBets || S.phase !== 'betting';
  }

  function setPhase(phase) {
    S.phase = phase;
    ui.phaseTag.className = 'phase-tag' +
      (phase === 'rolling' ? ' is-rolling' : phase === 'result' ? ' is-result' : '');
    ui.phaseTag.textContent =
      phase === 'betting' ? 'Paris ouverts' : phase === 'rolling' ? 'Dés en jeu' : 'Résultat';

    ui.zones.forEach((z) => { z.disabled = phase !== 'betting'; });

    ui.rollBtn.className = 'action-btn ' +
      (phase === 'betting' ? 'is-roll' : phase === 'rolling' ? 'is-wait' : 'is-next');
    ui.rollBtn.textContent =
      phase === 'betting' ? 'Lancer les dés' : phase === 'rolling' ? 'Dés en jeu…' : 'Nouvelle manche';
    ui.rollBtn.disabled = phase === 'rolling';

    renderBets();
  }

  function renderHistory() {
    ui.history.innerHTML = '';
    for (let i = 0; i < S.history.length; i++) {
      const chip = document.createElement('span');
      chip.className = 'hchip ' + S.history[i].outcome;
      chip.textContent = S.history[i].sum;
      ui.history.appendChild(chip);
    }
  }

  function addHistory(sum, outcome) {
    S.history.unshift({ sum, outcome });
    if (S.history.length > CFG.maxHistory) S.history.length = CFG.maxHistory;
    renderHistory();
  }

  // ---------- Tirage des dés (crypto, sans biais) ----------
  function d6() {
    const buf = new Uint32Array(1);
    if (window.crypto && window.crypto.getRandomValues) {
      const limit = Math.floor(4294967296 / 6) * 6;
      do { window.crypto.getRandomValues(buf); } while (buf[0] >= limit);
      return (buf[0] % 6) + 1;
    }
    return 1 + Math.floor(Math.random() * 6);
  }

  // ---------- Déroulement d'une manche ----------
  let roundTimer = 0;

  function startBetting() {
    clearTimeout(roundTimer);
    cancelAnimationFrame(S.rafId);
    S.bets = { under: 0, seven: 0, over: 0 };
    S.sum = null;
    S.outcome = null;

    setPhase('betting');
    ui.sumValue.textContent = '—';
    ui.sumValue.className = 'sum-value is-empty';
    ui.sumOutcome.textContent = 'Placez vos mises';
    ui.zones.forEach((el) => el.classList.remove('is-win', 'is-lose'));
    ui.timer.textContent = (CFG.betWindowMs / 1000).toFixed(1) + 's';
    ui.roundFill.style.width = '0%';
    setHint('Cliquez sur une zone du tapis pour miser');

    const t0 = Clock.now();
    const tick = () => {
      if (S.phase !== 'betting') return;
      const left = Math.max(0, CFG.betWindowMs - (Clock.now() - t0));
      ui.roundFill.style.width = ((1 - left / CFG.betWindowMs) * 100).toFixed(1) + '%';
      ui.timer.textContent = (left / 1000).toFixed(1) + 's';
      if (left <= 0) { startRoll(); return; }
      S.rafId = requestAnimationFrame(tick);
    };
    S.rafId = requestAnimationFrame(tick);
  }

  function startRoll() {
    if (S.phase !== 'betting') return;
    cancelAnimationFrame(S.rafId);

    S.lastBets = { under: S.bets.under, seven: S.bets.seven, over: S.bets.over };
    setPhase('rolling');
    ui.sumValue.textContent = '—';
    ui.sumValue.className = 'sum-value is-empty';
    ui.sumOutcome.textContent = 'Les dés roulent…';
    ui.timer.textContent = '· · ·';

    S.d1 = d6();
    S.d2 = d6();

    const t0 = Clock.now();
    const bar = () => {
      if (S.phase !== 'rolling') return;
      const p = clamp((Clock.now() - t0) / CFG.rollMs, 0, 1);
      ui.roundFill.style.width = (p * 100).toFixed(1) + '%';
      if (p < 1) S.rafId = requestAnimationFrame(bar);
    };
    S.rafId = requestAnimationFrame(bar);

    Dice.roll(S.d1, S.d2, () => settle(S.d1 + S.d2));
  }

  function settle(sum) {
    S.sum = sum;
    S.outcome = sum < 7 ? 'under' : sum === 7 ? 'seven' : 'over';
    const label = S.outcome === 'under' ? 'Under 7' : S.outcome === 'seven' ? 'Sept exact' : 'Over 7';

    setPhase('result');
    ui.sumValue.textContent = sum;
    ui.sumValue.className = 'sum-value is-pop is-' + S.outcome;
    ui.sumOutcome.textContent = label + ' · ' + S.d1 + ' + ' + S.d2;
    ui.timer.textContent = label;

    const staked = totalStake();
    let win = 0;
    if (S.bets[S.outcome] > 0) win = round2(S.bets[S.outcome] * CFG.payouts[S.outcome]);
    if (win > 0) setBalance(S.balance + win);

    ui.zones.forEach((el) => {
      el.classList.add(el.dataset.zone === S.outcome ? 'is-win' : 'is-lose');
    });

    if (staked === 0) {
      setHint('Aucune mise — ' + label + ' (' + sum + ')');
    } else if (win > 0) {
      setHint('Gagné ' + money(win) + ' — net +' + money(win - staked), 'win');
      if (S.outcome === 'seven') Sound.seven(); else Sound.win();
    } else {
      setHint('Perdu ' + money(staked), 'loss');
      Sound.lose();
    }

    addHistory(sum, S.outcome);
    S.rounds += 1;
    renderBets();
    roundTimer = setTimeout(startBetting, CFG.holdMs);
  }

  // ---------- Actions ----------
  function placeBet(zone) {
    if (S.phase !== 'betting') return;
    Sound.unlock();
    if (S.chip > S.balance) {
      setHint('Solde insuffisant pour un jeton de ' + money(S.chip), 'loss');
      return;
    }
    S.bets[zone] += S.chip;
    setBalance(S.balance - S.chip);
    Sound.chip();
    renderBets();
    setHint('Total misé : ' + money(totalStake()) + ' — tirage automatique à la fin du compte à rebours');
  }

  function clearBets() {
    if (S.phase !== 'betting') return;
    const total = totalStake();
    if (!total) return;
    setBalance(S.balance + total);
    S.bets = { under: 0, seven: 0, over: 0 };
    setHint('Mises retirées, solde recrédité');
    renderBets();
  }

  function rebet() {
    if (S.phase !== 'betting' || !S.lastBets) return;
    const lb = S.lastBets;
    const total = lb.under + lb.seven + lb.over;
    if (!total) return;
    if (total > S.balance) {
      setHint('Solde insuffisant pour rejouer ' + money(total), 'loss');
      return;
    }
    S.bets = { under: lb.under, seven: lb.seven, over: lb.over };
    setBalance(S.balance - total);
    setHint('Même mise rejouée : ' + money(total));
    renderBets();
  }

  // ---------- Événements ----------
  function bindEvents() {
    ui.zones.forEach((el) => {
      el.addEventListener('click', () => placeBet(el.dataset.zone));
    });

    ui.chips.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      Sound.unlock();
      S.chip = Number(btn.dataset.chip);
      renderChips();
      Sound.chip();
    });

    ui.rollBtn.addEventListener('click', () => {
      Sound.unlock();
      if (S.phase === 'betting') startRoll();
      else if (S.phase === 'result') startBetting();
    });

    ui.clearBtn.addEventListener('click', clearBets);
    ui.rebetBtn.addEventListener('click', rebet);

    ui.soundBtn.addEventListener('click', () => {
      S.sound = !S.sound;
      ui.soundBtn.textContent = S.sound ? '🔊' : '🔇';
      ui.soundBtn.classList.toggle('is-off', !S.sound);
      if (S.sound) Sound.unlock();
    });

    ui.resetBtn.addEventListener('click', () => {
      setBalance(CFG.startBalance);
      S.bets = { under: 0, seven: 0, over: 0 };
      S.history = [];
      S.lastBets = null;
      renderHistory();
      renderBets();
      setHint('Solde fictif réinitialisé à ' + money(CFG.startBalance));
    });

    document.addEventListener('keydown', (e) => {
      if (e.code !== 'Space' && e.key !== 'Enter') return;
      const tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON') return;
      e.preventDefault();
      Sound.unlock();
      if (S.phase === 'betting') startRoll();
      else if (S.phase === 'result') startBetting();
    });
  }

  // ---------- Démarrage ----------
  function init() {
    setBalance(loadBalance());
    if (S.balance < CFG.minChip) setBalance(CFG.startBalance);

    renderChips();
    Dice.init();
    Dice.reset(d6(), d6());

    for (let i = 0; i < 8; i++) {
      const s = d6() + d6();
      S.history.push({ sum: s, outcome: s < 7 ? 'under' : s === 7 ? 'seven' : 'over' });
    }
    renderHistory();

    bindEvents();
    startBetting();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();





