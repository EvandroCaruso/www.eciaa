/**
 * Resumo de um bloco para exibição — DEFINIÇÃO ÚNICA.
 *
 * ⚠️ Este arquivo existe por causa de um bug já pago neste projeto: o indicador
 * 🟢/🟡 nasceu com uma regra na lista e outra no editor, o mesmo fluxo aparecia
 * diferente em cada tela, e cada tela passava nos testes ISOLADAMENTE. Card do
 * canvas e painel de propriedades importam daqui — nenhum dos dois recalcula.
 */

import { precisaExecutorNovo, buildMirrors } from './subblocks.js'

const LIMITE = 42

function corta(s, n = LIMITE) {
  const t = String(s || '').replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n - 1) + '…' : t
}

/** Uma linha por sub-bloco: o que a pessoa precisa reconhecer sem abrir. */
export function resumoSubBloco(bloco, subTypes = []) {
  const spec = (subTypes || []).find((s) => s.kind === bloco.kind)
  const icone = (spec && spec.icon) || '•'
  const label = (spec && spec.label) || bloco.kind

  switch (bloco.kind) {
    case 'text':
      return `${icone} ${corta(bloco.text) || 'texto vazio'}`
    case 'delay': {
      const s = Number(bloco.seconds) || 0
      const n = Number.isInteger(s) ? String(s) : String(s).replace('.', ',')
      return `${icone} ${n}s${bloco.typing ? ' digitando' : ''}`
    }
    case 'contact':
      return `${icone} ${corta(bloco.display_name) || 'contato'}`
    default: {
      const legenda = corta(bloco.caption, 24)
      const nome = bloco.asset_name ? corta(bloco.asset_name, 24) : ''
      const extra = legenda || nome
      return `${icone} ${label}${extra ? ` · ${extra}` : ''}`
    }
  }
}

/** Resumo do bloco inteiro, para o card do canvas. */
export function resumoBloco(parameters, subTypes = []) {
  const blocks = (parameters && parameters.blocks) || []
  if (!blocks.length) return ''
  return blocks.map((b) => resumoSubBloco(b, subTypes)).join(' · ')
}

/**
 * Aviso de runtime, também com definição única.
 *
 * São dois casos diferentes, e dizer os dois com a mesma frase seria impreciso:
 *  - o bloco não tem texto nenhum → o runtime atual não envia NADA dele;
 *  - o bloco tem texto e também mídia → sai só o texto.
 *
 * O que sobrevive hoje são os espelhos (`text` e `delay_seconds`); a pausa
 * acontece de verdade, só o "digitando" é que ainda não.
 */
export function avisoRuntime(parameters) {
  const blocks = (parameters && parameters.blocks) || []
  if (!blocks.length || !precisaExecutorNovo(blocks)) return null

  const { text } = buildMirrors(blocks)
  return text
    ? 'O envio atual usa só o texto deste bloco; mídia e contato ainda não são enviados.'
    : 'O envio atual não manda nada deste bloco: ele não tem texto, e mídia e contato ainda não são enviados.'
}
