/**
 * Organizar o fluxo — puro, sem Vue e sem DOM.
 *
 * É o "Tidy up" do n8n: reposiciona os blocos em camadas da esquerda para a
 * direita, de modo que toda seta aponte para frente e o fluxo se leia como uma
 * linha. Não muda nada além de `position`.
 *
 * ⚠️ Não lê o DOM de propósito: as alturas reais dos cards entram por parâmetro
 * (`alturas`), o que torna a função testável sem browser. Sem elas, usa uma
 * altura média — o layout sai bom, só menos justo.
 *
 * O algoritmo é o clássico em camadas (estilo Sugiyama), na versão curta:
 *   1. camada de cada nó = caminho MAIS LONGO desde uma raiz (garante seta sempre
 *      para a direita, o que "menor caminho" não garante quando há atalhos)
 *   2. ordem dentro da camada pelo baricentro dos pais, duas passadas
 *   3. posição: x pela camada, y empilhado e centrado
 */

export const LARGURA_NO = 230        // .mf-node no canvas.css
export const ALTURA_PADRAO = 96      // card típico: cabeçalho + 1 linha + saídas
export const GAP_X = 90
export const GAP_Y = 40

/** Arestas do grafo, na ordem das saídas (na Condição: Verdadeiro antes de Falso). */
function arestas(graph) {
  const out = []
  const conns = (graph && graph.connections) || {}
  for (const [origem, saidas] of Object.entries(conns)) {
    const main = (saidas && saidas.main) || []
    main.forEach((destinos, indiceSaida) => {
      ;(destinos || []).forEach((d, ordem) => {
        if (d && d.node) out.push({ de: origem, para: d.node, indiceSaida, ordem })
      })
    })
  }
  return out
}

/**
 * Marca as arestas de retorno (ciclo) para que não entrem no cálculo de camada.
 * Sem isto, um fluxo com laço não tem "caminho mais longo" e o layout nunca converge.
 */
function arestasDeRetorno(nomes, todas) {
  const filhos = new Map(nomes.map((n) => [n, []]))
  for (const a of todas) if (filhos.has(a.de)) filhos.get(a.de).push(a)

  const ESTADO = { NOVO: 0, ABERTO: 1, FECHADO: 2 }
  const estado = new Map(nomes.map((n) => [n, ESTADO.NOVO]))
  const retorno = new Set()

  // DFS iterativo: fluxo grande não pode estourar a pilha do navegador
  for (const raiz of nomes) {
    if (estado.get(raiz) !== ESTADO.NOVO) continue
    const pilha = [{ no: raiz, i: 0 }]
    estado.set(raiz, ESTADO.ABERTO)
    while (pilha.length) {
      const topo = pilha[pilha.length - 1]
      const lista = filhos.get(topo.no) || []
      if (topo.i >= lista.length) {
        estado.set(topo.no, ESTADO.FECHADO)
        pilha.pop()
        continue
      }
      const a = lista[topo.i++]
      const st = estado.get(a.para)
      if (st === ESTADO.ABERTO) retorno.add(a)          // fecha um ciclo
      else if (st === ESTADO.NOVO) {
        estado.set(a.para, ESTADO.ABERTO)
        pilha.push({ no: a.para, i: 0 })
      }
    }
  }
  return retorno
}

/** Camada de cada nó = maior distância desde uma raiz. */
function camadas(nomes, arcos) {
  const entradas = new Map(nomes.map((n) => [n, 0]))
  for (const a of arcos) if (entradas.has(a.para)) entradas.set(a.para, entradas.get(a.para) + 1)

  const camada = new Map(nomes.map((n) => [n, 0]))
  const fila = nomes.filter((n) => entradas.get(n) === 0)
  const restante = new Map(entradas)

  // ordem topológica; como as arestas de retorno já saíram, ela sempre existe
  while (fila.length) {
    const n = fila.shift()
    for (const a of arcos) {
      if (a.de !== n) continue
      camada.set(a.para, Math.max(camada.get(a.para) || 0, (camada.get(n) || 0) + 1))
      restante.set(a.para, restante.get(a.para) - 1)
      if (restante.get(a.para) === 0) fila.push(a.para)
    }
  }
  return camada
}

