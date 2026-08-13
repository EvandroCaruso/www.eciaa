#!/usr/bin/env node
/**
 * serve-dist.mjs — serve dist/ localmente IMITANDO o Cloudflare Pages.
 *
 * Não é um servidor de propósito geral: ele existe para que o preview local
 * tenha o mesmo comportamento da borda — extensionless, redirect .html -> sem
 * extensão, _redirects e 404.html com status 404 de verdade. Testar com um
 * servidor estático comum provaria o servidor, não o site.
 *
 * Uso:  node scripts/serve-dist.mjs [porta]   (default 4173)
 */

import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.argv[2] || 4173);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
};

const redirects = new Map();
if (existsSync(path.join(DIST, '_redirects'))) {
  for (const line of (await readFile(path.join(DIST, '_redirects'), 'utf8')).split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const [from, to, code] = line.trim().split(/\s+/);
    redirects.set(from, { to, code: Number(code || 302) });
  }
}

/** Cabeçalhos declarados em _headers, para o glob mais simples (/*). */
const globalHeaders = {};
if (existsSync(path.join(DIST, '_headers'))) {
  let current = null;
  for (const line of (await readFile(path.join(DIST, '_headers'), 'utf8')).split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!line.startsWith(' ') && !line.startsWith('\t')) {
      current = line.trim();
      continue;
    }
    if (current === '/*') {
      const [k, ...v] = line.trim().split(':');
      globalHeaders[k] = v.join(':').trim();
    }
  }
}

const isFile = (p) => {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
};

async function nearest404(dir) {
  while (dir.startsWith(DIST)) {
    const candidate = path.join(dir, '404.html');
    if (isFile(candidate)) return candidate;
    dir = path.dirname(dir);
  }
  return null;
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let pathname = decodeURIComponent(url.pathname);

  if (redirects.has(pathname)) {
    const { to, code } = redirects.get(pathname);
    res.writeHead(code, { Location: to });
    return res.end();
  }

  // comportamento embutido do Pages: /foo.html -> /foo (o motivo da migração de URL)
  if (pathname.endsWith('.html') && !pathname.endsWith('/index.html')) {
    res.writeHead(308, { Location: pathname.slice(0, -'.html'.length) });
    return res.end();
  }
  if (pathname.endsWith('/index.html')) {
    res.writeHead(308, { Location: pathname.slice(0, -'index.html'.length) });
    return res.end();
  }

  const candidates = pathname.endsWith('/')
    ? [path.join(DIST, pathname, 'index.html')]
    : [path.join(DIST, pathname), path.join(DIST, `${pathname}.html`), path.join(DIST, pathname, 'index.html')];

  const hit = candidates.find(isFile);
  if (hit) {
    const body = await readFile(hit);
    res.writeHead(200, { ...globalHeaders, 'Content-Type': TYPES[path.extname(hit)] || 'application/octet-stream' });
    return res.end(body);
  }

  const notFound = await nearest404(path.join(DIST, pathname));
  if (notFound) {
    res.writeHead(404, { ...globalHeaders, 'Content-Type': TYPES['.html'] });
    return res.end(await readFile(notFound));
  }
  res.writeHead(404).end('404');
}).listen(PORT, () => console.log(`dist/ em http://localhost:${PORT} (regras do Pages)`));
