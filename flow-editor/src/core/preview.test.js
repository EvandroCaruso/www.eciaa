import { describe, it, expect } from 'vitest'
import { resumoSubBloco, resumoBloco, linhasDoBloco } from './preview.js'

const SUB_TYPES = [
  { kind: 'text', label: 'Texto', icon: '🔤' },
  { kind: 'delay', label: 'Atraso', icon: '⏱' },
  { kind: 'image', label: 'Imagem', icon: '🖼' },
  { kind: 'contact', label: 'Contato', icon: '👤' }
]

describe('resumoSubBloco', () => {
  it('texto aparece com o ícone e o conteúdo', () => {
    expect(resumoSubBloco({ kind: 'text', text: 'Olá!' }, SUB_TYPES)).toBe('🔤 Olá!')
  })

  it('texto longo é cortado com reticências', () => {
    const r = resumoSubBloco({ kind: 'text', text: 'a'.repeat(80) }, SUB_TYPES)
    expect(r.length).toBeLessThan(50)
    expect(r.endsWith('…')).toBe(true)
  })

  it('quebra de linha não vaza para o resumo', () => {
    expect(resumoSubBloco({ kind: 'text', text: 'um\ndois' }, SUB_TYPES)).toBe('🔤 um dois')
  })

  it('texto vazio é dito, não escondido', () => {
    expect(resumoSubBloco({ kind: 'text', text: '' }, SUB_TYPES)).toBe('🔤 texto vazio')
  })

  it('atraso mostra segundos e se está digitando', () => {
    expect(resumoSubBloco({ kind: 'delay', seconds: 3, typing: true }, SUB_TYPES)).toBe('⏱ 3s digitando')
    expect(resumoSubBloco({ kind: 'delay', seconds: 3, typing: false }, SUB_TYPES)).toBe('⏱ 3s')
  })

  it('meio segundo sai com vírgula, como o brasileiro lê', () => {
    expect(resumoSubBloco({ kind: 'delay', seconds: 1.5, typing: false }, SUB_TYPES)).toBe('⏱ 1,5s')
  })

  it('mídia mostra o rótulo e a legenda quando houver', () => {
    expect(resumoSubBloco({ kind: 'image', asset_id: 1, caption: '' }, SUB_TYPES)).toBe('🖼 Imagem')
    expect(resumoSubBloco({ kind: 'image', asset_id: 1, caption: 'Fachada' }, SUB_TYPES)).toBe('🖼 Imagem · Fachada')
  })

  it('contato mostra o nome', () => {
    expect(resumoSubBloco({ kind: 'contact', display_name: 'Suporte' }, SUB_TYPES)).toBe('👤 Suporte')
  })

  it('tipo fora do catálogo não quebra a tela', () => {
    expect(resumoSubBloco({ kind: 'inventado' }, SUB_TYPES)).toBe('• inventado')
  })
})

describe('resumoBloco', () => {
  const p = { blocks: [
    { kind: 'text', text: 'Oi' },
    { kind: 'delay', seconds: 3, typing: true },
    { kind: 'image', asset_id: 9 }
  ] }

  it('põe uma parte POR LINHA, na ordem', () => {
    // separadas por " · " numa linha só, cinco partes viravam um parágrafo ilegível
    expect(resumoBloco(p, SUB_TYPES)).toBe('🔤 Oi\n⏱ 3s digitando\n🖼 Imagem')
  })

  it('linhasDoBloco devolve o array, para quem quiser desenhar item a item', () => {
    expect(linhasDoBloco(p, SUB_TYPES)).toEqual(['🔤 Oi', '⏱ 3s digitando', '🖼 Imagem'])
  })

  it('bloco sem sub-blocos não vira lixo visual', () => {
    expect(resumoBloco({ blocks: [] }, SUB_TYPES)).toBe('')
    expect(resumoBloco({}, SUB_TYPES)).toBe('')
    expect(resumoBloco(null, SUB_TYPES)).toBe('')
    expect(linhasDoBloco(null, SUB_TYPES)).toEqual([])
  })
})
