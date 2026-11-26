/*
 * Serveur statique minimal pour tester la démo (aucune dépendance).
 *   node tools/serve.js [port]        (8080 par défaut)
 */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.argv[2] || 8080);

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

http.createServer((req, res) => {
  let pathname = '/';
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch (err) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Requête invalide');
    return;
  }

  let rel = pathname.replace(/^\/+/, '');
  if (rel === '' || rel.slice(-1) === '/') rel += 'index.html';
  const file = path.resolve(ROOT, rel);
  if (!file.startsWith(ROOT)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Interdit');
    return;
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 — fichier introuvable');
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
    console.log(new Date().toISOString() + '  200  ' + pathname);
  });
}).listen(PORT, '127.0.0.1', () => {
  console.log('Crash démo servie sur http://localhost:' + PORT);
  console.log('Racine : ' + ROOT);
});
