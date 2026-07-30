/**
 * Sub-blocos do bloco Conteúdo — puro, sem Vue e sem DOM.
 *
 * O bloco deixou de ser "um texto e um atraso" e passou a ser uma SEQUÊNCIA:
 * texto, pausa, imagem, vídeo, áudio, arquivo, cartão de contato. Cada peça vira
 * uma bolha no WhatsApp, na ordem do array.
 *
 * ⚠️ `parameters.text` e `parameters.delay_seconds` continuam sendo escritos, mas
 * como ESPELHO (ver `buildMirrors`). O Executor v0 lê `parameters.text`; sem o
 * espelho, um fluxo publicado passaria a enviar mensagem vazia sem erro nenhum.
 * O espelho é degradado de propósito — mídia e contato não cabem nele — e a UI
 * avisa isso na tela. Ver `precisaExecutorNovo`.
 */

/** Id local ao bloco: serve para reordenar e para o `key` da lista. Nada externo aponta para ele. */
export function newSubId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID().slice(0, 8)
  return 's' + Math.random().toString(36).slice(2, 10)
}

/** Sub-tipos declarados no catálogo (`params_schema.fields[].sub_types`). */
export function subTypesFrom(field) {
  return (field && Array.isArray(field.sub_types) ? field.sub_types : []) || []
}

export function subTypeFor(subTypes, kind) {
  return (subTypes || []).find((s) => s.kind === kind) || null
}

/** Cria um sub-bloco já com os defaults declarados no catálogo. */
export function newSubBlock(subType) {
  const b = { id: newSubId(), kind: subType.kind }
  for (const f of subType.fields || []) {
    if (f.default !== undefined) b[f.key] = f.default
    else if (f.type === 'switch') b[f.key] = false
    else if (f.type === 'range' || f.type === 'number') b[f.key] = f.min ?? 0
    else if (f.type === 'asset') b[f.key] = null
    else b[f.key] = ''
  }
  return b
}

export function addSubBlock(blocks, subType, at = null) {
  const list = [...(blocks || [])]
  const novo = newSubBlock(subType)
  if (at === null || at < 0 || at > list.length) list.push(novo)
  else list.splice(at, 0, novo)
  return { blocks: list, id: novo.id }
}

export function updateSubBlock(blocks, id, patch) {
  return (blocks || []).map((b) => (b.id === id ? { ...b, ...patch } : b))
}

export function removeSubBlock(blocks, id) {
  return (blocks || []).filter((b) => b.id !== id)
}

/** Duplica logo abaixo do original — duplicar e ir para o fim da lista confunde. */
export function duplicateSubBlock(blocks, id) {
  const list = [...(blocks || [])]
  const i = list.findIndex((b) => b.id === id)
  if (i < 0) return { blocks: list, id: null }
  const copia = { ...JSON.parse(JSON.stringify(list[i])), id: newSubId() }
  list.splice(i + 1, 0, copia)
  return { blocks: list, id: copia.id }
}

/** Move uma posição para cima (-1) ou para baixo (+1). Nas pontas, não faz nada. */
export function moveSubBlock(blocks, id, dir) {
  const list = [...(blocks || [])]
  const i = list.findIndex((b) => b.id === id)
  if (i < 0) return list
  const j = i + (dir < 0 ? -1 : 1)
  if (j < 0 || j >= list.length) return list
  const [item] = list.splice(i, 1)
  list.splice(j, 0, item)
  return list
}

/**
 * Espelhos para o Executor v0.
 * - `text`: os sub-blocos de texto concatenados (linha em branco entre eles, que
 *   é como duas bolhas separadas se leem quando viram uma só).
 * - `delay_seconds`: soma das pausas, arredondada e limitada a 300 (teto do campo
 *   antigo). O executor já corta em 90 s acumulados por conta própria.
 */
export function buildMirrors(blocks) {
  const list = blocks || []
  const text = list
    .filter((b) => b.kind === 'text' && String(b.text || '').trim())
    .map((b) => String(b.text))
    .join('\n\n')

  const soma = list
    .filter((b) => b.kind === 'delay')
    .reduce((acc, b) => acc + (Number(b.seconds) || 0), 0)

  return { text, delay_seconds: Math.min(300, Math.round(soma)) }
}

/**
 * Sub-blocos que o runtime atual descarta INTEIROS.
 *
 * `text` e `delay` sobrevivem pelos espelhos: o Executor v0 lê `parameters.text` e
 * `parameters.delay_seconds`. Todo o resto — imagem, vídeo, áudio, arquivo,
 * contato — não tem para onde ir e some da mensagem sem erro nenhum.
 *
 * ⚠️ Já foi mais amplo do que isto e avisava também para `delay`, o que era
 * exagero: a pausa acontece de verdade (só o "digitando" é que não).
 */
const SOBREVIVEM_AO_ESPELHO = ['text', 'delay']

export function precisaExecutorNovo(blocks) {
  return (blocks || []).some((b) => !SOBREVIVEM_AO_ESPELHO.includes(b.kind))
}

/**
 * Lê os parâmetros de um bloco de Conteúdo em QUALQUER versão e devolve sempre a
 * forma nova. Um bloco `typeVersion: 1` é convertido aqui, na leitura.
 *
 * ⚠️ Converter NÃO grava: abrir um fluxo publicado só para olhar não pode
 * reescrevê-lo. Quem persiste é o salvar, com o que estiver na tela.
 *
 * ⚠️ `delay_seconds` antigo ia até 300 s e a régua nova trava em 6. Um valor
 * herdado acima disso é PRESERVADO como está (a UI avisa) — cortar na abertura
 * mudaria, em silêncio, o tempo de um fluxo que está no ar.
 */
export function normalizeParameters(parameters) {
  const p = parameters || {}
  if (Array.isArray(p.blocks)) {
    const blocks = p.blocks.map((b) => (b && b.id ? b : { ...b, id: newSubId() }))
    return { ...p, blocks, ...buildMirrors(blocks) }
  }

  const blocks = []
  const atraso = Number(p.delay_seconds) || 0
  if (atraso > 0) blocks.push({ id: newSubId(), kind: 'delay', seconds: atraso, typing: true })
  if (String(p.text || '').trim()) blocks.push({ id: newSubId(), kind: 'text', text: String(p.text) })

  return { ...p, blocks, ...buildMirrors(blocks) }
}

/** Aplica os espelhos depois de qualquer mudança na lista. É o ponto único de escrita. */
export function withBlocks(parameters, blocks) {
  return { ...(parameters || {}), blocks, ...buildMirrors(blocks) }
}