/**
 * Organiza o grafo e devolve um grafo NOVO (não muta a entrada).
 *
 * `opts.alturas` é um mapa `nome -> altura em px` (as medidas do canvas). O que
 * faltar cai em ALTURA_PADRAO.
 */
export function organizarGrafo(graph, opts = {}) {
  const g = graph || {}
  const nodes = Array.isArray(g.nodes) ? g.nodes : []
  if (!nodes.length) return { ...g, nodes: [] }

  const larguraNo = opts.larguraNo ?? LARGURA_NO
  const gapX = opts.gapX ?? GAP_X
  const gapY = opts.gapY ?? GAP_Y
  const alturas = opts.alturas || {}
  const origem = opts.origem || [80, 80]
  const alturaDe = (nome) => Number(alturas[nome]) || ALTURA_PADRAO

  const nomes = nodes.map((n) => n.name)
  const todas = arestas(g).filter((a) => nomes.includes(a.de) && nomes.includes(a.para))
  const retorno = arestasDeRetorno(nomes, todas)
  const arcos = todas.filter((a) => !retorno.has(a))

  const camada = camadas(nomes, arcos)

  // Soltos (sem nenhuma conexão) vão para uma faixa própria embaixo, em vez de
  // se misturarem à primeira camada e sugerirem um começo que não existe.
  const ligados = new Set()
  for (const a of arcos) { ligados.add(a.de); ligados.add(a.para) }
  const soltos = nomes.filter((n) => !ligados.has(n))
  const noFluxo = nomes.filter((n) => ligados.has(n))

  const porCamada = new Map()
  for (const n of noFluxo) {
    const c = camada.get(n) || 0
    if (!porCamada.has(c)) porCamada.set(c, [])
    porCamada.get(c).push(n)
  }

  const pais = new Map(nomes.map((n) => [n, []]))
  for (const a of arcos) pais.get(a.para).push(a)

  const indice = new Map()
  const ordenadas = [...porCamada.keys()].sort((x, y) => x - y)

  for (const c of ordenadas) {
    const lista = porCamada.get(c)
    if (c === ordenadas[0]) {
      lista.forEach((n, i) => indice.set(n, i))
      continue
    }
    // baricentro: fica perto de quem aponta para ele. Empate desempata pelo
    // índice da SAÍDA — na Condição, isso põe Verdadeiro acima de Falso.
    const peso = new Map()
    for (const n of lista) {
      const ps = pais.get(n).filter((a) => indice.has(a.de))
      const media = ps.length
        ? ps.reduce((s, a) => s + indice.get(a.de), 0) / ps.length
        : Number.MAX_SAFE_INTEGER
      const saida = ps.length ? Math.min(...ps.map((a) => a.indiceSaida)) : 0
      peso.set(n, [media, saida, lista.indexOf(n)])
    }
    lista.sort((a, b) => {
      const [ma, sa, ia] = peso.get(a)
      const [mb, sb, ib] = peso.get(b)
      return ma - mb || sa - sb || ia - ib
    })
    lista.forEach((n, i) => indice.set(n, i))
  }

  const filhos = new Map(nomes.map((n) => [n, []]))
  for (const a of arcos) filhos.get(a.de).push(a)

  // -------------------------------------------------------------------------
  // y: distribuição PROPORCIONAL, não empilhamento centrado
  // -------------------------------------------------------------------------
  // Centrar cada coluna no global (o que se fazia até 31/07) alinha as colunas
  // mas não relaciona pai e filho: um bloco com 2 ou n saídas ficava com os
  // filhos empilhados no topo da coluna em vez de abertos em leque em volta
  // dele. Aqui os centros são refinados por baricentro, nas duas direções:
  //   → filho segue a média dos pais  (o ramo desce junto de quem o originou)
  //   ← pai segue a média dos filhos  (é isto que abre o leque simétrico)
  // Poucas passadas bastam; o resultado converge rápido e é determinístico —
  // `jaOrganizado` depende disso para não gastar um passo de desfazer à toa.
  const centro = new Map()
  for (const c of ordenadas) {
    let y = 0
    for (const n of porCamada.get(c)) {
      centro.set(n, y + alturaDe(n) / 2)
      y += alturaDe(n) + gapY
    }
  }

  /**
   * Aplica os centros desejados de uma camada preservando a ORDEM já decidida e
   * o espaçamento mínimo. O empurrão é só para baixo; a coluna inteira é
   * recentrada no fim para não escorregar a cada passada.
   */
  function acomoda(c, desejado) {
    const lista = porCamada.get(c)
    const tops = []
    let limite = -Infinity
    for (const n of lista) {
      const h = alturaDe(n)
      const top = Math.max(limite, (desejado.has(n) ? desejado.get(n) : centro.get(n)) - h / 2)
      tops.push(top)
      limite = top + h + gapY
    }
    const alvos = lista.filter((n) => desejado.has(n))
    if (alvos.length) {
      const media = (f) => alvos.reduce((s, n) => s + f(n), 0) / alvos.length
      const delta = media((n) => desejado.get(n)) - media((n) => tops[lista.indexOf(n)] + alturaDe(n) / 2)
      lista.forEach((n, i) => centro.set(n, tops[i] + alturaDe(n) / 2 + delta))
    } else {
      lista.forEach((n, i) => centro.set(n, tops[i] + alturaDe(n) / 2))
    }
  }

  const mediaDe = (arcosDoNo, ponta) => {
    const vs = arcosDoNo.map((a) => centro.get(a[ponta])).filter((v) => v !== undefined)
    return vs.length ? vs.reduce((s, v) => s + v, 0) / vs.length : undefined
  }

  for (let passada = 0; passada < 4; passada++) {
    for (const c of ordenadas.slice(1)) {
      const desejado = new Map()
      for (const n of porCamada.get(c)) {
        const m = mediaDe(pais.get(n), 'de')
        if (m !== undefined) desejado.set(n, m)
      }
      acomoda(c, desejado)
    }
    for (const c of [...ordenadas].reverse().slice(1)) {
      const desejado = new Map()
      for (const n of porCamada.get(c)) {
        const m = mediaDe(filhos.get(n), 'para')
        if (m !== undefined) desejado.set(n, m)
      }
      acomoda(c, desejado)
    }
  }

  // encosta o desenho inteiro na origem, preservando as distâncias relativas
  const topos = noFluxo.map((n) => centro.get(n) - alturaDe(n) / 2)
  const deslocamento = origem[1] - (topos.length ? Math.min(...topos) : 0)

  const posicoes = new Map()
  for (const c of ordenadas) {
    const x = origem[0] + c * (larguraNo + gapX)
    for (const n of porCamada.get(c)) {
      posicoes.set(n, [Math.round(x), Math.round(centro.get(n) - alturaDe(n) / 2 + deslocamento)])
    }
  }

  // faixa dos soltos, abaixo de tudo
  if (soltos.length) {
    const fundo = noFluxo.length
      ? Math.max(...noFluxo.map((n) => posicoes.get(n)[1] + alturaDe(n)))
      : origem[1]
    const yBase = fundo + gapY * 3
    soltos.forEach((n, i) => {
      posicoes.set(n, [Math.round(origem[0] + i * (larguraNo + gapX)), Math.round(yBase)])
    })
  }

  return {
    ...g,
    nodes: nodes.map((n) => {
      const p = posicoes.get(n.name)
      return p ? { ...n, position: p } : n
    })
  }
}

/**
 * O grafo já está organizado? Serve para não empilhar um passo de desfazer
 * quando clicar no botão não mudaria nada.
 */
export function jaOrganizado(graph, opts = {}) {
  const novo = organizarGrafo(graph, opts)
  const antes = (graph.nodes || []).map((n) => `${n.name}:${n.position}`).join('|')
  const depois = novo.nodes.map((n) => `${n.name}:${n.position}`).join('|')
  return antes === depois
}
