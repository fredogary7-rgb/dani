/*
 * Test fonctionnel du jeu dans un vrai moteur (Edge headless + CDP).
 *   node tools/browser-check.js
 *
 * Vérifie : rendu initial, placement/annulation de pari, retrait, crash,
 * historique, absence d'erreurs JS — puis enregistre tools/flight.png.
 */
'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9300 + Math.floor(Math.random() * 600);
const PAGE = process.env.DANI_URL || 'http://localhost:8081/crash/';
const OUT_CRASH = path.join(__dirname, 'crash.png');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function log(ok, label, detail) {
  console.log((ok ? '  OK   ' : '  FAIL ') + label + (detail !== undefined ? ' : ' + detail : ''));
  if (!ok) process.exitCode = 1;
}

(async () => {
  const profile = path.join(os.tmpdir(), 'edge-crash-cdp-' + Date.now());
  const child = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--mute-audio',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
    '--disable-features=CalculateNativeWinOcclusion',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + profile,
    '--window-size=1440,900',
    'about:blank',
  ], { stdio: 'ignore' });

  let targets = null;
  for (let i = 0; i < 60 && !targets; i++) {
    try {
      const res = await fetch('http://127.0.0.1:' + PORT + '/json/list');
      const list = await res.json();
      if (list.some((t) => t.type === 'page')) targets = list;
    } catch (err) { /* pas encore prêt */ }
    if (!targets) await sleep(250);
  }
  if (!targets) { child.kill(); throw new Error('Impossible de joindre Edge (CDP)'); }

  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });

  let seq = 0;
  const pending = new Map();
  const errors = [];

  ws.onmessage = (ev) => {
    const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : '');
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      errors.push((d.exception && d.exception.description) || d.text);
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      errors.push(msg.params.args.map((a) => String(a.value)).join(' '));
    }
  };

  const send = (method, params) => new Promise((resolve) => {
    const id = ++seq;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });

  const evaluate = async (expression) => {
    const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (res.result && res.result.exceptionDetails) {
      errors.push(res.result.exceptionDetails.text);
      return undefined;
    }
    return res.result && res.result.result ? res.result.result.value : undefined;
  };

  const waitFor = async (expression, timeout) => {
    const until = Date.now() + (timeout || 8000);
    while (Date.now() < until) {
      if (await evaluate(expression)) return true;
      await sleep(120);
    }
    return false;
  };

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.setWebLifecycleState', { state: 'active' });
  await send('Page.navigate', { url: PAGE });
  await sleep(1200);

  console.log('\n--- Rendu initial ---');
  const chips = await evaluate("document.querySelectorAll('#history .chip').length");
  const rows = await evaluate("document.querySelectorAll('#live-list .live-item').length");
  const canvas = await evaluate("(function(){var c=document.getElementById('graph');return c.width+'x'+c.height;})()");
  const phase = await evaluate("document.querySelector('#phase-tag').textContent");
  log(chips === 10, 'historique de 10 crashs', chips);
  log(rows >= 5, 'joueurs simulés affichés', rows);
  log(/^\d+x\d+$/.test(String(canvas)), 'canvas dimensionné', canvas);
  log(phase === 'En attente', 'phase initiale', phase);

  console.log('\n--- Pari + annulation ---');
  await evaluate("document.querySelector('#bet-input').value='50'");
  await evaluate("document.querySelector('#action-btn').click()");
  await sleep(150);
  let balance = await evaluate("document.querySelector('#balance').textContent");
  let main = await evaluate("document.querySelector('#action-main').textContent");
  log(/950\s*FCFA/.test(balance), 'débit de la mise', balance);
  log(/ANNULER/i.test(main), 'bouton passe en annulation', main);
  await evaluate("document.querySelector('#action-btn').click()");
  await sleep(150);
  balance = await evaluate("document.querySelector('#balance').textContent");
  log(/1\s?000\s*FCFA/.test(balance), 'remboursement', balance);

  console.log('\n--- Retrait pendant le vol ---');
  let flightOk = false;
  let hint = '';
  for (let attempt = 1; attempt <= 3 && !flightOk; attempt++) {
    await waitFor("document.querySelector('#phase-tag').textContent==='En attente'", 25000);
    const balanceBefore = await evaluate("parseFloat(document.querySelector('#balance').textContent.replace(/[^\\d,]/g,'').replace(',','.'))");
    await evaluate("document.querySelector('#bet-input').value='100'");
    await evaluate("document.querySelector('#action-btn').click()");
    await sleep(100);

    const flying = await waitFor("document.querySelector('#phase-tag').textContent==='En cours'", 15000);
    if (!flying) {
      console.log('  ...  crash instantané (1.00×), nouvelle tentative');
      continue;
    }
    log(true, 'le vol démarre', await evaluate("document.querySelector('#stage-foot-left').textContent"));

    // Le bouton doit basculer en « Retirer » dès le décollage ; sinon la manche
    // a crashé trop vite (crash < 1,02×) et on retente.
    const cashReady = await waitFor(
      "/^Retirer/.test(document.querySelector('#action-main').textContent) && parseFloat(document.querySelector('#multiplier em').textContent) >= 1.05",
      3000
    );
    if (!cashReady) {
      console.log('  ...  manche trop courte, nouvelle tentative');
      await waitFor("document.querySelector('#phase-tag').textContent==='En attente'", 15000);
      continue;
    }

    const multText = await evaluate("document.querySelector('#multiplier em').textContent");
    const cashLabel = await evaluate("document.querySelector('#action-main').textContent");
    log(parseFloat(multText) >= 1, 'multiplicateur animé', multText);
    log(/Retirer/.test(cashLabel), 'bouton de retrait', cashLabel);

    await evaluate("document.querySelector('#action-btn').click()");
    await sleep(200);
    balance = await evaluate("document.querySelector('#balance').textContent");
    hint = await evaluate("document.querySelector('#action-hint').textContent");
    const balNum = parseFloat(String(balance).replace(/[^\d,]/g, '').replace(',', '.'));
    log(/Retiré/.test(hint), 'retrait encaissé', hint);
    log(balNum > balanceBefore, 'solde crédité', balance + ' (avant ' + balanceBefore + ')');
    flightOk = /Retiré/.test(hint);
  }
  log(flightOk, 'retrait validé en 3 tentatives max');

  console.log('\n--- Crash + tour suivant ---');
  let crashed = false;
  for (let i = 0; i < 300 && !crashed; i++) {
    crashed = await evaluate("document.querySelector('#phase-tag').textContent==='Crash'");
    if (!crashed && i % 25 === 0) {
      await send('Page.bringToFront');
      const mult2 = await evaluate("document.querySelector('#multiplier em').textContent");
      const foot2 = await evaluate("document.querySelector('#stage-foot-left').textContent");
      const vis = await evaluate("document.visibilityState + ' / now=' + Math.round(performance.now())");
      console.log('   ...  ' + mult2 + '  |  ' + foot2 + '  |  ' + vis);
    }
    if (!crashed) await sleep(120);
  }
  log(crashed, 'crash détecté', await evaluate("document.querySelector('#stage-status').textContent"));

  await sleep(220);
  const shot3 = await send('Page.captureScreenshot', { format: 'png' });
  if (shot3.result && shot3.result.data) {
    fs.writeFileSync(OUT_CRASH, Buffer.from(shot3.result.data, 'base64'));
  }
  const chips2 = await evaluate("document.querySelectorAll('#history .chip').length");
  log(chips2 > chips && chips2 <= 14, 'historique mis à jour', chips2 + ' chips');
  const nextRound = await waitFor("document.querySelector('#phase-tag').textContent==='En attente'", 8000);
  log(nextRound, 'nouveau tour enchaîné');

  console.log('\n--- Erreurs JavaScript ---');
  log(errors.length === 0, 'aucune erreur console', errors.join(' | ') || 'aucune');

  ws.close();
  child.kill();
  await sleep(400);
  console.log('\nTerminé.');
})().catch((err) => {
  console.error('ERREUR:', err && err.message);
  process.exit(1);
});

