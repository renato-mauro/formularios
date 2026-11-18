// Servidor estático mínimo para desenvolvimento (sem dependências): serve o
// monorepo inteiro; "/" abre a interface web (packages/web).
// Uso: npm start   (ou: node scripts/serve.js, PORT=3000 node scripts/serve.js)
// Com --pages, serve só packages/web/dist em /formularios/, como o GitHub Pages
// (npm run pages: testa, monta o dist e serve).
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGES = process.argv.includes('--pages');
const ROOT = PAGES ? path.join(REPO, 'packages/web/dist') : REPO;
const BASE = PAGES ? '/formularios/' : '/'; // no Pages, o site fica numa subpasta
const PORT = Number(process.env.PORT) || 8080;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/' || `${url.pathname}/` === BASE) return redirect(res, PAGES ? BASE : '/packages/web/');
  if (!url.pathname.startsWith(BASE)) return send(res, 404, 'Não encontrado');
  const file = path.join(ROOT, decodeURIComponent(url.pathname.slice(BASE.length - 1)));
  if (!file.startsWith(ROOT)) return send(res, 403, 'Proibido');
  try {
    const info = await stat(file);
    if (info.isDirectory()) {
      if (!url.pathname.endsWith('/')) return redirect(res, `${url.pathname}/`);
      return serve(res, path.join(file, 'index.html'));
    }
    return serve(res, file);
  } catch {
    return send(res, 404, 'Não encontrado');
  }
});

async function serve(res, file) {
  try {
    await stat(file);
  } catch {
    return send(res, 404, 'Não encontrado');
  }
  res.writeHead(200, {
    'Content-Type': TYPES[path.extname(file)] || 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  createReadStream(file).pipe(res);
}

function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

function send(res, status, text) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(text);
}

server.listen(PORT, () => {
  if (PAGES) {
    console.log(`Como no GitHub Pages: http://localhost:${PORT}${BASE}`);
    console.log('Ctrl+C para parar.');
    return;
  }
  console.log(`Servidor em http://localhost:${PORT}`);
  console.log(`  Interface web:    http://localhost:${PORT}/packages/web/`);
  console.log(`  Exemplo gerado:   http://localhost:${PORT}/examples/saida/clientes.html (npm run exemplo)`);
  console.log('Ctrl+C para parar.');
});
