import { describe, it, expect } from 'vitest'
import {
  createEmptyGraph,
  addNode,
  connect,
  disconnect,
  renameNode,
  deleteNode,
  uniqueName,
  copyNodes,
  pasteNodes,
  toVueFlow,
  fromVueFlow,
  validate
} from './graph.js'

const TYPES = {
  'eciaa.start': { outputs: [{ key: 'main', label: '' }] },
  'eciaa.content': { outputs: [{ key: 'main', label: '' }] },
  'eciaa.condition': { outputs: [{ key: 'true', label: 'Verdadeiro' }, { key: 'false', label: 'Falso' }] }
}

/** Fluxo de referência: Início → Boas-vindas → É VIP? {true: Oferta, false: Padrão} */
function fixture() {
  let g = createEmptyGraph()
  g = addNode(g, { type: 'eciaa.start', name: 'Início', position: [0, 0] }).graph
  g = addNode(g, { type: 'eciaa.content', name: 'Boas-vindas', position: [200, 0], parameters: { text: 'Olá [Nome]!' } }).graph
  g = addNode(g, { type: 'eciaa.condition', name: 'É VIP?', position: [400, 0] }).graph
  g = addNode(g, { type: 'eciaa.content', name: 'Oferta', position: [600, -80] }).graph
  g = addNode(g, { type: 'eciaa.content', name: 'Padrão', position: [600, 80] }).graph
  g = connect(g, 'Início', 0, 'Boas-vindas')
  g = connect(g, 'Boas-vindas', 0, 'É VIP?')
  g = connect(g, 'É VIP?', 0, 'Oferta')
  g = connect(g, 'É VIP?', 1, 'Padrão')
  return g
}

describe('nomes', () => {
  it('deriva nome livre no estilo do n8n', () => {
    let g = createEmptyGraph()
    g = addNode(g, { type: 'eciaa.content', name: 'Conteúdo' }).graph
    expect(uniqueName(g, 'Conteúdo')).toBe('Conteúdo1')
    g = addNode(g, { type: 'eciaa.content', name: 'Conteúdo' }).graph
    expect(g.nodes.map((n) => n.name)).toEqual(['Conteúdo', 'Conteúdo1'])
    expect(uniqueName(g, 'Conteúdo')).toBe('Conteúdo2')
  })

  it('cada nó recebe id próprio', () => {
    const g = fixture()
    const ids = new Set(g.nodes.map((n) => n.id))
    expect(ids.size).toBe(g.nodes.length)
  })
})

describe('conexões', () => {
  it('grava saídas indexadas no formato n8n', () => {
    const g = fixture()
    expect(g.connections['É VIP?'].main).toEqual([
      [{ node: 'Oferta', type: 'main', index: 0 }],
      [{ node: 'Padrão', type: 'main', index: 0 }]
    ])
  })

  it('uma saída pode alimentar vários destinos', () => {
    let g = fixture()
    g = connect(g, 'Boas-vindas', 0, 'Oferta')
    expect(g.connections['Boas-vindas'].main[0].map((t) => t.node)).toEqual(['É VIP?', 'Oferta'])
  })

  it('conectar duas vezes é idempotente', () => {
    let g = fixture()
    g = connect(g, 'Início', 0, 'Boas-vindas')
    expect(g.connections['Início'].main[0]).toHaveLength(1)
  })

  it('recusa conexão para nó inexistente', () => {
    const g = fixture()
    expect(() => connect(g, 'Início', 0, 'Fantasma')).toThrow(/não existe/)
  })

  it('disconnect remove a entrada e limpa a origem vazia', () => {
    let g = fixture()
    g = disconnect(g, 'Início', 0, 'Boas-vindas')
    expect(g.connections['Início']).toBeUndefined()
  })

  it('não muta o grafo original', () => {
    const g = fixture()
    const antes = JSON.stringify(g)
    connect(g, 'Oferta', 0, 'Padrão')
    expect(JSON.stringify(g)).toBe(antes)
  })
})

