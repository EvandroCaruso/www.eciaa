/**
 * Resumo de um bloco para exibição — DEFINIÇÃO ÚNICA.
 *
 * ⚠️ Este arquivo existe por causa de um bug já pago neste projeto: o indicador
 * 🟢/🟡 nasceu com uma regra na lista e outra no editor, o mesmo fluxo aparecia
 * diferente em cada tela, e cada tela passava nos testes ISOLADAMENTE. Card do
 * canvas e painel de propriedades importam daqui — nenhum dos dois recalcula.
 */


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
