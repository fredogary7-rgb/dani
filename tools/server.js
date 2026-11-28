/*
 * Serveur de démo — fichiers statiques + manches Crash en continu.
 *
 *   node tools/server.js [port]        (8080 par défaut)
 *
 * Pourquoi un serveur ? Pour que les tours continuent quand la page est fermée, et pour
 * que la page bot (sur un autre appareil du même réseau) voie les mêmes manches.
 *
 * API :
 *   GET /api/crash  → { serverTime, waitMs, holdMs, growth,
 *                       round: { n, phase, startedAt, endsAt, crashAt, mult, pos },
 *                       next: [{ value, pos }, ...], history: [valeurs] }
 */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.argv[2] || 8080);

const WAIT_MS = 6000;
const HOLD_MS = 2800;
const GROWTH = 0.07;
const EDGE = 0.03;
const CAP = 5000;
const MAX = 500;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
};

// ---------- Programme des crashs ----------
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildValues() {
  let program = { seed: 20260202, values: [] };
  try {
    program = JSON.parse(fs.readFileSync(path.join(ROOT, 'crash', 'program.json'), 'utf8'));
  } catch (err) {
    console.log('program.json introuvable, suite générée uniquement');
  }

  const rnd = mulberry32(program.seed || 1);
  const values = [];
  const base = Array.isArray(program.values) ? program.values : [];
  for (let i = 0; i < base.length; i++) values.push(Math.max(1, Math.round(base[i] * 100) / 100));
  while (values.length < MAX) {
    const u = rnd();
    const raw = (1 - EDGE) / Math.max(1e-9, 1 - u);
    values.push(Math.min(CAP, Math.max(1, Math.floor(raw * 100) / 100)));
  }
  return values;
}

const VALUES = buildValues();

// ---------- État des manches ----------
const state = {
  n: 0,
  phase: 'waiting', // waiting | flying | crashed
  startedAt: 0,
  endsAt: Date.now() + WAIT_MS,
  crashAt: 0,
  pos: 1,
  index: 0,
  history: [],
};
state.crashAt = VALUES[0];

function takeValue() {
  const i = state.index % VALUES.length;
  const v = VALUES[i];
  state.index = (i + 1) % VALUES.length;
  return { value: v, pos: i + 1 };
}

function startWaiting(now) {
  state.n += 1;
  state.phase = 'waiting';
  state.endsAt = now + WAIT_MS;
  const next = takeValue();
  state.crashAt = next.value;
  state.pos = next.pos;
  console.log('[tour ' + state.n + '] mise ouverte — crash programmé ' + next.value + '× (n°' + next.pos + ')');
}

function startFlight(now) {
  state.phase = 'flying';
  state.startedAt = now;
  state.endsAt = now + Math.max(400, Math.round((Math.log(state.crashAt) / GROWTH) * 1000));
  console.log('[tour ' + state.n + '] décollage → crash à ' + state.crashAt + '×');
}

function crash(now) {
  state.phase = 'crashed';
  state.endsAt = now + HOLD_MS;
  state.history.unshift(state.crashAt);
  if (state.history.length > 14) state.history.length = 14;
  console.log('[tour ' + state.n + '] crashé à ' + state.crashAt + '×');
}

function tick() {
  const now = Date.now();
  if (state.phase === 'waiting' && now >= state.endsAt) startFlight(now);
  else if (state.phase === 'flying' && now >= state.endsAt) crash(now);
  else if (state.phase === 'crashed' && now >= state.endsAt) startWaiting(now);
}

function snapshot() {
  const now = Date.now();
  let mult = 1;
  if (state.phase === 'flying') {
    mult = Math.min(state.crashAt, Math.exp((GROWTH * (now - state.startedAt)) / 1000));
  } else if (state.phase === 'crashed') {
    mult = state.crashAt;
  }

  const next = [];
  for (let k = 0; k < 5; k++) {
    const i = (state.index + k) % VALUES.length;
    next.push({ value: VALUES[i], pos: i + 1 });
  }

  return {
    serverTime: now,
    waitMs: WAIT_MS,
    holdMs: HOLD_MS,
    growth: GROWTH,
    total: VALUES.length,
    round: {
      n: state.n,
      phase: state.phase,
      startedAt: state.startedAt,
      endsAt: state.endsAt,
      crashAt: state.crashAt,
      pos: state.pos,
      mult: Math.round(mult * 100) / 100,
    },
    next: next,
    history: state.history,
  };
}

startWaiting(Date.now());
setInterval(tick, 100);

// ---------- HTTP ----------
function sendJson(res, code, data) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/api/crash') {
    sendJson(res, 200, snapshot());
    return;
  }

  let rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  if (rel === '' || rel.slice(-1) === '/') rel += 'index.html';
  const file = path.resolve(ROOT, rel);

  if (!file.startsWith(ROOT)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Interdit');
    return;
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 — introuvable');
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const nets = os.networkInterfaces();
  const ips = [];
  Object.keys(nets).forEach((name) => {
    (nets[name] || []).forEach((net) => {
      if (net.family === 'IPv4' && !net.internal) ips.push(net.address);
    });
  });

  console.log('Serveur de démo : http://localhost:' + PORT);
  ips.forEach((ip) => {
    console.log('  autre appareil : http://' + ip + ':' + PORT + '/crash/   (bot : /crash/bot.html)');
  });
  console.log('Manches auto : ' + (WAIT_MS / 1000) + ' s de mise → vol → ' + (HOLD_MS / 1000) + ' s de crash');
});

