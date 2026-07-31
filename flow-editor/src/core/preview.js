/**
 * Resumo de um bloco para exibição — DEFINIÇÃO ÚNICA.
 *
 * ⚠️ Este arquivo existe por causa de um bug já pago neste projeto: o indicador
 * 🟢/🟡 nasceu com uma regra na lista e outra no editor, o mesmo fluxo aparecia
 * diferente em cada tela, e cada tela passava nos testes ISOLADAMENTE. Card do
 * canvas e painel de propriedades importam daqui — nenhum dos dois recalcula.
 */

import { operadorSpec, labelOperador, condicaoIncompleta, DIAS_SEMANA } from './condition.js'

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

/** Uma linha por parte, na ordem — é o que o card do canvas desenha. */
export function linhasDoBloco(parameters, subTypes = []) {
  const blocks = (parameters && parameters.blocks) || []
  return blocks.map((b) => resumoSubBloco(b, subTypes))
}

/**
 * Resumo do bloco inteiro para o card do canvas.
 *
 * ⚠️ Uma parte POR LINHA, não separadas por " · ": com cinco partes a linha
 * única virava um parágrafo ilegível dentro do card. O card cresce junto (o CSS
 * usa `white-space: pre-line`).
 */
export function resumoBloco(parameters, subTypes = []) {
  return linhasDoBloco(parameters, subTypes).join('\n')
}

/**
 * Resumo de UMA condição, em três partes — é como o painel desenha o card e como
 * o canvas monta a linha.
 *
 * `ctx` traz os rótulos vivos: `{ sujeitos, campos, agentes }`. Quando o rótulo
 * não está lá (cwmkt fora do ar, campo apagado), cai na FOTOGRAFIA gravada na
 * própria condição (`field_label`, `value_label`) e só então na chave crua. É por
 * isso que o card continua legível com o cwmkt caído.
 */
export function resumoCondicao(c, ctx = {}) {
  const sujeitos = ctx.sujeitos || {}
  const campos = ctx.campos || {}
  const agentes = ctx.agentes || {}

  if (!c) return { titulo: '', operador: '', valor: '', incompleta: true }

  if (c.subject === 'legacy') {
    return {
      titulo: c.attr || 'regra antiga',
      operador: LABEL_OP_LEGADO[c.op] || c.op || '',
      valor: c.op === 'exists' ? '' : corta(c.value, 24),
      incompleta: false,
      legacy: true
    }
  }

  const titulo =
    c.subject === 'field'
      ? (campos[c.field] && campos[c.field].label) || c.field_label || c.field || ''
      : sujeitos[c.subject] || c.subject || ''

  const spec = operadorSpec(c)
  const operador = spec ? spec.label : labelOperador(c.op)
  const incompleta = condicaoIncompleta(c)

  return { titulo, operador, valor: valorDaCondicao(c, spec, incompleta, agentes), incompleta }
}

const LABEL_OP_LEGADO = { equals: 'é igual a', contains: 'contém', exists: 'existe' }

/** O texto "selecione, por favor" é o mesmo da referência: diz o que falta, não some. */
function valorDaCondicao(c, spec, incompleta, agentes) {
  if (spec && spec.aridade === 0) return ''

  // assignee sem valor não é falta: é outra pergunta ("tem alguém atribuído")
  if (c.subject === 'assignee' && !('value' in c)) return 'qualquer membro'
  if (incompleta) return 'selecione, por favor'

  if (spec && spec.aridade === 2) {
    const [a, b] = c.value
    return `${a} e ${b}`
  }
  if (c.subject === 'weekday') {
    const d = DIAS_SEMANA.find((x) => x.key === c.value)
    return d ? d.label : String(c.value)
  }
  if (c.subject === 'assignee') {
    return agentes[c.value] || c.value_label || '#' + c.value
  }
  return corta(c.value, 24)
}

/** Uma linha por condição, na ordem — é o que o card do canvas desenha. */
export function linhasDaCondicao(parameters, ctx = {}) {
  const conds = (parameters && parameters.conditions) || []
  return conds.map((c) => {
    const r = resumoCondicao(c, ctx)
    return [r.titulo, r.operador, r.valor].filter(Boolean).join(' · ')
  })
}
