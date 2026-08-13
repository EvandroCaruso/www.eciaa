#!/usr/bin/env node
/**
 * check-links.mjs — todo link interno do dist/ resolve? (0 dependências)
 *
 * Existe porque a migração para URL sem extensão reescreveu 81 URLs de uma vez.
 * Contar substituições não prova nada: prova é cada link resolver para um arquivo
 * real, aplicando as MESMAS regras de resolução do Cloudflare Pages.
 *
 * Também serve de guarda permanente: matéria nova com link torto falha aqui.
 *
 * Uso:  node scripts/check-links.mjs
 */

import { readFile, readdir } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');
const SITE = 'https://www.eciaa.com.br';

if (!existsSync(DIST)) {
  console.error('✖ dist/ não existe — rode `node scripts/build-site.mjs` primeiro.');
  process.exit(1);
}

/** Redirects declarados em _redirects (origem -> destino). */
const redirects = new Map();
if (existsSync(path.join(DIST, '_redirects'))) {
  const text = await readFile(path.join(DIST, '_redirects'), 'utf8');
  for (const line of text.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const [from, to] = line.trim().split(/\s+/);
    redirects.set(from, to);
  }
}

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

const isFile = (p) => {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
};

/** Resolução do Cloudflare Pages: exato, /index.html, +.html, e os _redirects. */
function resolves(urlPath) {
  if (redirects.has(urlPath)) urlPath = redirects.get(urlPath);
  const clean = urlPath.split('#')[0].split('?')[0];
  const candidates = clean.endsWith('/')
    ? [path.join(DIST, clean, 'index.html')]
    : [
        path.join(DIST, clean),
        path.join(DIST, `${clean}.html`),
        path.join(DIST, clean, 'index.html'),
      ];
  return candidates.some(isFile);
}

const files = (await walk(DIST)).filter((f) => f.endsWith('.html'));
const broken = [];
let checked = 0;
let external = 0;

for (const file of files) {
  const html = await readFile(file, 'utf8');
  const pageDir = path.dirname(path.relative(DIST, file)).split(path.sep).join('/');

  for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    let raw = m[1];
    if (/^(mailto:|tel:|javascript:|data:|#)/.test(raw)) continue;
    if (raw.startsWith(SITE)) raw = raw.slice(SITE.length) || '/';
    else if (/^https?:\/\//.test(raw)) {
      external += 1;
      continue;
    }

    // relativo à página, se não começar com /
    const abs = raw.startsWith('/')
      ? raw
      : `/${path.posix.normalize(`${pageDir === '.' ? '' : pageDir}/${raw}`)}`;

    checked += 1;
    if (!resolves(abs)) {
      broken.push(`${path.relative(DIST, file).split(path.sep).join('/')} -> ${raw}`);
    }
  }
}

console.log(`páginas: ${files.length} · links internos: ${checked} · externos ignorados: ${external}`);
if (broken.length) {
  console.error(`\n✖ ${broken.length} link(s) interno(s) quebrado(s):`);
  for (const b of broken) console.error(`  ${b}`);
  process.exit(1);
}
console.log('✔ todo link interno resolve');
