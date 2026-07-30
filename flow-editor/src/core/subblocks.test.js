import { describe, it, expect } from 'vitest'
import {
  newSubBlock, addSubBlock, updateSubBlock, removeSubBlock, duplicateSubBlock,
  moveSubBlock, buildMirrors, precisaExecutorNovo, normalizeParameters, withBlocks,
  subTypeFor
} from './subblocks.js'

const SUB_TYPES = [
  { kind: 'text', label: 'Texto', icon: '🔤', fields: [{ key: 'text', type: 'rich-text' }] },
  { kind: 'delay', label: 'Atraso', icon: '⏱', fields: [
    { key: 'seconds', type: 'range', min: 0, max: 6, default: 3 },
    { key: 'typing', type: 'switch', default: true }
  ] },
  { kind: 'image', label: 'Imagem', icon: '🖼', fields: [
    { key: 'asset_id', type: 'asset' }, { key: 'caption', type: 'rich-text' }
  ] }
]
const tipo = (k) => subTypeFor(SUB_TYPES, k)

describe('newSubBlock', () => {
  it('aplica os defaults do catálogo', () => {
    const b = newSubBlock(tipo('delay'))
    expect(b.kind).toBe('delay')
    expect(b.seconds).toBe(3)
    expect(b.typing).toBe(true)
  })

  it('campo sem default nasce vazio, e asset nasce nulo', () => {
    const b = newSubBlock(tipo('image'))
    expect(b.asset_id).toBeNull()
    expect(b.caption).toBe('')
  })

  it('cada sub-bloco tem id próprio', () => {
    expect(newSubBlock(tipo('text')).id).not.toBe(newSubBlock(tipo('text')).id)
  })
})

