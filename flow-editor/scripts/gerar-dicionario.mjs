/**
 * Reescreve a tabela de operadores do dicionário do executor a partir de
 * `src/core/condition.js`.
 *
 * Por que existe: a tabela é a MESMA informação que vive no código. Mantê-la
 * escrita à mão nos dois lugares recria o problema do `labelOp()` duplicado — só
 * que entre código e documentação, onde divergir não dá teste vermelho.
 *
 * O lar do documento é o VAULT (um lar só). Este repositório tem apenas o
 * gerador. Só o bloco marcado é tocado; as colunas que o código não sabe (ação em
 * runtime, o que fazer se não souber, origem do dado) ficam fora dele e nunca são
 * sobrescritas.
 *
 *   npm run dicionario
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { OPERADORES } from '../src/core/condition.js'

const DESTINO =
  process.env.MSGFLOW_DICIONARIO ||
  'G:/Meu Drive/Obsidian/ECiaa_Compartilhado/Code_Brain_Compartilhado/05-Projetos/mini-apps/msgflow-builder/dicionario-executor.md'

const INICIO = '<!-- GERADO: operadores'
const FIM = '<!-- /GERADO -->'

/** Como o valor de cada sujeito se descreve. O código sabe a aridade; o formato é daqui. */
const FORMATO = {
  label: () => '`string` — o **`title`** da etiqueta',
  weekday: () => "`'mon'…'sun'`",
  time: (a) => (a === 2 ? "`['HH:MM','HH:MM']`" : "`'HH:MM'` 24 h"),
  business_hours: () => '—',
  assignee: () => '`number` (id do agente) ou ausente',
  'field:text': (a) => (a === 0 ? '—' : '`string`'),
  'field:date': (a) => (a === 2 ? "`['YYYY-MM-DD','YYYY-MM-DD']`" : a === 0 ? '—' : "`'YYYY-MM-DD'`"),
  'field:number': (a) => (a === 2 ? '`[number, number]`' : a === 0 ? '—' : '`number` JSON (não string)')
}

const NOME_SUJEITO = {
  'field:text': '`field` + `text`',
  'field:date': '`field` + `date`',
  'field:number': '`field` + `number`'
}

const linhas = []
for (const [chave, ops] of Object.entries(OPERADORES)) {
  // agrupa por aridade: operadores que consomem o mesmo número de valores
  // descrevem o mesmo formato, e uma linha por operador incharia a tabela
  const porAridade = new Map()
  for (const op of ops) {
    const k = `${op.aridade}|${op.opcional ? 'opc' : ''}`
    if (!porAridade.has(k)) porAridade.set(k, { aridade: op.aridade, opcional: op.opcional, itens: [] })
    porAridade.get(k).itens.push(op)
  }
  for (const g of porAridade.values()) {
    const nomes = g.itens.map((o) => (o.id === o.label ? `\`${o.id}\`` : `\`${o.id}\` (${o.label})`)).join(' · ')
    const aridade = g.aridade === 1 && g.opcional ? '1, **opcional**' : String(g.aridade)
    const fmt = (FORMATO[chave] || (() => '—'))(g.aridade)
    linhas.push(`| ${NOME_SUJEITO[chave] || '`' + chave + '`'} | ${nomes} | ${aridade} | ${fmt} |`)
  }
}

const tabela = [
  '',
  '| subject | op | aridade | valor |',
  '|---|---|---|---|',
  ...linhas,
  ''
].join('\n')

if (!existsSync(DESTINO)) {
  console.error(`Documento não encontrado: ${DESTINO}`)
  console.error('O vault está montado? Ou aponte outro caminho em MSGFLOW_DICIONARIO.')
  process.exit(1)
}

const doc = readFileSync(DESTINO, 'utf8')
const i = doc.indexOf(INICIO)
const j = doc.indexOf(FIM)
if (i < 0 || j < 0 || j < i) {
  console.error(`Marcadores "${INICIO}" / "${FIM}" não encontrados em ${DESTINO}.`)
  process.exit(1)
}

const fimDoComentarioDeAbertura = doc.indexOf('-->', i) + 3
const novo = doc.slice(0, fimDoComentarioDeAbertura) + '\n' + tabela + '\n' + doc.slice(j)

if (novo === doc) {
  console.log('Dicionário já estava em dia.')
} else {
  writeFileSync(DESTINO, novo, 'utf8')
  console.log(`Dicionário atualizado: ${linhas.length} linhas de operador.`)
  console.log('Confira o git do VAULT: diff pendente significa que o documento estava velho.')
}
