import { describe, it, expect } from 'vitest'
import { organizarGrafo, jaOrganizado, LARGURA_NO, GAP_X } from './layout.js'

const PASSO = LARGURA_NO + GAP_X

/** Monta um grafo no formato n8n a partir de uma lista de arestas. */
function grafo(nomes, ligacoes = [], posicoes = {}) {
  const connections = {}
  for (const [de, para, saida = 0] of ligacoes) {
    if (!connections[de]) connections[de] = { main: [] }
    const main = connections[de].main
    while (main.length <= saida) main.push([])
    main[saida].push({ node: para, type: 'main', index: 0 })
  }
  return {
    nodes: nomes.map((n) => ({
      id: n, name: n, type: 'eciaa.content', typeVersion: 1,
      position: posicoes[n] || [0, 0], parameters: {}
    })),
    connections
  }
}

const x = (g, nome) => g.nodes.find((n) => n.name === nome).position[0]
const y = (g, nome) => g.nodes.find((n) => n.name === nome).position[1]

describe('organizarGrafo', () => {
  it('cadeia simples vira uma linha da esquerda para a direita', () => {
    const g = organizarGrafo(grafo(['A', 'B', 'C'], [['A', 'B'], ['B', 'C']]))
    expect(x(g, 'B') - x(g, 'A')).toBe(PASSO)
    expect(x(g, 'C') - x(g, 'B')).toBe(PASSO)
    expect(y(g, 'A')).toBe(y(g, 'B'))
  })

  it('NÃO muta o grafo de entrada', () => {
    const original = grafo(['A', 'B'], [['A', 'B']])
    const copia = JSON.stringify(original)
    organizarGrafo(original)
    expect(JSON.stringify(original)).toBe(copia)
  })

  it('camada é o caminho MAIS LONGO, não o mais curto', () => {
    // A→B→C e também A→C (atalho). Se usasse o menor caminho, C ficaria na
    // camada 1, do lado de B, e a seta B→C apontaria para trás.
    const g = organizarGrafo(grafo(['A', 'B', 'C'], [['A', 'B'], ['B', 'C'], ['A', 'C']]))
    expect(x(g, 'C')).toBeGreaterThan(x(g, 'B'))
  })

  it('toda seta aponta para a frente num fluxo sem ciclo', () => {
    const g = organizarGrafo(grafo(
      ['Início', 'Cond', 'Sim', 'Não', 'Fim'],
      [['Início', 'Cond'], ['Cond', 'Sim', 0], ['Cond', 'Não', 1], ['Sim', 'Fim'], ['Não', 'Fim']]
    ))
    for (const [de, para] of [['Início', 'Cond'], ['Cond', 'Sim'], ['Cond', 'Não'], ['Sim', 'Fim'], ['Não', 'Fim']]) {
      expect(x(g, para)).toBeGreaterThan(x(g, de))
    }
  })

  it('na Condição, a saída Verdadeiro fica ACIMA da Falso', () => {
    // é o índice da saída desempatando: 0 = Verdadeiro, 1 = Falso
    const g = organizarGrafo(grafo(['C', 'Sim', 'Não'], [['C', 'Sim', 0], ['C', 'Não', 1]]))
    expect(y(g, 'Sim')).toBeLessThan(y(g, 'Não'))
  })

  it('os dois ramos de uma condição ficam na MESMA coluna', () => {
    const g = organizarGrafo(grafo(['C', 'Sim', 'Não'], [['C', 'Sim', 0], ['C', 'Não', 1]]))
    expect(x(g, 'Sim')).toBe(x(g, 'Não'))
  })

  it('ciclo não trava nem desalinha o resto', () => {
    // C volta para A: a aresta de retorno sai do cálculo de camada
    const g = organizarGrafo(grafo(['A', 'B', 'C'], [['A', 'B'], ['B', 'C'], ['C', 'A']]))
    expect(x(g, 'B')).toBeGreaterThan(x(g, 'A'))
    expect(x(g, 'C')).toBeGreaterThan(x(g, 'B'))
  })

  it('bloco solto vai para uma faixa embaixo, não para a primeira coluna', () => {
    // pôr o solto ao lado do Início sugeriria um segundo começo do fluxo
    const g = organizarGrafo(grafo(['A', 'B', 'Solto'], [['A', 'B']]))
    expect(y(g, 'Solto')).toBeGreaterThan(y(g, 'A'))
    expect(y(g, 'Solto')).toBeGreaterThan(y(g, 'B'))
  })

  it('usa a altura real de cada card quando ela é informada', () => {
    const g = organizarGrafo(
      grafo(['C', 'Sim', 'Não'], [['C', 'Sim', 0], ['C', 'Não', 1]]),
      { alturas: { Sim: 300 } }
    )
    expect(y(g, 'Não') - y(g, 'Sim')).toBeGreaterThanOrEqual(300)
  })

  it('colunas ficam centradas entre si', () => {
    // uma coluna de 1 e outra de 2: a de 1 fica no meio vertical da de 2
    const g = organizarGrafo(grafo(['C', 'Sim', 'Não'], [['C', 'Sim', 0], ['C', 'Não', 1]]))
    const meioDosFilhos = (y(g, 'Sim') + y(g, 'Não')) / 2
    expect(Math.abs(y(g, 'C') - meioDosFilhos)).toBeLessThan(60)
  })

  it('grafo vazio ou sem conexões não quebra', () => {
    expect(organizarGrafo({ nodes: [], connections: {} }).nodes).toEqual([])
    expect(organizarGrafo(null).nodes).toEqual([])
    const soltos = organizarGrafo(grafo(['A', 'B']))
    expect(soltos.nodes).toHaveLength(2)
    expect(x(soltos, 'B')).toBeGreaterThan(x(soltos, 'A'))
  })

  it('conexão para bloco inexistente é ignorada, não quebra', () => {
    // acontece de verdade: renomear/excluir deixa ponteiro pendurado no grafo
    const g = grafo(['A'], [['A', 'Fantasma']])
    expect(() => organizarGrafo(g)).not.toThrow()
    expect(organizarGrafo(g).nodes).toHaveLength(1)
  })

  it('o resultado é estável: organizar duas vezes dá o mesmo', () => {
    const uma = organizarGrafo(grafo(['A', 'B', 'C'], [['A', 'B'], ['B', 'C']]))
    const duas = organizarGrafo(uma)
    expect(duas.nodes.map((n) => n.position)).toEqual(uma.nodes.map((n) => n.position))
  })

  it('preserva tudo que não é posição', () => {
    const g = grafo(['A'], [])
    g.nodes[0].parameters = { text: 'oi' }
    g.meta = { schema: 'eciaa-msgflow' }
    const novo = organizarGrafo(g)
    expect(novo.nodes[0].parameters).toEqual({ text: 'oi' })
    expect(novo.meta).toEqual({ schema: 'eciaa-msgflow' })
    expect(novo.connections).toEqual(g.connections)
  })
})

describe('jaOrganizado', () => {
  it('diz que sim quando organizar não mudaria nada', () => {
    const g = organizarGrafo(grafo(['A', 'B'], [['A', 'B']]))
    expect(jaOrganizado(g)).toBe(true)
  })

  it('diz que não quando os blocos estão espalhados', () => {
    const g = grafo(['A', 'B'], [['A', 'B']], { A: [900, 40], B: [12, 700] })
    expect(jaOrganizado(g)).toBe(false)
  })
})
