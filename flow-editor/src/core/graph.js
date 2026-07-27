/**
 * Núcleo do grafo — MsgFlow Builder v1.
 *
 * O formato persistido é o padrão n8n: `nodes[]` + `connections{}` chaveado pelo
 * NOME do nó. É essa fidelidade que faz copiar/colar e import/export funcionarem
 * entre fluxos sem conversão.
 *
 *   connections: {
 *     "Boas-vindas": {
 *       main: [
 *         [ { node: "É VIP?", type: "main", index: 0 } ],   // <- saída 0 do nó
 *         [ { node: "Outro",  type: "main", index: 0 } ]    // <- saída 1 do nó
 *       ]
 *     }
 *   }
 *
 * O array externo de `main` é a saída do nó de origem; o interno permite que uma
 * mesma saída alimente vários destinos. O `index` de cada destino é a ENTRADA do
 * nó de destino (sempre 0 hoje — nossos nós têm entrada única).
 *
 * Este módulo é puro: não importa Vue, não toca DOM, não faz fetch. É testável
 * isoladamente e é onde mora toda a regra do grafo.
 */

export const SCHEMA_NAME = 'eciaa-msgflow'
export const SCHEMA_VERSION = 1

/** @typedef {{id:string, name:string, type:string, typeVersion:number, position:[number,number], parameters:Object}} FlowNode */
/** @typedef {{node:string, type:'main', index:number}} ConnTarget */
/** @typedef {{meta:Object, nodes:FlowNode[], connections:Object<string,{main:ConnTarget[][]}>}} Graph */

/** Gera um id opaco para o nó. O id não participa do roteamento (quem roteia é o name). */
export function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'n' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

/** @returns {Graph} */
export function createEmptyGraph() {
  return {
    meta: { schema: SCHEMA_NAME, schema_version: SCHEMA_VERSION },
    nodes: [],
    connections: {}
  }
}

/** Cópia profunda simples — os grafos são JSON puro. */
export function cloneGraph(graph) {
  return JSON.parse(JSON.stringify(graph))
}

export function findNode(graph, name) {
  return graph.nodes.find((n) => n.name === name) || null
}

/**
 * Deriva um nome livre a partir de uma base, no estilo do n8n:
 * "Conteúdo" → "Conteúdo1" → "Conteúdo2"...
 */
export function uniqueName(graph, base) {
  const taken = new Set(graph.nodes.map((n) => n.name))
  if (!taken.has(base)) return base
  let i = 1
  while (taken.has(`${base}${i}`)) i++
  return `${base}${i}`
}

/**
 * Adiciona um nó. Se o nome já existir (ou não vier), deriva um livre.
 * @returns {{graph:Graph, node:FlowNode}}
 */
export function addNode(graph, { type, name, typeVersion = 1, position = [0, 0], parameters = {} }) {
  const g = cloneGraph(graph)
  const node = {
    id: newId(),
    name: uniqueName(g, name || type),
    type,
    typeVersion,
    position: [position[0], position[1]],
    parameters: JSON.parse(JSON.stringify(parameters))
  }
  g.nodes.push(node)
  return { graph: g, node }
}

/**
 * Renomeia um nó e propaga a mudança para todas as conexões que o referenciam —
 * como chave de `connections` e como destino dentro dos arrays.
 *
 * Este é o preço de rotear por nome (padrão n8n). É uma operação só, e é por isso
 * que ela vive aqui, testada, em vez de espalhada pela UI.
 */
export function renameNode(graph, from, to) {
  if (from === to) return cloneGraph(graph)
  const g = cloneGraph(graph)

  const node = g.nodes.find((n) => n.name === from)
  if (!node) throw new Error(`renameNode: nó "${from}" não existe`)
  if (g.nodes.some((n) => n.name === to)) throw new Error(`renameNode: já existe um nó chamado "${to}"`)

  node.name = to

  // 1. a chave do próprio nó em connections
  if (Object.prototype.hasOwnProperty.call(g.connections, from)) {
    g.connections[to] = g.connections[from]
    delete g.connections[from]
  }

  // 2. toda referência a ele como destino
  for (const src of Object.keys(g.connections)) {
    const outputs = g.connections[src].main || []
    for (const targets of outputs) {
      for (const t of targets) {
        if (t.node === from) t.node = to
      }
    }
  }

  return g
}

/** Remove o nó e toda conexão que sai dele ou chega nele. */
export function deleteNode(graph, name) {
  const g = cloneGraph(graph)
  g.nodes = g.nodes.filter((n) => n.name !== name)
  delete g.connections[name]

  for (const src of Object.keys(g.connections)) {
    const outputs = g.connections[src].main || []
    g.connections[src].main = outputs.map((targets) => targets.filter((t) => t.node !== name))
    if (g.connections[src].main.every((targets) => targets.length === 0)) delete g.connections[src]
  }
  return g
}

