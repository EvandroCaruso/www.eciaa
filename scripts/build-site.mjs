#!/usr/bin/env node
/**
 * build-site.mjs — monta dist/ com APENAS o que é público.
 *
 * Por que existe: no GitHub Pages a raiz do repo era publicada inteira, o que
 * expunha código-fonte em produção (medido em 2026-08-12: /flow-editor/src/lib/api.js,
 * /flow-editor/package-lock.json e /README.md respondiam 200 no ar). Aqui a regra
 * inverte: nada vai ao ar sem estar na allowlist abaixo.
 *
 * Node puro, ZERO dependência — não roda npm install no build da Cloudflare.
 *
 * Uso:  node scripts/build-site.mjs
 */

import { cp, mkdir, rm, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'dist');

/** Arquivos e diretórios que VÃO ao ar. Nada fora desta lista é publicado. */
const INCLUDE = [
  // páginas
  'index.html',
  '404.html',
  'politica-exclusao-dados.html',
  'termos-de-servico.html',
  // design system + scripts de página
  'styles.css',
  'consent.js',
  // identidade
  'favicon.svg',
  'logo.png',
  'og-image.png',
  // SEO
  'robots.txt',
  'sitemap.xml',
  // configuração de borda do Cloudflare Pages
  '_headers',
  '_redirects',
  // blog (com exclusões abaixo)
  'blog',
  // bundle já buildado do construtor de fluxos
  'flow-editor/dist',
];

/** Exclusões aplicadas DENTRO dos diretórios incluídos. */
const EXCLUDE = new Set([
  'blog/posts/TEMPLATE-novo-post.html', // template de autoria, não é conteúdo
]);

/**
 * Nunca publicado (documentado só para deixar a intenção explícita e auditável;
 * a proteção real é a allowlist, não esta lista).
 */
const NEVER = [
  'README.md                    (doc interna)',
  'CNAME                        (só o GitHub Pages usa)',
  '.nojekyll                    (só o GitHub Pages usa)',
  'scripts/                     (build e migração)',
  'flow-editor/index.html       (entry de DEV do Vite; ver _redirects)',
  'flow-editor/src/             (código-fonte — vazava em produção)',
  'flow-editor/scripts/',
  'flow-editor/package.json · package-lock.json · vite.config.js',
  'flow-editor/node_modules/',
];

const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

const missing = INCLUDE.filter((item) => !existsSync(path.join(ROOT, item)));
if (missing.length) {
  console.error(`✖ allowlist aponta para caminho inexistente: ${missing.join(', ')}`);
  process.exit(1);
}

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

let files = 0;
let bytes = 0;
const skipped = [];

for (const item of INCLUDE) {
  const src = path.join(ROOT, item);
  const sources = (await stat(src)).isDirectory() ? await walk(src) : [src];

  for (const file of sources) {
    const key = rel(file);
    if (EXCLUDE.has(key)) {
      skipped.push(key);
      continue;
    }
    const dest = path.join(OUT, key);
    await mkdir(path.dirname(dest), { recursive: true });
    await cp(file, dest);
    files += 1;
    bytes += (await stat(file)).size;
  }
}

console.log(`✔ dist/ montado: ${files} arquivos, ${(bytes / 1024 / 1024).toFixed(2)} MB`);
if (skipped.length) console.log(`  excluídos por EXCLUDE: ${skipped.join(', ')}`);
console.log('  nunca publicados:');
for (const line of NEVER) console.log(`    · ${line}`);
