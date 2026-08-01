/**
 * Condições do bloco Condição — puro, sem Vue e sem DOM.
 *
 * O bloco deixou de ser "atributo digitado à mão + 3 operadores para tudo" e
 * passou a ser uma lista de condições tipadas: etiqueta, dia da semana, hora,
 * horário de atendimento, atribuição, e os campos do contato — estes últimos com
 * operadores que dependem do TIPO do campo (texto, data, número).
 *
 * ⚠️ Diferente do Conteúdo, este bloco NÃO escreve espelho. O Conteúdo mantém
 * `text`/`delay_seconds` porque um espelho degradado ainda entrega algo certo;
 * aqui um espelho degradado ROTEARIA TRÁFEGO REAL PELO RAMO ERRADO, em silêncio,
 * que é pior que não decidir. Por isso a chave é `conditions` e não `rules`: se
 * reusasse `rules`, cada condição chegaria ao Executor v0 com `attr: undefined` e
 * `value: undefined`, e `equals` de vazio contra vazio dá VERDADEIRO.
 *
 * O contrato para o executor (o que fazer com cada sujeito e operador em tempo de
 * execução) vive no dicionário do executor, no vault.
 */

/** Os sete sujeitos. Vocabulário fechado: um switch cobre tudo, sem parsing de string. */
export const SUBJECTS = Object.freeze([
  'label',
  'weekday',
  'time',
  'business_hours',
  'assignee',
  'field',
  'legacy'
])

/** Dias na ordem em que a pessoa lê, não na ordem ISO. */
export const DIAS_SEMANA = Object.freeze([
  { key: 'mon', label: 'Segunda-feira' },
  { key: 'tue', label: 'Terça-feira' },
  { key: 'wed', label: 'Quarta-feira' },
  { key: 'thu', label: 'Quinta-feira' },
  { key: 'fri', label: 'Sexta-feira' },
  { key: 'sat', label: 'Sábado' },
  { key: 'sun', label: 'Domingo' }
])

/**
 * Catálogo de operadores — DEFINIÇÃO ÚNICA.
 *
 * ⚠️ Isto NÃO vai para o `params_schema` no banco, e a assimetria é de propósito:
 * o rótulo do SUJEITO ("Etiqueta") é copy pura e mora no catálogo; o id do
 * OPERADOR (`is`) é a instrução que o executor executa. Operador novo exige código
 * no executor de qualquer forma — pô-lo também no banco criaria um terceiro lugar
 * para divergir. Foi exatamente assim que nasceu o `labelOp()` duplicado no card:
 * os rótulos estavam no banco, o card não tinha o schema à mão, e alguém redigitou.
 *
 * `aridade`: quantos valores o operador consome. `opcional: true` significa que o
 * valor pode faltar e isso MUDA A PERGUNTA (em `assignee`: sem valor = "tem alguém
 * atribuído"; com valor = "é o fulano").
 */
export const OPERADORES = Object.freeze({
  label: [
    { id: 'is', label: 'É', aridade: 1, editor: 'label-list' },
    { id: 'is_not', label: 'NÃO É', aridade: 1, editor: 'label-list' }
  ],
  weekday: [
    { id: 'is', label: 'É', aridade: 1, editor: 'weekday' },
    { id: 'is_not', label: 'NÃO É', aridade: 1, editor: 'weekday' }
  ],
  time: [
    { id: 'after', label: 'depois de', aridade: 1, editor: 'clock' },
    { id: 'before', label: 'antes de', aridade: 1, editor: 'clock' },
    { id: 'between', label: 'entre', aridade: 2, editor: 'clock' }
  ],
  business_hours: [
    { id: 'inside', label: 'está dentro', aridade: 0, editor: 'none' },
    { id: 'outside', label: 'está fora', aridade: 0, editor: 'none' }
  ],
  assignee: [
    { id: 'is', label: 'É', aridade: 1, opcional: true, editor: 'agent-list' },
    { id: 'is_not', label: 'NÃO É', aridade: 1, opcional: true, editor: 'agent-list' }
  ],
  'field:text': [
    { id: 'is', label: 'É', aridade: 1, editor: 'text' },
    { id: 'is_not', label: 'NÃO É', aridade: 1, editor: 'text' },
    { id: 'contains', label: 'Contém', aridade: 1, editor: 'text' },
    { id: 'not_contains', label: 'Não Contém', aridade: 1, editor: 'text' },
    { id: 'starts_with', label: 'Começa Com', aridade: 1, editor: 'text' },
    { id: 'ends_with', label: 'Termina Com', aridade: 1, editor: 'text' },
    { id: 'has_any_value', label: 'Possui algum valor', aridade: 0, editor: 'none' },
    { id: 'is_empty', label: 'Vazio', aridade: 0, editor: 'none' }
  ],
  'field:date': [
    { id: 'after', label: 'depois de', aridade: 1, editor: 'calendar' },
    { id: 'before', label: 'antes de', aridade: 1, editor: 'calendar' },
    { id: 'on', label: 'em', aridade: 1, editor: 'calendar' },
    { id: 'between', label: 'entre', aridade: 2, editor: 'calendar' },
    { id: 'has_any_value', label: 'Possui algum valor', aridade: 0, editor: 'none' },
    { id: 'is_empty', label: 'Vazio', aridade: 0, editor: 'none' }
  ],
  'field:number': [
    { id: 'is', label: 'É', aridade: 1, editor: 'number' },
    { id: 'is_not', label: 'NÃO É', aridade: 1, editor: 'number' },
    { id: 'greater_than', label: 'maior que', aridade: 1, editor: 'number' },
    { id: 'less_than', label: 'menor que', aridade: 1, editor: 'number' },
    { id: 'between', label: 'entre', aridade: 2, editor: 'number' },
    { id: 'has_any_value', label: 'Possui algum valor', aridade: 0, editor: 'none' },
    { id: 'is_empty', label: 'Vazio', aridade: 0, editor: 'none' }
  ]
})

