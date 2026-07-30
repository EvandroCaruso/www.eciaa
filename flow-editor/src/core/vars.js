/**
 * Variáveis do contato dentro do texto — puro, sem Vue e sem DOM.
 *
 * Sintaxe é `[campo]` (D5/D12). Chaves duplas `{{ }}` são do n8n e do Chatwoot, e
 * o JSON do fluxo atravessa Code nodes: por isso o colchete, e por isso a pílula
 * do editor é só PINTURA — o que se guarda no grafo é sempre o texto cru.
 *
 * Quem resolve de verdade é o executor, no envio. Aqui só se sabe recortar,
 * inserir e classificar em conhecida/desconhecida para o realce.
 */

/** Casa `[nome-completo]`, `[attr.EVO_Contrato]`, `[vars.unidade]`. */
const VAR_RE = /\[([A-Za-z0-9_.-]+)\]/g

/** @returns {{key:string, start:number, end:number}[]} ocorrências, em ordem. */
export function parseVars(text) {
  const out = []
  const s = String(text ?? '')
  VAR_RE.lastIndex = 0
  let m
  while ((m = VAR_RE.exec(s)) !== null) {
    out.push({ key: m[1], start: m.index, end: m.index + m[0].length })
  }
  return out
}

/** Token pronto para ir ao texto. */
export function tokenFor(key) {
  return `[${key}]`
}

/**
 * Insere a variável no ponto do cursor. Havendo seleção, ela é SUBSTITUÍDA —
 * é o que o usuário espera de qualquer editor, e é o caso de "selecionei o nome
 * escrito à mão e quero trocar pela variável".
 *
 * @returns {{text:string, cursor:number}} `cursor` já vem depois do token, para
 *          a UI devolver o foco no lugar certo.
 */
export function insertVar(text, selStart, selEnd, key) {
  const s = String(text ?? '')
  const ini = Math.max(0, Math.min(Number(selStart) || 0, s.length))
  const fim = Math.max(ini, Math.min(Number(selEnd ?? selStart) || 0, s.length))
  const token = tokenFor(key)
  return { text: s.slice(0, ini) + token + s.slice(fim), cursor: ini + token.length }
}

/**
 * Quebra o texto em pedaços para a camada de realce desenhar.
 *
 * `conhecidas` é o conjunto de chaves que a paleta ofereceu. O que não estiver
 * lá sai como `conhecida: false` e a UI deixa sem pintura: é o aviso visual de
 * que aquilo não vai resolver no envio (e o executor mandaria vazio — D15).
 *
 * @returns {{tipo:'texto'|'var', valor:string, key?:string, conhecida?:boolean}[]}
 */
export function splitByVars(text, conhecidas = []) {
  const s = String(text ?? '')
  const set = conhecidas instanceof Set ? conhecidas : new Set(conhecidas)
  const partes = []
  let pos = 0

  for (const v of parseVars(s)) {
    if (v.start > pos) partes.push({ tipo: 'texto', valor: s.slice(pos, v.start) })
    partes.push({ tipo: 'var', valor: s.slice(v.start, v.end), key: v.key, conhecida: set.has(v.key) })
    pos = v.end
  }
  if (pos < s.length) partes.push({ tipo: 'texto', valor: s.slice(pos) })
  return partes
}

/** Chaves usadas no texto que a paleta não oferece — para avisar sem varrer duas vezes. */
export function unknownVars(text, conhecidas = []) {
  const set = conhecidas instanceof Set ? conhecidas : new Set(conhecidas)
  const vistos = new Set()
  for (const v of parseVars(text)) if (!set.has(v.key)) vistos.add(v.key)
  return [...vistos]
}

/**
 * Envolve a seleção com um marcador do WhatsApp (`*`, `_`, `~`). Sem seleção,
 * insere o par e deixa o cursor no meio.
 *
 * Formatação no WhatsApp é literal no texto — não existe "negrito" fora dos
 * asteriscos. Por isso isto mora aqui, junto do resto que mexe em string, e não
 * num editor rico.
 */
export function wrapSelection(text, selStart, selEnd, marcador) {
  const s = String(text ?? '')
  const ini = Math.max(0, Math.min(Number(selStart) || 0, s.length))
  const fim = Math.max(ini, Math.min(Number(selEnd ?? selStart) || 0, s.length))
  const alvo = s.slice(ini, fim)

  // Já estava marcado? Então o botão desmarca — senão marcar duas vezes empilha
  // asteriscos e o WhatsApp mostra o símbolo em vez de formatar.
  const jaMarcado =
    alvo.length >= 2 * marcador.length &&
    alvo.startsWith(marcador) &&
    alvo.endsWith(marcador)

  if (jaMarcado) {
    const limpo = alvo.slice(marcador.length, alvo.length - marcador.length)
    return { text: s.slice(0, ini) + limpo + s.slice(fim), cursor: ini + limpo.length }
  }

  const novo = marcador + alvo + marcador
  return {
    text: s.slice(0, ini) + novo + s.slice(fim),
    cursor: alvo ? ini + novo.length : ini + marcador.length
  }
}
