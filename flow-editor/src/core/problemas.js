/**
 * O que falta configurar num bloco — puro, sem Vue e sem DOM.
 *
 * ⚠️ Isto é AVISO, não bloqueio (decisão do Evandro, 01/08). Salvar e publicar
 * continuam permitidos com bloco incompleto: o fluxo é montado aos poucos, e um
 * editor que recusa trabalho pela metade obriga a pessoa a terminar tudo de uma
 * sentada. O que não pode é a lacuna passar despercebida — daí o ✗ vermelho no
 * card, com a lista no hover.
 *
 * ⚠️ E isto NÃO avalia condição nenhuma (ver `principio-mascara.md`, no vault).
 * "Falta o valor" é uma propriedade do ENUNCIADO — a pergunta está pela metade —,
 * não do resultado dela, que só existe em execução com um contato na mão.
 *
 * Genérico de propósito: bloco novo entra pelo `params_schema` (D2 — bloco novo é
 * INSERT, não deploy) e ganha a verificação de campo obrigatório de graça, sem
 * código aqui. As funções específicas cobrem o que o schema não sabe descrever:
 * a lista de condições e a sequência de sub-blocos.
 */

import { normalizeParameters as normCond, condicaoIncompleta, sujeitosDoCampo } from './condition.js'
import { normalizeParameters as normBlocks, subTypesFrom } from './subblocks.js'
import { resumoCondicao, resumoSubBloco } from './preview.js'

/** Um valor "não preenchido": ausente, nulo, string em branco ou lista vazia. */
function vazio(v) {
  if (v === undefined || v === null) return true
  if (typeof v === 'string') return v.trim() === ''
  if (Array.isArray(v)) return v.length === 0
  return false
}

/** Campos `required` declarados no schema, no nível do próprio bloco. */
function faltasNoSchema(parameters, campos) {
  const out = []
  for (const c of campos || []) {
    if (!c || !c.required) continue
    if (vazio((parameters || {})[c.key])) out.push(`${c.label || c.key}: falta preencher`)
  }
  return out
}

/**
 * Lista legível do que falta configurar no bloco.
 *
 * @param {{nodeType:string, parameters:object, spec:object}} bloco
 * @returns {string[]} uma frase por pendência; vazio = bloco completo
 */
export function problemasDoBloco({ nodeType, parameters, spec } = {}) {
  const schema = (spec && spec.params_schema) || {}
  const campos = schema.fields || []
  const out = []

  const campoCond = campos.find((f) => f.type === 'condition-list')
  const campoBlocks = campos.find((f) => f.type === 'blocks')

  // os controles compostos trazem a própria noção de "incompleto"; os campos
  // simples do mesmo bloco continuam valendo
  out.push(...faltasNoSchema(parameters, campos.filter((f) => f.type !== 'condition-list' && f.type !== 'blocks')))

  if (campoCond) {
    const { conditions } = normCond(parameters)
    const sujeitos = sujeitosDoCampo(campoCond)
    conditions.forEach((c, i) => {
      if (!condicaoIncompleta(c)) return
      const r = resumoCondicao(c, { sujeitos })
      const nome = (r && r.titulo) || `condição ${i + 1}`
      out.push(`${nome}: falta o valor da condição`)
    })
  }

  if (campoBlocks) {
    const { blocks } = normBlocks(parameters)
    const tipos = subTypesFrom(campoBlocks)
    if (!blocks.length) out.push('A mensagem está vazia: nenhuma parte adicionada')
    blocks.forEach((b, i) => {
      const tipo = tipos.find((t) => t.kind === b.kind)
      const rotulo = (tipo && tipo.label) || b.kind || `parte ${i + 1}`
      for (const c of (tipo && tipo.fields) || []) {
        // "usar o número conectado" apaga o telefone de propósito (D do Conteúdo):
        // cobrar o campo aí seria acusar o comportamento correto
        if (c.key === 'phone' && b.use_connected_number === true) continue
        if (c.required && vazio(b[c.key])) {
          out.push(`${rotulo} (${i + 1}ª parte) — ${c.label || c.key}: falta preencher`)
        }
      }
      // sub-bloco de mídia sem arquivo escolhido é o caso mais comum, e o schema
      // nem sempre marca `asset_id` como required
      if (['image', 'video', 'audio', 'file'].includes(b.kind) && vazio(b.asset_id)) {
        const r = resumoSubBloco(b, tipos)
        out.push(`${r || rotulo} (${i + 1}ª parte): falta escolher o arquivo`)
      }
    })
  }

  return out
}

/** Texto do balão do ✗, uma pendência por linha. */
export function textoDosProblemas(lista) {
  const ps = lista || []
  if (!ps.length) return ''
  const cabeca = ps.length === 1 ? 'Falta configurar:' : `Faltam configurar ${ps.length} itens:`
  return [cabeca, ...ps.map((p) => `• ${p}`)].join('\n')
}