/** Tipos de campo que têm lista própria de operadores. Qualquer outro cai em texto. */
export const TIPOS_DE_CAMPO = Object.freeze(['text', 'date', 'number'])

export function tipoDeCampo(t) {
  return TIPOS_DE_CAMPO.includes(String(t || '')) ? String(t) : 'text'
}

/** Id local à condição: serve para o `key` da lista e para editar/remover. */
export function newCondId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID().slice(0, 8)
  return 'c' + Math.random().toString(36).slice(2, 10)
}

/** A chave do catálogo para uma condição: 'label' … ou 'field:date'. */
export function chaveOperadores(c) {
  if (!c || !c.subject) return null
  if (c.subject === 'field') return 'field:' + tipoDeCampo(c.field_type)
  return OPERADORES[c.subject] ? c.subject : null
}

export function operadoresDe(c) {
  const k = chaveOperadores(c)
  return (k && OPERADORES[k]) || []
}

export function operadorSpec(c, opId = null) {
  const alvo = opId === null ? c && c.op : opId
  return operadoresDe(c).find((o) => o.id === alvo) || null
}

// ---------------------------------------------------------------------------
// Comparação de texto — a chave `exact`
// ---------------------------------------------------------------------------

/**
 * A condição compara TEXTO DIGITADO, e portanto aceita o check "Idêntico"?
 *
 * Só os operadores de `field:text` com aridade 1. `has_any_value` e `Vazio` não
 * comparam grafia nenhuma; data e número comparam valor tipado, não escrita.
 *
 * ⚠️ `label` fica de fora de propósito: o valor vem da lista viva do cwmkt, então
 * a grafia já é a do próprio sistema. Etiqueta é SEMPRE comparada sem caixa e sem
 * acento — não há o que a pessoa decidir ali.
 */
export function aceitaExact(c) {
  if (!c || c.subject !== 'field') return false
  if (tipoDeCampo(c.field_type) !== 'text') return false
  const spec = operadorSpec(c)
  return !!spec && spec.aridade === 1
}

/**
 * DEFINIÇÃO CANÔNICA da normalização de texto. O executor copia esta função —
 * está congelada em teste aqui e transcrita no dicionário do executor.
 *
 * ⚠️ O editor NÃO compara nada (ver principio-mascara): isto vive aqui para ter
 * UM lugar onde a regra é escrita e testada, não porque a tela avalie condição.
 *
 * Caixa cai SEMPRE. Acento só cai quando `exact` é falso — que é o padrão, porque
 * no WhatsApp o contato digita "nao" e "anuncio" na maior parte das vezes.
 */