/** Garante que `connections[source].main` exista e tenha ao menos `outputIndex + 1` saídas. */
function ensureOutputSlot(g, source, outputIndex) {
  if (!g.connections[source]) g.connections[source] = { main: [] }
  const main = g.connections[source].main
  while (main.length <= outputIndex) main.push([])
  return main
}

/** Liga a saída `outputIndex` de `source` na entrada de `target`. Idempotente. */
export function connect(graph, source, outputIndex, target, targetInput = 0) {
  const g = cloneGraph(graph)
  if (!findNode(g, source)) throw new Error(`connect: nó de origem "${source}" não existe`)
  if (!findNode(g, target)) throw new Error(`connect: nó de destino "${target}" não existe`)

  const main = ensureOutputSlot(g, source, outputIndex)
  const already = main[outputIndex].some((t) => t.node === target && t.index === targetInput)
  if (!already) main[outputIndex].push({ node: target, type: 'main', index: targetInput })
  return g
}

/** Desfaz uma ligação específica. */
export function disconnect(graph, source, outputIndex, target, targetInput = 0) {
  const g = cloneGraph(graph)
  const entry = g.connections[source]
  if (!entry || !entry.main[outputIndex]) return g

  entry.main[outputIndex] = entry.main[outputIndex].filter(
    (t) => !(t.node === target && t.index === targetInput)
  )
  if (entry.main.every((targets) => targets.length === 0)) delete g.connections[source]
  return g
}

/**
 * Recorta um subconjunto de nós, preservando só as conexões INTERNAS ao recorte.
 * Conexões que saem do recorte são descartadas — é o que o n8n faz ao copiar, e é
 * o que evita colar um grafo com ponteiros pendurados.
 *
 * @returns {{nodes:FlowNode[], connections:Object}} recorte no mesmo formato do grafo
 */
export function copyNodes(graph, names) {
  const inClip = new Set(names)
  const nodes = graph.nodes.filter((n) => inClip.has(n.name)).map((n) => JSON.parse(JSON.stringify(n)))

  const connections = {}
  for (const src of Object.keys(graph.connections)) {
    if (!inClip.has(src)) continue
    const main = (graph.connections[src].main || []).map((targets) =>
      targets.filter((t) => inClip.has(t.node)).map((t) => ({ ...t }))
    )
    if (main.some((targets) => targets.length > 0)) connections[src] = { main }
  }

  return { nodes, connections }
}

/**
 * Cola um recorte no grafo. Nomes em conflito são derivados (Conteúdo → Conteúdo1)
 * e as conexões do recorte são remapeadas para os nomes novos. Ids são regerados,
 * então colar duas vezes produz nós independentes.
 *
 * @returns {{graph:Graph, names:string[]}} nomes finais dos nós colados
 */
export function pasteNodes(graph, clip, offset = [40, 40]) {
  const g = cloneGraph(graph)
  const rename = new Map()

  for (const node of clip.nodes) {
    const finalName = uniqueName(g, node.name)
    rename.set(node.name, finalName)
    g.nodes.push({
      ...JSON.parse(JSON.stringify(node)),
      id: newId(),
      name: finalName,
      position: [node.position[0] + offset[0], node.position[1] + offset[1]]
    })
  }

  for (const src of Object.keys(clip.connections || {})) {
    const newSrc = rename.get(src)
    if (!newSrc) continue
    const main = (clip.connections[src].main || []).map((targets) =>
      targets
        .filter((t) => rename.has(t.node))
        .map((t) => ({ node: rename.get(t.node), type: 'main', index: t.index }))
    )
    if (main.some((targets) => targets.length > 0)) g.connections[newSrc] = { main }
  }

  return { graph: g, names: [...rename.values()] }
}

// ---------------------------------------------------------------------------
// Conversão para o Vue Flow e de volta
// ---------------------------------------------------------------------------

const HANDLE_PREFIX = 'out-'

export function handleIdFor(outputIndex) {
  return `${HANDLE_PREFIX}${outputIndex}`
}

export function outputIndexFrom(handleId) {
  if (!handleId) return 0
  const n = Number(String(handleId).replace(HANDLE_PREFIX, ''))
  return Number.isFinite(n) ? n : 0
}

/**
 * Grafo (formato n8n) → estruturas que o Vue Flow consome.
 * `nodeTypes` é o catálogo vindo de msgflow_node_types, usado só para enfeitar o
 * nó com label/cor/saídas — a topologia não depende dele.
 */
