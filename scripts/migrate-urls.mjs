#!/usr/bin/env node
/**
 * migrate-urls.mjs — troca as URLs .html por extensionless (uso ÚNICO).
 *
 * Por que: o Cloudflare Pages redireciona /foo.html -> /foo por comportamento
 * embutido e NÃO configurável. Sem isso, todo link interno, canonical, og:url e
 * entrada de sitemap passaria a apontar para uma URL que redireciona.
 *
 * Seguro rodar antes do cutover: o GitHub Pages já serve as duas formas com 200
 * (verificado em 2026-08-12), então a troca vale nas duas hospedagens.
 *
 * Uso:
 *   node scripts/migrate-urls.mjs           # dry-run: só relata
 *   node scripts/migrate-urls.mjs --apply   # grava
 */

import { readFile, writeFile } from 'node:fs/promises';
import { readdir } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const APPLY = process.argv.includes('--apply');

/** Diretórios varridos. flow-editor e node_modules ficam de fora de propósito. */
const SCAN_DIRS = ['', 'blog', 'blog/posts'];

/** Extensionless de um caminho: /a/b.html -> /a/b · /a/index.html -> /a/ */
function strip(urlPath) {
  if (urlPath.endsWith('/index.html')) return urlPath.slice(0, -'index.html'.length);
  return urlPath.replace(/\.html$/, '');
}

/**
 * Cada regra é ancorada num contexto sintático — nunca um replace solto de
 * ".html", que pegaria exemplo de código dentro das matérias.
 */
const RULES = [
  {
    name: 'href relativo/raiz',
    // href="/x.html" · href="x.html" · href="../x.html" — sem esquema
    re: /(href=")((?!https?:|mailto:|tel:|#)[^"]*?\.html)(")/g,
    apply: (m, a, url, b) => a + strip(url) + b,
  },
  {
    name: 'URL absoluta do site (href, content, JSON-LD, <loc>)',
    // qualquer https://www.eciaa.com.br/...html dentro de aspas ou de <loc>
    re: /(https:\/\/www\.eciaa\.com\.br\/[^"'<\s]*?\.html)/g,
    apply: (m, url) => {
      const u = new URL(url);
      return `https://www.eciaa.com.br${strip(u.pathname)}${u.search}${u.hash}`;
    },
  },
];

async function targets() {
  const out = [];
  for (const dir of SCAN_DIRS) {
    const abs = path.join(ROOT, dir);
    for (const entry of await readdir(abs, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      if (!/\.(html|xml)$/.test(entry.name)) continue;
      out.push(path.join(abs, entry.name));
    }
  }
  return out;
}

let totalHits = 0;
const report = [];

for (const file of await targets()) {
  const before = await readFile(file, 'utf8');
  let after = before;
  const perRule = [];

  for (const rule of RULES) {
    let hits = 0;
    after = after.replace(rule.re, (...args) => {
      hits += 1;
      return rule.apply(...args);
    });
    if (hits) perRule.push(`${rule.name}: ${hits}`);
  }

  if (after === before) continue;

  // quantas linhas efetivamente mudaram (auditoria: o número tem que fazer sentido)
  const changedLines = before
    .split('\n')
    .filter((line, i) => line !== after.split('\n')[i]).length;

  const hits = perRule.reduce((s, r) => s + Number(r.split(': ')[1]), 0);
  totalHits += hits;
  report.push({ file: path.relative(ROOT, file), hits, changedLines, perRule });

  if (APPLY) await writeFile(file, after, 'utf8');
}

for (const r of report) {
  console.log(`${APPLY ? '✔' : '·'} ${r.file} — ${r.hits} URLs em ${r.changedLines} linhas`);
  for (const line of r.perRule) console.log(`    ${line}`);
}
console.log(`\n${APPLY ? 'GRAVADO' : 'DRY-RUN'}: ${totalHits} URLs em ${report.length} arquivos`);

// Verificação final: não pode sobrar nenhuma URL interna .html nos contextos tratados.
if (APPLY) {
  const leftovers = [];
  for (const file of await targets()) {
    const text = await readFile(file, 'utf8');
    for (const rule of RULES) {
      const found = text.match(rule.re);
      if (found) leftovers.push(`${path.relative(ROOT, file)}: ${found.join(', ')}`);
    }
  }
  if (leftovers.length) {
    console.error('\n✖ SOBROU URL .html nos contextos tratados:');
    for (const l of leftovers) console.error(`  ${l}`);
    process.exit(1);
  }
  console.log('✔ verificação: nenhuma URL .html restante nos contextos tratados');
}