describe('renameNode — cascata', () => {
  it('renomeia o nó, a chave de connections e toda referência como destino', () => {
    const g = renameNode(fixture(), 'É VIP?', 'Cliente premium?')

    expect(g.nodes.map((n) => n.name)).toContain('Cliente premium?')
    expect(g.nodes.map((n) => n.name)).not.toContain('É VIP?')

    // como origem
    expect(g.connections['Cliente premium?']).toBeDefined()
    expect(g.connections['É VIP?']).toBeUndefined()

    // como destino
    expect(g.connections['Boas-vindas'].main[0][0].node).toBe('Cliente premium?')
  })

  it('preserva a ordem das saídas ao renomear', () => {
    const g = renameNode(fixture(), 'É VIP?', 'X')
    expect(g.connections['X'].main[0][0].node).toBe('Oferta')
    expect(g.connections['X'].main[1][0].node).toBe('Padrão')
  })

  it('renomear um nó folha ajusta quem aponta para ele', () => {
    const g = renameNode(fixture(), 'Padrão', 'Mensagem padrão')
    expect(g.connections['É VIP?'].main[1][0].node).toBe('Mensagem padrão')
  })

  it('recusa nome já existente', () => {
    expect(() => renameNode(fixture(), 'Oferta', 'Padrão')).toThrow(/já existe/)
  })

  it('renomear para o mesmo nome é no-op', () => {
    const g = fixture()
    expect(renameNode(g, 'Oferta', 'Oferta')).toEqual(g)
  })

  it('recusa nó inexistente', () => {
    expect(() => renameNode(fixture(), 'Fantasma', 'X')).toThrow(/não existe/)
  })
})

describe('deleteNode', () => {
  it('remove o nó e as conexões que saem e que chegam', () => {
    const g = deleteNode(fixture(), 'É VIP?')
    expect(g.nodes.map((n) => n.name)).not.toContain('É VIP?')
    expect(g.connections['É VIP?']).toBeUndefined()
    expect(g.connections['Boas-vindas']).toBeUndefined() // apontava só para ele
  })

  it('mantém as demais conexões da origem', () => {
    let g = fixture()
    g = connect(g, 'Boas-vindas', 0, 'Oferta')
    g = deleteNode(g, 'É VIP?')
    expect(g.connections['Boas-vindas'].main[0].map((t) => t.node)).toEqual(['Oferta'])
  })
})

describe('copiar e colar', () => {
  it('copia só as conexões internas ao recorte', () => {
    const clip = copyNodes(fixture(), ['É VIP?', 'Oferta'])
    expect(clip.nodes.map((n) => n.name)).toEqual(['É VIP?', 'Oferta'])
    // a saída 0 sobrevive (Oferta está no recorte), a 1 não (Padrão ficou de fora)
    expect(clip.connections['É VIP?'].main[0]).toEqual([{ node: 'Oferta', type: 'main', index: 0 }])
    expect(clip.connections['É VIP?'].main[1]).toEqual([])
  })

  it('colar no mesmo fluxo deduplica nomes e preserva a ligação interna', () => {
    const g0 = fixture()
    const clip = copyNodes(g0, ['É VIP?', 'Oferta'])
    const { graph: g, names } = pasteNodes(g0, clip)

    expect(names).toEqual(['É VIP?1', 'Oferta1'])
    expect(g.connections['É VIP?1'].main[0]).toEqual([{ node: 'Oferta1', type: 'main', index: 0 }])
    // o original continua intacto
    expect(g.connections['É VIP?'].main[0]).toEqual([{ node: 'Oferta', type: 'main', index: 0 }])
  })

  it('colar desloca a posição para os nós não ficarem sobrepostos', () => {
    const g0 = fixture()
    const clip = copyNodes(g0, ['Oferta'])
    const { graph: g } = pasteNodes(g0, clip, [40, 40])
    const colado = g.nodes.find((n) => n.name === 'Oferta1')
    expect(colado.position).toEqual([640, -40])
  })

  it('colar gera ids novos', () => {
    const g0 = fixture()
    const clip = copyNodes(g0, ['Oferta'])
    const { graph: g } = pasteNodes(g0, clip)
    const orig = g.nodes.find((n) => n.name === 'Oferta')
    const copia = g.nodes.find((n) => n.name === 'Oferta1')
    expect(copia.id).not.toBe(orig.id)
  })

  it('colar em outro fluxo funciona sem renomear nada', () => {
    const clip = copyNodes(fixture(), ['É VIP?', 'Oferta'])
    const { graph: g, names } = pasteNodes(createEmptyGraph(), clip)
    expect(names).toEqual(['É VIP?', 'Oferta'])
    expect(g.connections['É VIP?'].main[0][0].node).toBe('Oferta')
  })

  it('colar duas vezes produz nós independentes', () => {
    const g0 = fixture()
    const clip = copyNodes(g0, ['Oferta'])
    const um = pasteNodes(g0, clip)
    const dois = pasteNodes(um.graph, clip)
    expect(dois.names).toEqual(['Oferta2'])
    expect(dois.graph.nodes.filter((n) => n.name.startsWith('Oferta'))).toHaveLength(3)
  })

  it('parâmetros do nó copiado são independentes do original', () => {
    const g0 = fixture()
    const clip = copyNodes(g0, ['Boas-vindas'])
    const { graph: g } = pasteNodes(g0, clip)
    g.nodes.find((n) => n.name === 'Boas-vindas1').parameters.text = 'alterado'
    expect(g.nodes.find((n) => n.name === 'Boas-vindas').parameters.text).toBe('Olá [Nome]!')
  })
})