export function normalizaTexto(s, exact) {
  const t = String(s ?? '').trim().toLowerCase()
  return exact ? t : t.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/**
 * Rótulo de um operador pelo id, sem depender do sujeito.
 * Só é seguro porque um mesmo id tem o MESMO rótulo em todos os sujeitos — há
 * teste congelando isso. Se um dia divergir, o card pintaria o operador errado.
 */
export function labelOperador(opId) {
  for (const lista of Object.values(OPERADORES)) {
    const achou = lista.find((o) => o.id === opId)
    if (achou) return achou.label
  }
  return String(opId || '')
}

/**
 * Cria uma condição a partir do que o seletor devolveu.
 * `ref` é `{ subject }` para os especiais, ou
 * `{ subject:'field', field, field_source, field_type, field_label }`.
 * O operador nasce sendo o primeiro da lista — é o que a tela já mostra em azul.
 */
export function newCondition(ref) {
  const base = { id: newCondId(), subject: ref.subject }
  if (ref.subject === 'field') {
    base.field = String(ref.field || '')
    base.field_source = ref.field_source === 'system' ? 'system' : 'client'
    base.field_type = tipoDeCampo(ref.field_type)
    if (ref.field_label) base.field_label = String(ref.field_label)
  }
  const ops = operadoresDe(base)
  if (ops.length) base.op = ops[0].id
  return base
}

/**
 * Uma condição está incompleta quando o operador pede valor e ele não está lá.
 *
 * ⚠️ Ausente ≠ vazio. `value` ausente num operador `opcional` é uma pergunta
 * legítima ("tem alguém atribuído"); `value: ''` é valor vazio de verdade, e aí a
 * condição está pela metade. Tratar um como o outro faz o executor decidir sobre
 * uma pergunta que ninguém formulou.
 */
export function condicaoIncompleta(c) {
  if (!c) return true
  if (c.subject === 'legacy') return false
  const spec = operadorSpec(c)
  if (!spec) return true
  if (spec.aridade === 0) return false
  if (spec.aridade === 2) {
    const v = c.value
    return !Array.isArray(v) || v.length !== 2 || v.some((x) => x === undefined || x === null || x === '')
  }
  if (!('value' in c)) return !spec.opcional
  return c.value === null || c.value === ''
}

// ---------------------------------------------------------------------------
// Migração do formato antigo — { attr, op, value }
// ---------------------------------------------------------------------------

/** Atributos legados que têm campo equivalente no vocabulário do Conteúdo. */
const DE_PARA_SISTEMA = Object.freeze({
  'contact.name': 'nome-completo',
  Nome: 'nome-completo',
  'contact.phone': 'telefone',
  'contact.email': 'email'
})

const OPS_TEXTO_LEGADOS = Object.freeze({ equals: 'is', contains: 'contains' })

/**
 * Converte UMA regra antiga. O que não tem equivalente honesto vira `legacy` — um
 * card somente-leitura que a pessoa refaz quando quiser.
 *
 * ⚠️ Nunca se perde regra e nunca se muda o sentido de uma calada. `contact.labels`
 * com `contains` ("alguma etiqueta contém o trecho") não é expressável em É/NÃO É,
 * e `vars.*` não existe no seletor novo — os dois viram `legacy` de propósito.
 */
export function migraRegra(r) {
  const attr = String((r && r.attr) || '')
  const op = String((r && r.op) || '')
  const value = r ? r.value : undefined
  const legado = { id: newCondId(), subject: 'legacy', attr, op, value }

  if (!attr) return legado

  if (attr === 'contact.labels') {
    if (op === 'exists') return { id: newCondId(), subject: 'label', op: 'is' }
    if (op !== 'equals') return legado
    const c = { id: newCondId(), subject: 'label', op: 'is' }
    // valor vazio vira condição INCOMPLETA, não `Etiqueta É ""` — é o dado real
    // dos fluxos 1, 12 e 15, que têm value: '' gravado
    if (value !== undefined && value !== null && value !== '') c.value = value
    return c
  }

  let field = null
  let field_source = null
  if (DE_PARA_SISTEMA[attr]) {
    field = DE_PARA_SISTEMA[attr]
    field_source = 'system'
  } else if (attr.startsWith('contact.custom_attributes.')) {
    field = attr.slice('contact.custom_attributes.'.length)
    field_source = 'client'
  }
  if (!field) return legado

  const c = {
    id: newCondId(),
    subject: 'field',
    field,
    field_source,
    field_type: 'text',
    op: op === 'exists' ? 'has_any_value' : OPS_TEXTO_LEGADOS[op]
  }
  if (!c.op) return legado
  if (c.op !== 'has_any_value') c.value = value === undefined || value === null ? '' : value
  return c
}

/**
 * Lê os parâmetros da Condição em QUALQUER versão e devolve sempre a forma nova.
 *
 * ⚠️ Converter NÃO grava: abrir um fluxo publicado só para olhar não pode
 * reescrevê-lo (mesma promessa do §1.1 do Conteúdo). Quem persiste é o salvar.
 */
export function normalizeParameters(parameters) {
  const p = parameters || {}
  const mode = p.mode === 'ANY' ? 'ANY' : 'ALL'

  if (Array.isArray(p.conditions)) {
    const conditions = p.conditions.map((c) => (c && c.id ? c : { ...c, id: newCondId() }))
    return { ...p, mode, conditions }
  }

  const conditions = Array.isArray(p.rules) ? p.rules.map(migraRegra) : []
  return { ...p, mode, conditions }
}

/**
 * Ponto único de escrita. APAGA a chave `rules`.
 *
 * ⚠️ Manter `rules` faria o Executor v0 avaliar a regra velha enquanto a tela
 * mostra a nova — o que se vê e o que roda divergindo em silêncio. Apagando, o
 * bloco passa a ser lido por uma chave só, e a lacuna do runtime fica onde é dele.
 */
export function withConditions(parameters, conditions) {
  const p = { ...(parameters || {}), conditions }
  delete p.rules
  return p
}

export function addCondition(conditions, ref) {
  const nova = newCondition(ref)
  return { conditions: [...(conditions || []), nova], id: nova.id }
}

export function updateCondition(conditions, id, patch) {
  return (conditions || []).map((c) => (c.id === id ? { ...c, ...patch } : c))
}

export function removeCondition(conditions, id) {
  return (conditions || []).filter((c) => c.id !== id)
}

/**
 * Troca o operador preservando o valor quando ele continua fazendo sentido.
 * Mudar de "É" para "Contém" não pode apagar o que a pessoa digitou; mudar para
 * "Possui algum valor" (aridade 0) tem de limpar, senão fica lixo gravado.
 */
export function trocaOperador(c, opId) {
  const alvo = operadoresDe(c).find((o) => o.id === opId)
  if (!alvo) return c
  const antes = operadorSpec(c)
  const novo = { ...c, op: opId }
  if (alvo.aridade === 0) delete novo.value
  else if (!antes || antes.aridade !== alvo.aridade) delete novo.value
  // "Vazio" e "Possui algum valor" não comparam grafia: deixar `exact` gravado ali
  // seria lixo que um dia alguém lê como se significasse alguma coisa
  if (!aceitaExact(novo)) delete novo.exact
  return novo
}

// ---------------------------------------------------------------------------
// Exibição
// ---------------------------------------------------------------------------

/**
 * Rótulos dos sujeitos declarados no catálogo, como mapa.
 * Vive aqui para que o painel e o card do canvas leiam a MESMA fonte — foi
 * justamente um rótulo redigitado no card que criou o `labelOp` divergente.
 */
export function sujeitosDoCampo(field) {
  const out = {}
  for (const g of (field && field.groups) || []) {
    for (const s of g.subjects || []) out[s.subject] = s.label
  }
  return out
}

/** "Lógica E" / "Lógica Ou" — DERIVADO do mode, nunca gravado. */
export function rotuloLogica(mode) {
  return mode === 'ANY' ? 'Ou' : 'E'
}

/**
 * As frases das duas saídas.
 *
 * ⚠️ "Verdadeiro/Falso" é vocabulário de RUNTIME e não pode vazar para a tela de
 * construção: aqui a pessoa monta um enunciado, não observa um resultado (ver
 * principio-mascara, no vault). Por isso as saídas descrevem CORRESPONDÊNCIA.
 *
 * A regra é declarada só para a correspondência; a não-correspondência é o
 * complemento dela e nunca se escreve duas vezes.
 */
export function fraseVerdadeiro(mode) {
  return mode === 'ANY'
    ? 'Corresponde a UMA das opções'
    : 'Corresponde a TODAS as condições'
}

export function fraseFalso(mode) {
  return mode === 'ANY'
    ? 'Não corresponde a UMA das opções'
    : 'Não corresponde a TODAS as condições'
}

// ⚠️ `avisoRuntime()` foi REMOVIDO em 2026-07-31, por decisão do Evandro.
//
// Ele punha na tela de construção o texto "o runtime ainda não avalia estas
// condições — este bloco sempre segue pela saída Verdadeiro". Isso confunde
// DÉBITO DO EXECUTOR com PROPRIEDADE DO EDITOR: quem monta a máscara não tem
// contato nenhum em mãos, e nada ali é verdadeiro ou falso ainda. Ver
// `principio-mascara.md` no vault. A lacuna do runtime continua registrada no
// `dicionario-executor.md`, que é onde ela é de alguém.
//
// O `runtime_warning` no `params_schema` fica órfão e é apagado por UPDATE.
