import { describe, it, expect } from 'vitest'
import { resumoSubBloco, resumoBloco, avisoRuntime } from './preview.js'

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
  it('junta os sub-blocos na ordem', () => {
    const p = { blocks: [
      { kind: 'text', text: 'Oi' },
      { kind: 'delay', seconds: 3, typing: true },
      { kind: 'image', asset_id: 9 }
    ] }
    expect(resumoBloco(p, SUB_TYPES)).toBe('🔤 Oi · ⏱ 3s digitando · 🖼 Imagem')
  })

  it('bloco sem sub-blocos não vira lixo visual', () => {
    expect(resumoBloco({ blocks: [] }, SUB_TYPES)).toBe('')
    expect(resumoBloco({}, SUB_TYPES)).toBe('')
    expect(resumoBloco(null, SUB_TYPES)).toBe('')
  })
})

describe('avisoRuntime', () => {
  it('texto + mídia: avisa que sai só o texto', () => {
    const p = { blocks: [{ kind: 'text', text: 'oi' }, { kind: 'image', asset_id: 1 }] }
    expect(avisoRuntime(p)).toMatch(/só o texto/)
  })

  it('mídia sem texto: avisa que não sai NADA — é o caso mais perigoso', () => {
    expect(avisoRuntime({ blocks: [{ kind: 'image', asset_id: 1 }] })).toMatch(/não manda nada/)
  })

  it('bloco só de texto não recebe aviso', () => {
    expect(avisoRuntime({ blocks: [{ kind: 'text', text: 'oi' }] })).toBeNull()
  })

  it('atraso NÃO gera aviso: a pausa acontece de verdade pelo espelho', () => {
    // avisar aqui seria exagero — delay_seconds é escrito e o executor v0 o respeita
    expect(avisoRuntime({ blocks: [{ kind: 'delay', seconds: 3, typing: true }] })).toBeNull()
    expect(avisoRuntime({ blocks: [{ kind: 'text', text: 'oi' }, { kind: 'delay', seconds: 3 }] })).toBeNull()
  })

  it('bloco vazio não recebe aviso', () => {
    expect(avisoRuntime({ blocks: [] })).toBeNull()
  })
})