export function toVueFlow(graph, nodeTypes = {}) {
  const nodes = graph.nodes.map((n) => ({
    id: n.name, // o Vue Flow roteia por id; usamos o name para casar com as conexões
    type: 'msgflow',
    position: { x: n.position[0], y: n.position[1] },
    data: {
      name: n.name,
      nodeId: n.id,
      nodeType: n.type,
      typeVersion: n.typeVersion,
      parameters: n.parameters,
      spec: nodeTypes[n.type] || null
    }
  }))

  const edges = []
  for (const src of Object.keys(graph.connections)) {
    const main = graph.connections[src].main || []
    main.forEach((targets, outputIndex) => {
      targets.forEach((t) => {
        edges.push({
          id: `${src}:${outputIndex}->${t.node}:${t.index}`,
          source: src,
          target: t.node,
          sourceHandle: handleIdFor(outputIndex),
          targetHandle: 'in-0'
        })
      })
    })
  }

  return { nodes, edges }
}

/**
 * Estruturas do Vue Flow → grafo (formato n8n). Só a posição e a topologia vêm da
 * tela; nome, tipo e parâmetros vêm de `data`, que a UI mantém.
 */
export function fromVueFlow(vfNodes, vfEdges, meta) {
  const graph = {
    meta: meta || { schema: SCHEMA_NAME, schema_version: SCHEMA_VERSION },
    nodes: vfNodes.map((vn) => ({
      id: vn.data.nodeId || newId(),
      name: vn.data.name,
      type: vn.data.nodeType,
      typeVersion: vn.data.typeVersion || 1,
      position: [Math.round(vn.position.x), Math.round(vn.position.y)],
      parameters: vn.data.parameters || {}
    })),
    connections: {}
  }

  for (const e of vfEdges) {
    const outputIndex = outputIndexFrom(e.sourceHandle)
    const main = ensureOutputSlot(graph, e.source, outputIndex)
    const targetInput = outputIndexFrom(String(e.targetHandle || 'in-0').replace('in-', HANDLE_PREFIX))
    if (!main[outputIndex].some((t) => t.node === e.target && t.index === targetInput)) {
      main[outputIndex].push({ node: e.target, type: 'main', index: targetInput })
    }
  }

  return graph
}

// ---------------------------------------------------------------------------
// Validação
// ---------------------------------------------------------------------------

/**
 * Confere o grafo e devolve problemas. `errors` impedem publicar; `warnings` não.
 * @returns {{ok:boolean, errors:{code:string,message:string,node?:string}[], warnings:{code:string,message:string,node?:string}[]}}
 */
export function validate(graph, nodeTypes = {}) {
  const errors = []
  const warnings = []

  // nomes duplicados quebram o roteamento por nome — é erro, não aviso
  const seen = new Set()
  for (const n of graph.nodes) {
    if (seen.has(n.name)) {
      errors.push({ code: 'duplicate_name', node: n.name, message: `Existe mais de um nó chamado "${n.name}".` })
    }
    seen.add(n.name)
  }

  const starts = graph.nodes.filter((n) => n.type === 'eciaa.start')
  if (starts.length === 0) {
    errors.push({ code: 'no_start', message: 'O fluxo precisa de um nó de Início.' })
  } else if (starts.length > 1) {
    errors.push({ code: 'multiple_starts', message: `O fluxo tem ${starts.length} nós de Início; deve ter exatamente um.` })
  }

  const byName = new Map(graph.nodes.map((n) => [n.name, n]))

  for (const src of Object.keys(graph.connections)) {
    if (!byName.has(src)) {
      errors.push({ code: 'dangling_source', node: src, message: `Há conexões saindo de "${src}", que não existe.` })
      continue
    }
    const spec = nodeTypes[byName.get(src).type]
    const maxOutputs = spec && Array.isArray(spec.outputs) ? spec.outputs.length : null

    const main = graph.connections[src].main || []
    main.forEach((targets, outputIndex) => {
      if (maxOutputs !== null && targets.length > 0 && outputIndex >= maxOutputs) {
        errors.push({
          code: 'output_out_of_range',
          node: src,
          message: `"${src}" usa a saída ${outputIndex}, mas esse tipo de nó só tem ${maxOutputs}.`
        })
      }
      for (const t of targets) {
        if (!byName.has(t.node)) {
          errors.push({ code: 'dangling_target', node: src, message: `"${src}" aponta para "${t.node}", que não existe.` })
        }
      }
    })
  }

  // nós inalcançáveis a partir do Início
  if (starts.length === 1) {
    const reachable = new Set()
    const stack = [starts[0].name]
    while (stack.length) {
      const cur = stack.pop()
      if (reachable.has(cur)) continue
      reachable.add(cur)
      const main = (graph.connections[cur] || {}).main || []
      for (const targets of main) for (const t of targets) if (byName.has(t.node)) stack.push(t.node)
    }
    for (const n of graph.nodes) {
      if (!reachable.has(n.name)) {
        warnings.push({ code: 'unreachable', node: n.name, message: `"${n.name}" não é alcançável a partir do Início.` })
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings }
}