describe('round-trip Vue Flow', () => {
  it('ida e volta preserva o grafo', () => {
    const g0 = fixture()
    const { nodes, edges } = toVueFlow(g0, TYPES)
    const g1 = fromVueFlow(nodes, edges, g0.meta)

    expect(g1.nodes).toEqual(g0.nodes)
    expect(g1.connections).toEqual(g0.connections)
  })

  it('mapeia a saída para o handle certo', () => {
    const { edges } = toVueFlow(fixture(), TYPES)
    const verdadeiro = edges.find((e) => e.target === 'Oferta')
    const falso = edges.find((e) => e.target === 'Padrão')
    expect(verdadeiro.sourceHandle).toBe('out-0')
    expect(falso.sourceHandle).toBe('out-1')
  })

  it('ids de aresta são únicos', () => {
    const { edges } = toVueFlow(fixture(), TYPES)
    expect(new Set(edges.map((e) => e.id)).size).toBe(edges.length)
  })

  it('mover um nó na tela altera só a posição', () => {
    const g0 = fixture()
    const { nodes, edges } = toVueFlow(g0, TYPES)
    nodes.find((n) => n.id === 'Oferta').position = { x: 999, y: 111 }
    const g1 = fromVueFlow(nodes, edges, g0.meta)

    expect(g1.nodes.find((n) => n.name === 'Oferta').position).toEqual([999, 111])
    expect(g1.connections).toEqual(g0.connections)
  })
})

describe('validate', () => {
  it('aprova o fluxo de referência', () => {
    const r = validate(fixture(), TYPES)
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
    expect(r.warnings).toEqual([])
  })

  it('exige um nó de Início', () => {
    const r = validate(deleteNode(fixture(), 'Início'), TYPES)
    expect(r.ok).toBe(false)
    expect(r.errors.map((e) => e.code)).toContain('no_start')
  })

  it('recusa dois Inícios', () => {
    const g = addNode(fixture(), { type: 'eciaa.start', name: 'Outro início' }).graph
    expect(validate(g, TYPES).errors.map((e) => e.code)).toContain('multiple_starts')
  })

  it('acusa conexão apontando para nó inexistente', () => {
    const g = fixture()
    g.connections['Boas-vindas'].main[0][0].node = 'Sumiu'
    expect(validate(g, TYPES).errors.map((e) => e.code)).toContain('dangling_target')
  })

  it('acusa saída além das que o tipo tem', () => {
    const g = fixture()
    g.connections['Boas-vindas'].main.push([{ node: 'Oferta', type: 'main', index: 0 }])
    expect(validate(g, TYPES).errors.map((e) => e.code)).toContain('output_out_of_range')
  })

  it('avisa sobre nó inalcançável, sem barrar a publicação', () => {
    const g = addNode(fixture(), { type: 'eciaa.content', name: 'Solto' }).graph
    const r = validate(g, TYPES)
    expect(r.ok).toBe(true)
    expect(r.warnings.map((w) => w.node)).toContain('Solto')
  })

  it('acusa nomes duplicados', () => {
    const g = fixture()
    g.nodes.push({ ...g.nodes[3], id: 'outro' })
    expect(validate(g, TYPES).errors.map((e) => e.code)).toContain('duplicate_name')
  })
})
