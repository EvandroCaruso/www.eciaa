/**
 * Regras de nome de FLUXO — puras, para poderem ser testadas sem browser.
 *
 * ⚠️ Não confundir com `uniqueName` de `graph.js`, que resolve nome de NÓ dentro
 * de um fluxo (convenção "Conteúdo1", sem parênteses). Aqui é o nome do fluxo
 * dentro do cliente, e a convenção é " (1)".
 *
 * Decisão (Evandro, 2026-07-29):
 *  - o nome é único no CLIENTE INTEIRO, não por pasta;
 *  - digitou à mão e colidiu (criar/renomear) → RECUSA com erro legível;
 *  - não escolheu o nome (importar/duplicar) → auto-sufixo " (1)", " (2)"…
 *
 * A comparação ignora caixa, acento e espaço sobrando: "Boas-Vindas" e
 * "boas vindas " são o mesmo nome para efeito de colisão. Permitir esse par é
 * o mesmo que não ter regra nenhuma.
 */

/** Chave de comparação: sem acento, sem caixa, sem espaço duplicado. */
export function flowNameKey(name) {
  return String(name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

/**
 * `exceptId` existe para o renomear: um fluxo não colide consigo mesmo.
 */
export function isFlowNameTaken(name, flows, exceptId = null) {
  const key = flowNameKey(name)
  if (!key) return false
  return (flows || []).some((f) => f.id !== exceptId && flowNameKey(f.flow_name) === key)
}

/** Separa "Teste (2)" em { base: 'Teste', n: 2 }; sem sufixo, n = 0. */
function splitSuffix(name) {
  const raw = String(name ?? '').trim()
  const m = raw.match(/^(.*?)\s*\((\d+)\)$/)
  if (!m) return { base: raw, n: 0 }
  return { base: m[1].trim(), n: Number(m[2]) }
}

/**
 * Primeiro nome livre a partir de `name`.
 * "Teste" ocupado → "Teste (1)"; "Teste (1)" ocupado também → "Teste (2)".
 * Se o próprio nome já vem sufixado, continua a contagem em vez de aninhar
 * — senão importar duas vezes geraria "Teste (1) (1)".
 */
export function uniqueFlowName(name, flows, exceptId = null) {
  const wanted = String(name ?? '').trim()
  if (!isFlowNameTaken(wanted, flows, exceptId)) return wanted
  const { base } = splitSuffix(wanted)
  for (let i = 1; i < 1000; i += 1) {
    const candidate = `${base} (${i})`
    if (!isFlowNameTaken(candidate, flows, exceptId)) return candidate
  }
  // 1000 homônimos é erro de uso, não caso de borda a acomodar em silêncio.
  throw new Error('Não foi possível gerar um nome único para este fluxo.')
}