describe('ordem e edição', () => {
  const base = () => [
    { id: 'a', kind: 'text', text: 'um' },
    { id: 'b', kind: 'delay', seconds: 2, typing: true },
    { id: 'c', kind: 'text', text: 'dois' }
  ]

  it('adiciona no fim por padrão', () => {
    const { blocks } = addSubBlock(base(), tipo('text'))
    expect(blocks).toHaveLength(4)
    expect(blocks[3].kind).toBe('text')
  })

  it('adiciona numa posição específica', () => {
    const { blocks } = addSubBlock(base(), tipo('image'), 1)
    expect(blocks.map((b) => b.kind)).toEqual(['text', 'image', 'delay', 'text'])
  })

  it('duplica LOGO ABAIXO do original, não no fim', () => {
    const { blocks, id } = duplicateSubBlock(base(), 'a')
    expect(blocks.map((b) => b.id)).toEqual(['a', id, 'b', 'c'])
    expect(blocks[1].text).toBe('um')
  })

  it('a cópia é independente do original', () => {
    const { blocks, id } = duplicateSubBlock(base(), 'a')
    const depois = updateSubBlock(blocks, id, { text: 'mudado' })
    expect(depois.find((b) => b.id === 'a').text).toBe('um')
  })

  it('move para cima e para baixo', () => {
    expect(moveSubBlock(base(), 'b', -1).map((b) => b.id)).toEqual(['b', 'a', 'c'])
    expect(moveSubBlock(base(), 'b', 1).map((b) => b.id)).toEqual(['a', 'c', 'b'])
  })

  it('nas pontas, mover não faz nada', () => {
    expect(moveSubBlock(base(), 'a', -1).map((b) => b.id)).toEqual(['a', 'b', 'c'])
    expect(moveSubBlock(base(), 'c', 1).map((b) => b.id)).toEqual(['a', 'b', 'c'])
  })

  it('remove sem mexer no resto', () => {
    expect(removeSubBlock(base(), 'b').map((b) => b.id)).toEqual(['a', 'c'])
  })

  it('nenhuma operação altera o array recebido', () => {
    const original = base()
    addSubBlock(original, tipo('text'))
    moveSubBlock(original, 'a', 1)
    removeSubBlock(original, 'a')
    expect(original.map((b) => b.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('buildMirrors — o que o Executor v0 vai ler', () => {
  it('concatena os textos com linha em branco', () => {
    const m = buildMirrors([
      { kind: 'text', text: 'um' },
      { kind: 'delay', seconds: 3 },
      { kind: 'text', text: 'dois' }
    ])
    expect(m.text).toBe('um\n\ndois')
  })

  it('soma as pausas', () => {
    expect(buildMirrors([{ kind: 'delay', seconds: 2.5 }, { kind: 'delay', seconds: 3 }]).delay_seconds).toBe(6)
  })

  it('respeita o teto de 300 do campo antigo', () => {
    expect(buildMirrors([{ kind: 'delay', seconds: 999 }]).delay_seconds).toBe(300)
  })

  it('ignora texto em branco', () => {
    expect(buildMirrors([{ kind: 'text', text: '   ' }, { kind: 'text', text: 'ok' }]).text).toBe('ok')
  })

  it('bloco só de mídia produz espelho VAZIO — é o buraco que a tela precisa avisar', () => {
    const m = buildMirrors([{ kind: 'image', asset_id: 1 }])
    expect(m.text).toBe('')
    expect(precisaExecutorNovo([{ kind: 'image', asset_id: 1 }])).toBe(true)
  })

  it('bloco só de texto não precisa do executor novo', () => {
    expect(precisaExecutorNovo([{ kind: 'text', text: 'oi' }])).toBe(false)
  })

  it('atraso sobrevive ao espelho: não exige executor novo', () => {
    // delay_seconds é escrito e o Executor v0 respeita a pausa; só o "digitando" fica de fora
    expect(precisaExecutorNovo([{ kind: 'delay', seconds: 3, typing: true }])).toBe(false)
    expect(precisaExecutorNovo([{ kind: 'text', text: 'oi' }, { kind: 'delay', seconds: 3 }])).toBe(false)
  })

  it('qualquer mídia ou contato exige', () => {
    for (const kind of ['image', 'video', 'audio', 'file', 'contact']) {
      expect(precisaExecutorNovo([{ kind }])).toBe(true)
    }
  })
})

describe('normalizeParameters — abrir bloco antigo (typeVersion 1)', () => {
  it('texto antigo vira sub-bloco de texto', () => {
    const p = normalizeParameters({ text: 'Olá [Nome]!', delay_seconds: 0 })
    expect(p.blocks).toHaveLength(1)
    expect(p.blocks[0]).toMatchObject({ kind: 'text', text: 'Olá [Nome]!' })
  })

  it('o atraso antigo entra NA FRENTE do texto', () => {
    const p = normalizeParameters({ text: 'oi', delay_seconds: 5 })
    expect(p.blocks.map((b) => b.kind)).toEqual(['delay', 'text'])
  })

  it('valor herdado acima da régua de 6s é PRESERVADO, não cortado', () => {
    // cortar na abertura mudaria em silêncio o tempo de um fluxo que está no ar
    const p = normalizeParameters({ text: 'oi', delay_seconds: 45 })
    expect(p.blocks[0].seconds).toBe(45)
  })

  it('bloco antigo vazio não inventa sub-bloco', () => {
    expect(normalizeParameters({ text: '', delay_seconds: 0 }).blocks).toEqual([])
  })

  it('bloco já novo é devolvido como está', () => {
    const blocks = [{ id: 'x', kind: 'text', text: 'oi' }]
    expect(normalizeParameters({ blocks }).blocks).toEqual(blocks)
  })

  it('sub-bloco sem id ganha um', () => {
    const p = normalizeParameters({ blocks: [{ kind: 'text', text: 'oi' }] })
    expect(p.blocks[0].id).toBeTruthy()
  })

  it('normalizar já deixa os espelhos coerentes', () => {
    const p = normalizeParameters({ blocks: [{ id: 'a', kind: 'text', text: 'oi' }, { id: 'b', kind: 'delay', seconds: 4 }] })
    expect(p.text).toBe('oi')
    expect(p.delay_seconds).toBe(4)
  })

  it('normalizar é idempotente', () => {
    const uma = normalizeParameters({ text: 'oi', delay_seconds: 3 })
    const duas = normalizeParameters(uma)
    expect(duas.blocks).toEqual(uma.blocks)
    expect(duas.text).toBe(uma.text)
  })
})

describe('withBlocks', () => {
  it('é o ponto único que reescreve os espelhos', () => {
    const p = withBlocks({ text: 'velho', delay_seconds: 99 }, [{ id: 'a', kind: 'text', text: 'novo' }])
    expect(p.text).toBe('novo')
    expect(p.delay_seconds).toBe(0)
  })

  it('preserva parâmetros que não são nossos', () => {
    expect(withBlocks({ outro: 42 }, []).outro).toBe(42)
  })
})
