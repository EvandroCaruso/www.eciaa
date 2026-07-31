import { describe, it, expect } from 'vitest'
import { posicionaPopover } from './popover.js'

const VIEW = { largura: 1280, altura: 800 }
const P = { largura: 520, altura: 300 }

/** Gatilho de 24px de altura na posição pedida. */
function gatilho({ top, left, largura = 32 }) {
  return { top, bottom: top + 24, left, right: left + largura }
}

describe('posicionaPopover', () => {
  it('abre para baixo quando cabe', () => {
    const r = posicionaPopover(gatilho({ top: 100, left: 900 }), P, VIEW)
    expect(r.paraCima).toBe(false)
    expect(r.top).toBe(124 + 4)
  })

  it('vira para cima perto do rodapé', () => {
    // é o defeito que o menu ⋮ tinha nas últimas linhas da lista
    const r = posicionaPopover(gatilho({ top: 700, left: 900 }), P, VIEW)
    expect(r.paraCima).toBe(true)
    expect(r.top).toBeLessThan(700)
  })

  it('não vira para cima se em cima couber menos', () => {
    // sem esta condição, um gatilho no meio da tela viraria à toa
    const r = posicionaPopover(gatilho({ top: 300, left: 900 }), { largura: 520, altura: 600 }, VIEW)
    expect(r.paraCima).toBe(false)
  })

  it('alinha pela direita por padrão — o popover cresce para dentro da tela', () => {
    const g = gatilho({ top: 100, left: 900 })
    expect(posicionaPopover(g, P, VIEW).left).toBe(g.right - P.largura)
  })

  it('alinha pela esquerda quando pedido', () => {
    const g = gatilho({ top: 100, left: 200 })
    expect(posicionaPopover(g, P, VIEW, { alinha: 'esquerda' }).left).toBe(200)
  })

  it('gatilho colado na borda direita não empurra o popover para fora', () => {
    // o painel de propriedades vive encostado na borda direita: sem clamp, um
    // popover de 520px sairia da tela e ficaria inalcançável
    const r = posicionaPopover(gatilho({ top: 100, left: 1250 }), P, VIEW)
    expect(r.left).toBeGreaterThanOrEqual(8)
    expect(r.left + P.largura).toBeLessThanOrEqual(VIEW.largura - 8)
  })

  it('gatilho colado na borda esquerda respeita a margem', () => {
    const r = posicionaPopover(gatilho({ top: 100, left: 0 }), P, VIEW, { alinha: 'esquerda' })
    expect(r.left).toBe(8)
  })

  it('popover mais largo que a janela encosta na margem em vez de negativar', () => {
    const r = posicionaPopover(gatilho({ top: 100, left: 100 }), { largura: 2000, altura: 300 }, VIEW)
    expect(r.left).toBe(8)
  })

  it('a altura disponível nunca desce abaixo do mínimo — lista rolável é melhor que lista de 12px', () => {
    const r = posicionaPopover(gatilho({ top: 770, left: 900 }), P, { largura: 1280, altura: 800 })
    expect(r.maxHeight).toBeGreaterThanOrEqual(140)
  })

  it('quando vira para cima, o rodapé do popover encosta no gatilho', () => {
    const g = gatilho({ top: 700, left: 900 })
    const r = posicionaPopover(g, P, VIEW)
    expect(r.top + Math.min(P.altura, r.maxHeight)).toBe(g.top - 4)
  })

  it('margem e espaço são configuráveis sem mudar a regra', () => {
    const g = gatilho({ top: 100, left: 900 })
    expect(posicionaPopover(g, P, VIEW, { espaco: 12 }).top).toBe(g.bottom + 12)
    // margem maior afasta mais da borda quando o clamp entra em ação
    const naBorda = gatilho({ top: 100, left: 0 })
    expect(posicionaPopover(naBorda, P, VIEW, { margem: 20, alinha: 'esquerda' }).left).toBe(20)
  })
})
