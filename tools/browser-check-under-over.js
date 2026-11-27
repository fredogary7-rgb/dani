/*
 * Test fonctionnel Under & Over 7 (Edge headless + CDP).
 *   node tools/browser-check-under-over.js
 */
'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9600 + Math.floor(Math.random() * 300);
const PAGE = 'http://localhost:8081/under-over-seven/';
const OUT_ROLL = path.join(__dirname, 'uo-roll.png');
const OUT_RESULT = path.join(__dirname, 'uo-result.png');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function log(ok, label, detail) {
  console.log((ok ? '  OK   ' : '  FAIL ') + label + (detail !== undefined ? ' : ' + detail : ''));
  if (!ok) process.exitCode = 1;
}

(async () => {
  const profile = path.join(os.tmpdir(), 'edge-uo-cdp-' + Date.now());
  const child = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--mute-audio',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + profile,
    '--window-size=1440,900',
    'about:blank',
  ], { stdio: 'ignore' });

  let targets = null;
  for (let i = 0; i < 60 && !targets; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
      if (list.some((t) => t.type === 'page')) targets = list;
    } catch (err) { /* attente */ }
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
      await sleep(100);
    }
    return false;
  };

  const balanceOf = () => evaluate(
    "parseFloat(document.querySelector('#balance').textContent.replace(/[^\\d,]/g,'').replace(',','.'))"
  );

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.setWebLifecycleState', { state: 'active' });
  await send('Page.navigate', { url: PAGE });
  await sleep(1200);

  console.log('\n--- Rendu initial ---');
  const chips = await evaluate("document.querySelectorAll('#history .hchip').length");
  const canvasSize = await evaluate("(function(){var c=document.getElementById('dice-canvas');return c.width+'x'+c.height;})()");
  const phase = await evaluate("document.querySelector('#phase-tag').textContent");
  log(chips === 8, 'historique de 8 sommes', chips);
  log(/^\d+x\d+$/.test(String(canvasSize)), 'canvas dimensionné', canvasSize);
  log(phase === 'Paris ouverts', 'phase initiale', phase);
  log((await balanceOf()) === 1000000, 'solde initial', await balanceOf());

  console.log('\n--- Mise sur Under 7 ---');
  await evaluate("document.querySelector('.zone-under').click()");
  await sleep(150);
  let balance = await balanceOf();
  const stakeUnder = await evaluate("document.querySelector('#stake-under').textContent");
  const total = await evaluate("document.querySelector('#stake-total').textContent");
  log(balance === 999900, 'débit de 100 FCFA', balance);
  log(/100\s*FCFA/.test(stakeUnder), 'mise affichée sur la zone', stakeUnder);
  log(/100\s*FCFA/.test(total), 'total engagé', total);

  console.log('\n--- Lancer ---');
  await evaluate("document.querySelector('#roll-btn').click()");
  await sleep(120);
  const rolling = await evaluate("document.querySelector('#phase-tag').textContent");
  log(rolling === 'Dés en jeu', 'phase de lancer', rolling);
  log(await evaluate("document.querySelector('#roll-btn').disabled"), 'bouton verrouillé pendant le lancer');

  await sleep(650);
  const shotRoll = await send('Page.captureScreenshot', { format: 'png' });
  if (shotRoll.result && shotRoll.result.data) {
    fs.writeFileSync(OUT_ROLL, Buffer.from(shotRoll.result.data, 'base64'));
  }

  const settled = await waitFor("document.querySelector('#phase-tag').textContent==='Résultat'", 8000);
  log(settled, 'résultat affiché');

  const sum = Number(await evaluate("document.querySelector('#sum-value').textContent"));
  const winZone = await evaluate("(document.querySelector('.zone.is-win')||{}).dataset ? document.querySelector('.zone.is-win').dataset.zone : ''");
  const hint = await evaluate("document.querySelector('#action-hint') ? '' : ''");
  const hintText = await evaluate("document.querySelector('#hint').textContent");
  const expected = sum < 7 ? 'under' : sum === 7 ? 'seven' : 'over';
  log(sum >= 2 && sum <= 12, 'somme entre 2 et 12', sum);
  log(winZone === expected, 'zone gagnante cohérente', winZone + ' / attendu ' + expected);

  balance = await balanceOf();
  const expectedBalance = 999900 + (expected === 'under' ? 200 : 0);
  log(Math.abs(balance - expectedBalance) < 0.01, 'paiement correct', balance + ' (attendu ' + expectedBalance + ')');
  log(/Gagné|Perdu/.test(hintText), 'message de résultat', hintText);

  const chips2 = await evaluate("document.querySelectorAll('#history .hchip').length");
  log(chips2 === 9, 'historique complété (9)', chips2);
  const firstChip = await evaluate("document.querySelector('#history .hchip').textContent");
  log(Number(firstChip) === sum, 'dernière somme en tête d\'historique', firstChip);

  const shotResult = await send('Page.captureScreenshot', { format: 'png' });
  if (shotResult.result && shotResult.result.data) {
    fs.writeFileSync(OUT_RESULT, Buffer.from(shotResult.result.data, 'base64'));
  }

  console.log('\n--- Mode 100 % manuel ---');
  await sleep(1500);
  const stillResult = await evaluate("document.querySelector('#phase-tag').textContent");
  const rollLabel = await evaluate("document.querySelector('#roll-btn').textContent");
  log(stillResult === 'Résultat', 'aucun redémarrage automatique', stillResult);
  log(rollLabel === 'Nouvelle manche', 'bouton de manche manuel', rollLabel);

  await evaluate("document.querySelector('#roll-btn').click()");
  await sleep(250);
  const nextRound = await evaluate("document.querySelector('#phase-tag').textContent");
  log(nextRound === 'Paris ouverts', 'nouvelle manche ouverte au clic', nextRound);

  const totalAfter = await evaluate("document.querySelector('#stake-total').textContent");
  log(/^0\s*FCFA/.test(totalAfter), 'mises remises à zéro', totalAfter);

  const before = await balanceOf();
  await evaluate("document.querySelector('.zone-over').click()");
  await sleep(120);
  await evaluate("document.querySelector('#clear-btn').click()");
  await sleep(120);
  const after = await balanceOf();
  log(Math.abs(after - before) < 0.01, 'effacement = remboursement', before + ' -> ' + after);

  console.log('\n--- Page de résultats ---');
  await send('Page.navigate', { url: PAGE + 'results.html' });
  await sleep(1000);

  const rowCount = await evaluate("document.querySelectorAll('#rows tr').length");
  const kpiRounds = await evaluate("document.querySelector('#kpi-rounds').textContent");
  const kpiLast = await evaluate("document.querySelector('#kpi-last').textContent");
  const distCount = await evaluate("document.querySelectorAll('#dist .dist-row').length");
  const cells = await evaluate("(function(){var r=document.querySelector('#rows tr');return r?Array.prototype.map.call(r.children,function(td){return td.textContent;}):[];})()");

  log(rowCount >= 1, 'journal alimenté', rowCount + ' ligne(s)');
  log(kpiRounds === String(rowCount), 'KPI = nombre de lignes', kpiRounds + ' / ' + rowCount);
  log(/= \d+$/.test(String(kpiLast)), 'dernier tirage affiché', kpiLast);
  log(distCount === 11, 'répartition 2 → 12', distCount);
  log(String(cells[4]) === String(sum), 'somme du journal = dernier tirage', cells[4] + ' vs ' + sum);
  log(Number(cells[2]) >= 1 && Number(cells[2]) <= 6 && Number(cells[3]) >= 1 && Number(cells[3]) <= 6, 'dés 1 et 2 valides', cells[2] + ' + ' + cells[3]);
  const expectedNet = sum < 7 ? '+ 100 FCFA' : '- 100 FCFA';
  log(String(cells[7]).indexOf(expectedNet) === 0, 'gain/perte cohérent', cells[7] + ' (attendu ' + expectedNet + ')');

  const shotRes = await send('Page.captureScreenshot', { format: 'png' });
  if (shotRes.result && shotRes.result.data) {
    fs.writeFileSync(path.join(__dirname, 'uo-results.png'), Buffer.from(shotRes.result.data, 'base64'));
  }

  console.log('\n--- Tableau des résultats ---');
  await send('Page.navigate', { url: PAGE + 'board.html' });
  await sleep(900);

  const heroSign = await evaluate("document.querySelector('#hero-sign').textContent");
  const heroSub = await evaluate("document.querySelector('#hero-sub').textContent");
  const pills = await evaluate("document.querySelectorAll('#strip .pill').length");
  const countUnder = await evaluate("document.querySelector('#count-under').textContent");
  const expectedSign = sum < 7 ? '−7' : sum === 7 ? '7' : '+7';
  log(heroSign === expectedSign, 'signe du dernier tirage', heroSign + ' (attendu ' + expectedSign + ')');
  log(/somme \d+ · dés \d \+ \d/.test(String(heroSub)), 'détail « dés + somme »', heroSub);
  log(pills === 1, 'bande des tirages', pills + ' pastille(s)');
  log(Number(countUnder) === (sum < 7 ? 1 : 0), 'compteur −7', countUnder);

  const shotBoard = await send('Page.captureScreenshot', { format: 'png' });
  if (shotBoard.result && shotBoard.result.data) {
    fs.writeFileSync(path.join(__dirname, 'uo-board.png'), Buffer.from(shotBoard.result.data, 'base64'));
  }

  console.log('\n--- Page bot : valeur programmée ---');
  await send('Page.navigate', { url: PAGE + 'bot.html' });
  await sleep(900);

  const predSign = await evaluate("document.querySelector('#pred-sign').textContent");
  const predDetail = await evaluate("document.querySelector('#pred-detail').textContent");
  const predPos = await evaluate("document.querySelector('#pred-pos').textContent");
  const peekedSum = Number((String(predDetail).match(/=\s*(\d+)/) || [])[1]);

  log(['−7', '7', '+7'].indexOf(predSign) >= 0, 'issue programmée affichée', predSign);
  log(peekedSum >= 2 && peekedSum <= 12, 'dés annoncés', predDetail);
  log(/programme n°\d+/.test(String(predPos)), 'position dans le programme', predPos);

  const shotBot = await send('Page.captureScreenshot', { format: 'png' });
  if (shotBot.result && shotBot.result.data) {
    fs.writeFileSync(path.join(__dirname, 'uo-bot.png'), Buffer.from(shotBot.result.data, 'base64'));
  }

  // Le jeu doit tirer EXACTEMENT la valeur annoncée par le bot
  await send('Page.navigate', { url: PAGE });
  await sleep(900);
  await evaluate("document.querySelector('.zone-under').click()");
  await sleep(120);
  await evaluate("document.querySelector('#roll-btn').click()");
  const rolledOk = await waitFor("document.querySelector('#phase-tag').textContent==='Résultat'", 8000);
  const rolledSum = Number(await evaluate("document.querySelector('#sum-value').textContent"));
  log(rolledOk && rolledSum === peekedSum, 'le jeu tire la valeur annoncée', rolledSum + ' vs ' + peekedSum);

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

