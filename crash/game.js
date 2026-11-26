/*
 * Crash — démo technique (argent fictif, aucun lien avec un opérateur réel).
 *
 * Modèle mathématique :
 *   - point de crash : c = (1 - edge) / (1 - u), u uniforme sur [0,1), plancher 1.00
 *     => P(crash >= x) = 0.97 / x  ->  avantage maison de 3 % quel que soit le retrait
 *   - multiplicateur au temps t : m(t) = e^(growth * t)
 */
(() => {
  'use strict';

  const CFG = {
    houseEdge: 0.03,
    growth: 0.07,
    waitMs: 6000,
    crashHoldMs: 2800,
    minBet: 10,
    maxBet: 250000,
    maxMultiplier: 5000,
    startBalance: 1000,
    maxHistory: 14,
    storageKey: 'crash-demo-v1',
  };

  const $ = (sel) => document.querySelector(sel);

  const ui = {
    stage: $('#stage'),
    graph: $('#graph'),
    history: $('#history'),
    multiplier: $('#multiplier'),
    status: $('#stage-status'),
    progress: $('#progress-fill'),
    footLeft: $('#stage-foot-left'),
    footRight: $('#stage-foot-right'),
    balance: $('#balance'),
    resetBtn: $('#reset-btn'),
    soundBtn: $('#sound-btn'),
    betInput: $('#bet-input'),
    quickRow: document.querySelector('.quick-row'),
    autoToggle: $('#auto-toggle'),
    autoWrap: $('#auto-input-wrap'),
    autoInput: $('#auto-input'),
    actionBtn: $('#action-btn'),
    hint: $('#action-hint'),
    phaseTag: $('#phase-tag'),
    liveList: $('#live-list'),
    liveCount: $('#live-count'),
  };

  // ---------- Formatage ----------
  // Devise : franc CFA (XOF). Pas de sous-unité -> tout est arrondi à l'unité.
  const nf0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
  const money = (v) => nf0.format(Math.round(v)) + ' FCFA';
  const mult = (v) => v.toFixed(2) + '×';
  const round2 = (v) => Math.round(v * 100) / 100;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  // ---------- Tirage du point de crash ----------
  function drawCrashPoint() {
    const u = Math.random();
    const raw = (1 - CFG.houseEdge) / Math.max(1e-9, 1 - u);
    return clamp(Math.floor(raw * 100) / 100, 1, CFG.maxMultiplier);
  }

  const crashTime = (c) => Math.log(c) / CFG.growth;

  // ---------- État ----------
  const S = {
    phase: 'waiting', // waiting | flying | crashed
    balance: CFG.startBalance,
    bet: null, // { amount, auto, cashedOut, winAt }
    autoEnabled: false,
    autoTarget: 2,
    mult: 1,
    crashAt: 2,
    history: [],
    players: [],
    rounds: 0,
    sound: true,
    rafId: 0,
    timerId: 0,
  };

  // Horloge du jeu : le temps passé onglet masqué est exclu, le tour se met en pause
  // (les requestAnimationFrame s'arrêtent quand la page est cachée).
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

  function loadBalance() {
    try {
      const raw = localStorage.getItem(CFG.storageKey);
      if (!raw) return CFG.startBalance;
      const parsed = JSON.parse(raw);
      const b = Number(parsed && parsed.balance);
      if (Number.isFinite(b) && b > 0) return b;
    } catch (err) { /* localStorage indisponible : on repart du solde initial */ }
    return CFG.startBalance;
  }

  function saveBalance() {
    try {
      localStorage.setItem(CFG.storageKey, JSON.stringify({ balance: round2(S.balance) }));
    } catch (err) { /* mode privé : pas de persistance, pas bloquant */ }
  }

  function setBalance(v) {
    S.balance = Math.round(Math.max(0, v));
    ui.balance.textContent = money(S.balance);
    saveBalance();
  }

  // ---------- Sons (WebAudio, aucun fichier externe) ----------
  const Sound = (() => {
    let ctx = null;
    let lastTick = 0;

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
      gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain).connect(a.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.03);
    }

    function noise(dur, vol, cutoff) {
      const a = ac();
      if (!a) return;
      const len = Math.max(1, Math.floor(a.sampleRate * dur));
      const buffer = a.createBuffer(1, len, a.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = a.createBufferSource();
      src.buffer = buffer;
      const filter = a.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = cutoff || 1400;
      const gain = a.createGain();
      gain.gain.value = vol;
      src.connect(filter).connect(gain).connect(a.destination);
      src.start();
    }

    return {
      unlock() { ac(); },
      bet() { tone(520, 0.09, 'triangle', 0.10, 700); },
      cancel() { tone(420, 0.08, 'triangle', 0.07, 260); },
      tick(m) {
        const now = performance.now();
        if (now - lastTick < 190) return;
        lastTick = now;
        tone(220 + Math.min(m, 25) * 32, 0.028, 'square', 0.022);
      },
      cashout() {
        tone(880, 0.10, 'sine', 0.13, 1180);
        setTimeout(() => tone(1320, 0.14, 'sine', 0.10, 1760), 70);
      },
      crash() {
        noise(0.55, 0.20, 900);
        tone(180, 0.45, 'sawtooth', 0.10, 55);
      },
      lose() {
        tone(240, 0.18, 'sine', 0.07, 140);
      },
    };
  })();

  // ---------- Rendu Canvas ----------
  const Graph = (() => {
    const canvas = ui.graph;
    const ctx = canvas.getContext('2d');
    const PAD = { l: 58, r: 34, t: 74, b: 50 };
    let w = 0;
    let h = 0;
    let last = { t: 0, m: 1, crashed: false };
    let lastHead = null;
    let burst = null;
    let burstRaf = 0;

    function niceStep(raw, base) {
      const steps = base || [1, 2, 2.5, 5, 10];
      const raw2 = Math.max(raw, 1e-6);
      const pow = Math.pow(10, Math.floor(Math.log10(raw2)));
      for (let i = 0; i < steps.length; i++) {
        if (steps[i] * pow >= raw2) return steps[i] * pow;
      }
      return 10 * pow;
    }

    function resize() {
      const rect = ui.stage.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = Math.max(200, rect.width);
      h = Math.max(200, rect.height);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawFrame(last.t, last.m, last.crashed);
    }

    function drawFrame(t, m, crashed) {
      last = { t, m, crashed };
      const pw = Math.max(20, w - PAD.l - PAD.r);
      const ph = Math.max(20, h - PAD.t - PAD.b);
      const tMax = Math.max(6, t * 1.12);
      const mMax = Math.max(1.35, 1 + (m - 1) * 1.45);
      const X = (s) => PAD.l + (Math.min(s, tMax) / tMax) * pw;
      const Y = (v) => PAD.t + ph - ((clamp(v, 1, mMax) - 1) / (mMax - 1)) * ph;

      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 1;
      ctx.font = '11px Inter, "Segoe UI", system-ui, sans-serif';

      // Grille verticale (temps)
      const tStep = niceStep(tMax / 8, [0.5, 1, 2, 2.5, 5, 10]);
      ctx.strokeStyle = 'rgba(255,255,255,0.055)';
      ctx.fillStyle = 'rgba(255,255,255,0.26)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let i = 0; i * tStep <= tMax + 1e-9; i++) {
        const s = i * tStep;
        const x = X(s);
        ctx.beginPath();
        ctx.moveTo(x, PAD.t);
        ctx.lineTo(x, PAD.t + ph);
        ctx.stroke();
        if (i > 0) {
          const label = (Math.abs(s - Math.round(s)) < 1e-6 ? String(Math.round(s)) : s.toFixed(1)) + 's';
          ctx.fillText(label, x, PAD.t + ph + 9);
        }
      }

      // Grille horizontale (multiplicateur)
      const mStep = niceStep((mMax - 1) / 6, [0.5, 1, 2, 2.5, 5, 10]);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let i = 0; i * mStep <= mMax - 1 + 1e-9; i++) {
        const v = 1 + i * mStep;
        const y = Y(v);
        ctx.beginPath();
        ctx.moveTo(PAD.l, y);
        ctx.lineTo(PAD.l + pw, y);
        ctx.stroke();
        const label = v < 10 ? v.toFixed(1) : String(Math.round(v));
        ctx.fillText(label + '×', PAD.l - 10, y);
      }

      if (t > 0 && m > 1) {
        const N = 140;
        const pts = [];
        for (let i = 0; i <= N; i++) {
          const s = (t * i) / N;
          pts.push([X(s), Y(Math.exp(CFG.growth * s))]);
        }
        const head = pts[pts.length - 1];

        // Aire sous la courbe (dégradé ancré sur le sommet de la courbe)
        const fill = ctx.createLinearGradient(0, head[1], 0, PAD.t + ph);
        if (crashed) {
          fill.addColorStop(0, 'rgba(255,43,77,0.30)');
          fill.addColorStop(1, 'rgba(255,43,77,0.01)');
        } else {
          fill.addColorStop(0, 'rgba(255,120,60,0.24)');
          fill.addColorStop(1, 'rgba(255,43,77,0.01)');
        }
        ctx.beginPath();
        ctx.moveTo(X(0), Y(1));
        for (let i = 0; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.lineTo(X(t), Y(1));
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();

        // Courbe
        const grad = ctx.createLinearGradient(X(0), Y(1), head[0], head[1]);
        if (crashed) {
          grad.addColorStop(0, '#ff2b4d');
          grad.addColorStop(1, '#ff7a18');
        } else {
          grad.addColorStop(0, '#ff5a3c');
          grad.addColorStop(1, '#ffc247');
        }
        ctx.save();
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = grad;
        ctx.shadowColor = crashed ? 'rgba(255,43,77,0.85)' : 'rgba(255,120,40,0.75)';
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.stroke();
        ctx.restore();

        // Traînée d'étincelles + avion en tête de courbe
        lastHead = { x: head[0], y: head[1] };
        if (!crashed) {
          const back = pts[Math.max(0, pts.length - 6)];
          const angle = Math.atan2(head[1] - back[1], head[0] - back[0]);
          drawEmbers(pts);
          drawPlane(head[0], head[1], angle, t);
        }
      }
    }

    // ---------- Avion ----------
    function drawEmbers(pts) {
      const n = pts.length;
      for (let i = n - 5; i > n - 44 && i >= 0; i -= 3) {
        const k = (n - i) / 44;
        const alpha = Math.max(0, 0.42 * (1 - k));
        if (alpha <= 0.01) continue;
        ctx.beginPath();
        ctx.arc(pts[i][0], pts[i][1], 2.4 * (1 - k) + 0.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,196,120,' + alpha.toFixed(3) + ')';
        ctx.fill();
      }
    }

    function planeScale() {
      return clamp(Math.min(w, h) / 360, 0.7, 2.2);
    }

    function drawPlane(x, y, angle, time) {
      const s = planeScale();
      ctx.save();
      ctx.translate(x, y + Math.sin(time * 4.5) * 1.6);

      // Halo chaud autour de l'appareil
      const halo = ctx.createRadialGradient(0, 0, 2, 0, 0, 52 * s);
      halo.addColorStop(0, 'rgba(255,150,70,0.28)');
      halo.addColorStop(0.55, 'rgba(255,90,50,0.10)');
      halo.addColorStop(1, 'rgba(255,90,50,0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(0, 0, 52 * s, 0, Math.PI * 2);
      ctx.fill();

      ctx.rotate(clamp(angle, -1.25, 0.35));
      ctx.scale(s, s);
      ctx.translate(20, -2);
      drawPropPlane(time);
      ctx.restore();
    }

    // Appareil monomoteur rouge & blanc, nez vers +X, origine au centre du fuselage.
    function drawPropPlane(time) {
      const OUTLINE = 'rgba(46,10,8,0.85)';
      ctx.lineJoin = 'round';

      // ---- Aile côté opposé (derrière le fuselage)
      ctx.beginPath();
      ctx.moveTo(7, -4);
      ctx.lineTo(-5, -19);
      ctx.quadraticCurveTo(-8, -21, -12, -20);
      ctx.lineTo(-15, -17);
      ctx.lineTo(-3, -1);
      ctx.closePath();
      ctx.fillStyle = '#a8271d';
      ctx.fill();
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // ---- Stabilisateur horizontal
      ctx.beginPath();
      ctx.moveTo(-22, -2);
      ctx.lineTo(-34, -10);
      ctx.quadraticCurveTo(-38, -11, -38.5, -7);
      ctx.lineTo(-38, -4);
      ctx.lineTo(-27, 1);
      ctx.closePath();
      ctx.fillStyle = '#a8271d';
      ctx.fill();
      ctx.stroke();

      // ---- Dérive verticale
      ctx.beginPath();
      ctx.moveTo(-21, -6);
      ctx.lineTo(-32, -26);
      ctx.quadraticCurveTo(-34, -29, -30, -29.5);
      ctx.lineTo(-25, -28.5);
      ctx.lineTo(-11, -8);
      ctx.closePath();
      ctx.fillStyle = '#d9392a';
      ctx.fill();
      ctx.stroke();

      // ---- Fuselage
      const fuselage = () => {
        ctx.beginPath();
        ctx.moveTo(35, 1);
        ctx.bezierCurveTo(35, -6, 26, -10, 14, -10.5);
        ctx.lineTo(-13, -9.5);
        ctx.quadraticCurveTo(-28, -9, -33, -2);
        ctx.lineTo(-33, 2);
        ctx.quadraticCurveTo(-28, 9, -13, 9.5);
        ctx.lineTo(14, 9);
        ctx.bezierCurveTo(26, 8.5, 35, 7, 35, 1);
        ctx.closePath();
      };
      fuselage();
      const bodyGrad = ctx.createLinearGradient(0, -11, 0, 10);
      bodyGrad.addColorStop(0, '#ff7a63');
      bodyGrad.addColorStop(0.35, '#ec3a26');
      bodyGrad.addColorStop(0.75, '#c9271a');
      bodyGrad.addColorStop(1, '#8e150f');
      ctx.fillStyle = bodyGrad;
      ctx.fill();
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Reflet de ventre + bande blanche
      ctx.save();
      fuselage();
      ctx.clip();
      const belly = ctx.createLinearGradient(0, 0, 0, 10);
      belly.addColorStop(0, 'rgba(255,255,255,0)');
      belly.addColorStop(1, 'rgba(255,240,220,0.5)');
      ctx.fillStyle = belly;
      ctx.fillRect(-36, -12, 74, 26);

      const stripe = ctx.createLinearGradient(0, -9, 0, 9);
      stripe.addColorStop(0, 'rgba(255,255,255,0)');
      stripe.addColorStop(0.5, 'rgba(255,255,255,0.9)');
      stripe.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = stripe;
      ctx.fillRect(-36, -3.4, 74, 6.8);
      ctx.restore();

      // ---- Verrière
      ctx.beginPath();
      ctx.ellipse(16, -5, 9, 4.2, -0.08, 0, Math.PI * 2);
      const glass = ctx.createLinearGradient(8, -9, 24, 0);
      glass.addColorStop(0, 'rgba(185,240,255,0.95)');
      glass.addColorStop(0.5, 'rgba(44,128,170,0.92)');
      glass.addColorStop(1, 'rgba(8,34,52,0.95)');
      ctx.fillStyle = glass;
      ctx.fill();
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 1.1;
      ctx.stroke();

      // ---- Aile côté joueur (devant le fuselage)
      ctx.beginPath();
      ctx.moveTo(13, 4);
      ctx.quadraticCurveTo(-2, 13, -6, 21);
      ctx.quadraticCurveTo(-9, 26, -14, 24.5);
      ctx.quadraticCurveTo(-17.5, 23.5, -14, 19);
      ctx.lineTo(-1, 4);
      ctx.closePath();
      const wingGrad = ctx.createLinearGradient(0, 4, 0, 25);
      wingGrad.addColorStop(0, '#ff6a53');
      wingGrad.addColorStop(1, '#af231a');
      ctx.fillStyle = wingGrad;
      ctx.fill();
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 1.3;
      ctx.stroke();

      // Liseré blanc sur l'aile
      ctx.beginPath();
      ctx.moveTo(8, 8.5);
      ctx.quadraticCurveTo(-2, 15, -5.5, 20);
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // ---- Casserole + hélice
      ctx.beginPath();
      ctx.ellipse(34.5, 1, 4.6, 8.2, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#3b3b46';
      ctx.fill();
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.save();
      ctx.globalAlpha = 0.13 + 0.07 * Math.abs(Math.sin(time * 26));
      ctx.beginPath();
      ctx.ellipse(37, 1, 3.4, 16.5, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#fff3e2';
      ctx.fill();
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = '#fff6ea';
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.restore();

      ctx.beginPath();
      ctx.arc(38, 1, 2.6, 0, Math.PI * 2);
      ctx.fillStyle = '#f4f4fa';
      ctx.fill();
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 0.9;
      ctx.stroke();

      // ---- Souffle du réacteur / sillage
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(-37 - i * 5.5, 1.5 + i * 1.1, 2.4 + i * 1.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,' + (0.16 - i * 0.045).toFixed(3) + ')';
        ctx.fill();
      }

      // Feu de navigation clignotant
      if (Math.sin(time * 7) > 0) {
        ctx.beginPath();
        ctx.arc(-14, 24, 1.8, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(120,255,170,0.95)';
        ctx.fill();
      }
    }

    // ---------- Explosion au crash ----------
    function explode() {
      if (!lastHead) return;
      const origin = { x: lastHead.x, y: lastHead.y };
      const parts = [];
      for (let i = 0; i < 32; i++) {
        const a = Math.random() * Math.PI * 2;
        const speed = 70 + Math.random() * 250;
        parts.push({
          x: origin.x,
          y: origin.y,
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed - 70,
          r: 1 + Math.random() * 3.2,
          life: 0.45 + Math.random() * 0.5,
          color: Math.random() < 0.45 ? '255,140,40' : '255,43,77',
        });
      }
      burst = { parts, origin, start: Clock.now() };
      cancelAnimationFrame(burstRaf);
      const tick = () => {
        if (!burst) return;
        const el = (Clock.now() - burst.start) / 1000;
        drawFrame(last.t, last.m, true);
        drawBurst(el);
        if (el < 1.2) {
          burstRaf = requestAnimationFrame(tick);
        } else {
          burst = null;
          drawFrame(last.t, last.m, true);
        }
      };
      burstRaf = requestAnimationFrame(tick);
    }

    function drawBurst(el) {
      if (!burst) return;
      const origin = burst.origin;
      ctx.save();

      // Onde de choc
      const ringAlpha = Math.max(0, 0.5 - el * 0.38);
      if (ringAlpha > 0.005) {
        ctx.beginPath();
        ctx.arc(origin.x, origin.y, 8 + el * 180, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,140,90,' + ringAlpha.toFixed(3) + ')';
        ctx.lineWidth = Math.max(0.5, 3.5 * (1 - el * 2.2));
        ctx.stroke();
      }

      // Boule de feu
      if (el < 0.8) {
        const k = el / 0.8;
        const r = 16 + k * 92;
        const a = (1 - k) * 0.7;
        const fire = ctx.createRadialGradient(origin.x, origin.y, 0, origin.x, origin.y, r);
        fire.addColorStop(0, 'rgba(255,240,190,' + a.toFixed(3) + ')');
        fire.addColorStop(0.45, 'rgba(255,132,44,' + (a * 0.8).toFixed(3) + ')');
        fire.addColorStop(1, 'rgba(210,40,30,0)');
        ctx.fillStyle = fire;
        ctx.beginPath();
        ctx.arc(origin.x, origin.y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Flash initial
      if (el < 0.25) {
        const f = 1 - el / 0.25;
        const glow = ctx.createRadialGradient(origin.x, origin.y, 0, origin.x, origin.y, 110);
        glow.addColorStop(0, 'rgba(255,245,215,' + (0.7 * f).toFixed(3) + ')');
        glow.addColorStop(0.45, 'rgba(255,150,60,' + (0.35 * f).toFixed(3) + ')');
        glow.addColorStop(1, 'rgba(255,80,40,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(origin.x, origin.y, 110, 0, Math.PI * 2);
        ctx.fill();
      }

      // Débris
      for (let i = 0; i < burst.parts.length; i++) {
        const p = burst.parts[i];
        if (el > p.life) continue;
        const x = p.x + p.vx * el;
        const y = p.y + p.vy * el + 220 * el * el;
        const alpha = 1 - el / p.life;

        // traînée du débris
        if (el > 0.06) {
          const prev = el - 0.06;
          const px = p.x + p.vx * prev;
          const py = p.y + p.vy * prev + 220 * prev * prev;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(x, y);
          ctx.strokeStyle = 'rgba(' + p.color + ',' + (alpha * 0.45).toFixed(3) + ')';
          ctx.lineWidth = p.r * 0.8;
          ctx.stroke();
        }

        ctx.beginPath();
        ctx.arc(x, y, p.r * (0.35 + alpha * 0.65), 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(' + p.color + ',' + (alpha * 0.9).toFixed(3) + ')';
        ctx.fill();
      }
      ctx.restore();
    }

    return {
      init() {
        resize();
        if (window.ResizeObserver) new ResizeObserver(resize).observe(ui.stage);
        window.addEventListener('resize', resize);
        window.addEventListener('orientationchange', resize);
      },
      render(t, m, crashed) { drawFrame(t, m, crashed); },
      markCrash(t) { drawFrame(t, last.m, true); },
      explode() { explode(); },
      reset() { drawFrame(0, 1, false); },
    };
  })();

  // ---------- Interface : textes et listes ----------
  let actionMain = null;
  let actionSub = null;
  let multValue = null;

  const NAMES = [
    'Nadia_92', 'kevindu13', 'Lucie.b', 'Tigrou', 'MarcoP', 'Yanis', 'Sofia_75',
    'xX_Dark_Xx', 'Amine', 'Chloe_31', 'Onur', 'BetAndPray', 'JeanMi', 'Rayan_94',
    'Lea_03', 'PetitPoucet', 'Momo', 'SarahK', 'Zizou', 'Bilal', 'Emma.t', 'Toto',
  ];

  function setHint(text, kind) {
    ui.hint.textContent = text;
    ui.hint.className = 'hint' + (kind ? ' is-' + kind : '');
  }

  function updateMultiplierLabel(m) {
    if (multValue) multValue.textContent = m.toFixed(2);
  }

  function renderAction() {
    const btn = ui.actionBtn;
    btn.className = 'action-btn';
    btn.disabled = false;

    if (S.phase === 'waiting') {
      if (S.bet) {
        btn.classList.add('is-cancel');
        actionMain.textContent = 'Annuler le pari';
        actionSub.textContent = money(S.bet.amount);
      } else {
        btn.classList.add('is-bet');
        actionMain.textContent = 'Parier';
        actionSub.textContent = money(readBet());
      }
      return;
    }

    if (S.phase === 'flying' && S.bet && !S.bet.cashedOut) {
      btn.classList.add('is-cashout');
      renderCashout();
      return;
    }

    btn.classList.add('is-disabled');
    btn.disabled = true;
    actionMain.textContent = S.phase === 'flying' ? 'Tour en cours' : 'Tour terminé';
    actionSub.textContent = 'Nouveau tour imminent';
  }

  function renderCashout() {
    const bet = S.bet;
    if (!bet || bet.cashedOut) return;
    const win = round2(bet.amount * S.mult);
    actionMain.textContent = 'Retirer ' + mult(S.mult);
    actionSub.textContent = money(win) + '  (+' + money(win - bet.amount) + ')';
  }

  function renderHistory() {
    ui.history.innerHTML = '';
    S.history.slice(0, CFG.maxHistory).forEach((v) => {
      const chip = document.createElement('span');
      chip.className = 'chip ' + (v < 2 ? 'low' : v < 10 ? 'mid' : 'high');
      chip.textContent = v.toFixed(2) + '×';
      ui.history.appendChild(chip);
    });
  }

  function pickAmount() {
    const table = [10, 20, 25, 50, 100, 100, 150, 200, 250, 500, 750, 1000, 2500];
    return table[Math.floor(Math.random() * table.length)];
  }

  function spawnPlayers() {
    const pool = NAMES.slice();
    const count = 5 + Math.floor(Math.random() * 3);
    const players = [];
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      const name = pool.splice(idx, 1)[0] || 'joueur_' + i;
      const target = Math.random() < 0.2 ? 0 : round2(1.05 + Math.pow(Math.random(), 2.4) * 5);
      players.push({ name, amount: pickAmount(), target, done: false, node: null, resultNode: null });
    }
    return players;
  }

  function renderPlayers() {
    ui.liveList.innerHTML = '';
    S.players.forEach((p) => {
      const li = document.createElement('li');
      li.className = 'live-item';

      const name = document.createElement('span');
      name.className = 'live-name';
      name.textContent = p.name;

      const amount = document.createElement('span');
      amount.className = 'live-bet';
      amount.textContent = money(p.amount);

      const result = document.createElement('strong');
      result.className = 'live-result';
      result.textContent = '…';

      li.append(name, amount, result);
      p.node = li;
      p.resultNode = result;
      ui.liveList.appendChild(li);
    });

    const online = 850 + Math.floor(Math.random() * 1200);
    ui.liveCount.textContent = nf0.format(online) + ' en ligne';
  }

  function updatePlayers(m) {
    S.players.forEach((p) => {
      if (p.done || !p.target) return;
      if (m >= p.target) {
        p.done = true;
        p.node.classList.add('is-win');
        p.resultNode.textContent = mult(p.target);
      }
    });
  }

  function settlePlayers() {
    S.players.forEach((p) => {
      if (p.done) return;
      p.done = true;
      p.node.classList.add('is-loss');
      p.resultNode.textContent = 'perdu';
    });
  }

  // ---------- Lecture des champs ----------
  function readBet() {
    const v = parseInt(String(ui.betInput.value).replace(/[^\d]/g, ''), 10);
    return Number.isFinite(v) ? v : 0;
  }

  function writeBet(v) {
    ui.betInput.value = String(clamp(Math.round(v), 0, CFG.maxBet));
    if (S.phase === 'waiting' && !S.bet) actionSub.textContent = money(readBet());
  }

  function readAuto() {
    const raw = String(ui.autoInput.value).replace(',', '.').replace(/[^\d.]/g, '');
    const v = parseFloat(raw);
    return Number.isFinite(v) ? clamp(v, 1.01, 100) : 2;
  }

  // ---------- Actions du joueur ----------
  function placeBet() {
    const amount = readBet();
    if (amount < CFG.minBet) {
      setHint('Mise minimale : ' + money(CFG.minBet), 'loss');
      return;
    }
    if (amount > S.balance) {
      setHint('Solde insuffisant : ' + money(S.balance), 'loss');
      return;
    }
    S.bet = { amount, auto: S.autoEnabled ? S.autoTarget : 0, cashedOut: false, winAt: 0 };
    setBalance(S.balance - amount);
    Sound.bet();
    setHint('Pari de ' + money(amount) + ' placé' +
      (S.autoEnabled ? ' — retrait auto à ' + mult(S.autoTarget) : ' — retrait manuel'));
    renderAction();
  }

  function cancelBet() {
    if (!S.bet) return;
    setBalance(S.balance + S.bet.amount);
    S.bet = null;
    Sound.cancel();
    setHint('Pari annulé, mise remboursée');
    renderAction();
  }

  function cashOut(reason, atMult) {
    const bet = S.bet;
    if (!bet || bet.cashedOut) return;
    const m = atMult || S.mult;
    const win = Math.round(bet.amount * m);
    const net = win - bet.amount;
    bet.cashedOut = true;
    bet.winAt = m;
    setBalance(S.balance + win);
    Sound.cashout();
    setHint((reason === 'auto' ? 'Retrait auto à ' : 'Retiré à ') + mult(m) + ' → ' +
      money(win) + ' (+' + money(net) + ')', 'win');
    flashWin();
    renderAction();
  }

  function flashWin() {
    ui.stage.classList.add('is-win');
    setTimeout(() => ui.stage.classList.remove('is-win'), 900);
  }

  function onAction() {
    Sound.unlock();
    if (S.phase === 'waiting') {
      if (S.bet) cancelBet(); else placeBet();
    } else if (S.phase === 'flying' && S.bet && !S.bet.cashedOut) {
      cashOut('manuel');
    }
  }

  // ---------- Déroulement d'un tour ----------
  function startWaiting() {
    cancelAnimationFrame(S.rafId);
    clearTimeout(S.timerId);

    S.phase = 'waiting';
    S.mult = 1;
    S.bet = null;
    S.crashAt = drawCrashPoint();
    S.players = spawnPlayers();

    ui.stage.classList.remove('is-flying', 'is-crashed', 'is-win');
    updateMultiplierLabel(1);
    ui.status.textContent = 'Prochain tour…';
    ui.phaseTag.textContent = 'En attente';
    ui.phaseTag.className = 'phase-tag';
    ui.progress.style.width = '0%';
    ui.footLeft.textContent = 'Départ dans ' + (CFG.waitMs / 1000).toFixed(1) + 's';
    Graph.reset();
    renderPlayers();
    renderAction();
    setHint('Placez votre mise — retrait auto ' +
      (S.autoEnabled ? 'à ' + mult(S.autoTarget) : 'désactivé'));

    const t0 = Clock.now();
    const countdown = (now) => {
      if (S.phase !== 'waiting') return;
      const left = Math.max(0, CFG.waitMs - (Clock.now() - t0));
      ui.progress.style.width = ((1 - left / CFG.waitMs) * 100).toFixed(1) + '%';
      ui.footLeft.textContent = 'Départ dans ' + (left / 1000).toFixed(1) + 's';
      if (left <= 0) { startFlight(); return; }
      S.rafId = requestAnimationFrame(countdown);
    };
    S.rafId = requestAnimationFrame(countdown);
  }

  function startFlight() {
    S.phase = 'flying';
    ui.stage.classList.add('is-flying');
    ui.status.textContent = 'En vol';
    ui.phaseTag.textContent = 'En cours';
    ui.phaseTag.className = 'phase-tag is-flying';
    ui.progress.style.width = '0%';
    ui.footLeft.textContent = 'Temps de vol : 0.0s';
    renderAction();

    const t0 = Clock.now();
    let lastTickAt = 1;

    const frame = (now) => {
      if (S.phase !== 'flying') return;
      const t = (Clock.now() - t0) / 1000;
      const m = Math.exp(CFG.growth * t);

      if (m >= S.crashAt) {
        S.mult = S.crashAt;
        updateMultiplierLabel(S.crashAt);
        Graph.render(crashTime(S.crashAt), S.crashAt, false);
        handleCrash();
        return;
      }

      S.mult = m;
      updateMultiplierLabel(m);
      Graph.render(t, m, false);
      ui.footLeft.textContent = 'Temps de vol : ' + t.toFixed(1) + 's';
      updatePlayers(m);

      if (S.bet && !S.bet.cashedOut) {
        renderCashout();
        if (S.bet.auto > 1 && m >= S.bet.auto) cashOut('auto', S.bet.auto);
      }

      if (m - lastTickAt > 0.3) {
        lastTickAt = m;
        Sound.tick(m);
      }

      S.rafId = requestAnimationFrame(frame);
    };
    S.rafId = requestAnimationFrame(frame);
  }

  function handleCrash() {
    S.phase = 'crashed';
    ui.stage.classList.remove('is-flying');
    ui.stage.classList.add('is-crashed');
    ui.status.textContent = 'Crashé à ' + mult(S.crashAt);
    ui.phaseTag.textContent = 'Crash';
    ui.phaseTag.className = 'phase-tag is-crashed';
    ui.progress.style.width = '100%';
    ui.footLeft.textContent = 'Tour terminé';
    Graph.markCrash(crashTime(S.crashAt));
    Graph.explode();

    S.history.unshift(S.crashAt);
    if (S.history.length > CFG.maxHistory) S.history.length = CFG.maxHistory;
    renderHistory();
    settlePlayers();
    Sound.crash();

    if (S.bet && !S.bet.cashedOut) {
      setHint('Perdu ' + money(S.bet.amount) + ' — crash à ' + mult(S.crashAt), 'loss');
      Sound.lose();
    } else if (!S.bet) {
      setHint('Crash à ' + mult(S.crashAt) + ' — prochain tour dans un instant');
    }

    S.bet = null;
    S.rounds += 1;
    renderAction();
    S.timerId = setTimeout(startWaiting, CFG.crashHoldMs);
  }

  // ---------- Événements ----------
  function bindEvents() {
    ui.actionBtn.addEventListener('click', onAction);

    document.querySelectorAll('.amount-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const step = parseInt(btn.dataset.step, 10) || 0;
        writeBet(readBet() + step);
      });
    });

    ui.quickRow.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const q = btn.dataset.quick;
      if (q === 'x2') writeBet(readBet() * 2);
      else if (q === 'x0.5') writeBet(readBet() / 2);
      else writeBet(parseInt(q, 10));
    });

    ui.betInput.addEventListener('input', () => {
      ui.betInput.value = ui.betInput.value.replace(/[^\d]/g, '').slice(0, 7);
      if (S.phase === 'waiting' && !S.bet) actionSub.textContent = money(readBet());
    });
    ui.betInput.addEventListener('blur', () => writeBet(readBet()));

    ui.autoToggle.addEventListener('change', () => {
      S.autoEnabled = ui.autoToggle.checked;
      ui.autoWrap.classList.toggle('is-off', !S.autoEnabled);
      S.autoTarget = readAuto();
      if (S.bet) S.bet.auto = S.autoEnabled ? S.autoTarget : 0;
    });

    ui.autoInput.addEventListener('input', () => {
      ui.autoInput.value = ui.autoInput.value.replace(',', '.').replace(/[^\d.]/g, '').slice(0, 6);
      S.autoTarget = readAuto();
      if (S.bet) S.bet.auto = S.autoEnabled ? S.autoTarget : 0;
    });
    ui.autoInput.addEventListener('blur', () => {
      S.autoTarget = readAuto();
      ui.autoInput.value = S.autoTarget.toFixed(2);
    });

    ui.soundBtn.addEventListener('click', () => {
      S.sound = !S.sound;
      ui.soundBtn.textContent = S.sound ? '🔊' : '🔇';
      ui.soundBtn.classList.toggle('is-off', !S.sound);
      if (S.sound) Sound.unlock();
    });

    ui.resetBtn.addEventListener('click', () => {
      setBalance(CFG.startBalance);
      S.history = [];
      renderHistory();
      setHint('Solde fictif réinitialisé à ' + money(CFG.startBalance));
    });

    document.addEventListener('keydown', (e) => {
      const tag = e.target && e.target.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA';
      if (e.key === 'Enter' || (e.code === 'Space' && !typing)) {
        e.preventDefault();
        onAction();
      }
    });
  }

  // ---------- Démarrage ----------
  function init() {
    ui.actionBtn.innerHTML = '<span id="action-main">Parier</span><small id="action-sub"></small>';
    ui.multiplier.innerHTML = '<em>1.00</em><span>×</span>';
    actionMain = document.getElementById('action-main');
    actionSub = document.getElementById('action-sub');
    multValue = ui.multiplier.querySelector('em');

    setBalance(loadBalance());
    if (S.balance < CFG.minBet) setBalance(CFG.startBalance);

    S.autoTarget = readAuto();
    ui.autoWrap.classList.add('is-off');

    Graph.init();
    for (let i = 0; i < 10; i++) S.history.push(drawCrashPoint());
    renderHistory();

    bindEvents();

    // Mode aperçu statique pour la revue graphique : index.html?preview=2.5
    const preview = parseFloat(new URLSearchParams(location.search).get('preview'));
    if (Number.isFinite(preview) && preview > 1) {
      const m = clamp(preview, 1.01, CFG.maxMultiplier);
      S.phase = 'flying';
      S.mult = m;
      ui.stage.classList.add('is-flying');
      updateMultiplierLabel(m);
      ui.status.textContent = 'Aperçu statique';
      ui.footLeft.textContent = 'Aperçu · ' + mult(m);
      ui.progress.style.width = '55%';
      Graph.render(crashTime(m), m, false);
      setHint('Mode aperçu — boucle de jeu désactivée');
      renderAction();
      return;
    }

    startWaiting();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();




