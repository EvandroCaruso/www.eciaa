/**
 * Posicionamento de popover — puro, sem Vue e sem DOM.
 *
 * ⚠️ Existe por um recorte que já custou uma correção nesta base: um popover
 * `position: absolute` dentro de um container com `overflow-y: auto` é CORTADO
 * (o overflow vale para os dois eixos). Foi o que aconteceu com o menu ⋮ da lista
 * de fluxos nas últimas linhas, e é o que aconteceria com qualquer popover dentro
 * do painel de propriedades, que tem 320 px e o mesmo `overflow-y: auto`.
 *
 * A saída é sempre a mesma: `Teleport` para o <body> + `position: fixed` + esta
 * aritmética. Quem chama já tinha o cálculo escrito à mão e sem teste nenhum;
 * aqui ele fica num lugar só, testado, e serve aos dois popovers.
 *
 * Nada aqui lê `window` — a viewport entra por parâmetro, que é o que torna a
 * função testável sem browser.
 */

/**
 * @param {{top:number, bottom:number, left:number, right:number}} rect  gatilho
 * @param {{largura:number, altura:number}} tamanho  medida do popover já montado
 * @param {{largura:number, altura:number}} viewport
 * @param {{margem?:number, espaco?:number, alturaMinima?:number, alinha?:'esquerda'|'direita'}} opts
 * @returns {{left:number, top:number, maxHeight:number, paraCima:boolean}}
 */
export function posicionaPopover(rect, tamanho, viewport, opts = {}) {
  const margem = opts.margem ?? 8
  const espaco = opts.espaco ?? 4
  const alturaMinima = opts.alturaMinima ?? 140
  const alinha = opts.alinha === 'esquerda' ? 'esquerda' : 'direita'

  const abaixo = viewport.altura - rect.bottom - margem - espaco
  const acima = rect.top - margem - espaco
  const altura = tamanho.altura

  // Só vira para cima se de fato couber melhor lá: perto do rodapé, abrir para
  // baixo mostraria duas linhas e esconderia o resto.
  const paraCima = altura > abaixo && acima > abaixo

  const maxHeight = Math.max(alturaMinima, paraCima ? acima : abaixo)
  const usada = Math.min(altura, maxHeight)

  // O clamp horizontal é o que faz um popover largo funcionar preso à borda
  // direita da janela — que é exatamente onde o painel de propriedades vive.
  let left = alinha === 'direita' ? rect.right - tamanho.largura : rect.left
  left = Math.min(Math.max(margem, left), Math.max(margem, viewport.largura - margem - tamanho.largura))

  return {
    left,
    top: paraCima ? rect.top - espaco - usada : rect.bottom + espaco,
    maxHeight,
    paraCima
  }
}

/** Açúcar para o caso comum no browser: mede o elemento e lê a viewport. */
export function posicionaNoDom(rect, el, opts = {}) {
  if (!el) return { left: 0, top: 0, maxHeight: 320, paraCima: false }
  return posicionaPopover(
    rect,
    { largura: el.offsetWidth, altura: el.scrollHeight },
    { largura: window.innerWidth, altura: window.innerHeight },
    opts
  )
}
