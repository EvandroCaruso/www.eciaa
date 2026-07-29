import { describe, it, expect } from 'vitest'
import { flowNameKey, isFlowNameTaken, uniqueFlowName } from './names.js'

const flows = [
  { id: 1, flow_name: 'Boas-vindas Wellness' },
  { id: 2, flow_name: 'Teste' },
  { id: 3, flow_name: 'Teste (1)' }
]

describe('flowNameKey', () => {
  it('ignora caixa, acento e espaço sobrando', () => {
    expect(flowNameKey('  Cobrança   Atrasada ')).toBe('cobranca atrasada')
    expect(flowNameKey('COBRANCA ATRASADA')).toBe(flowNameKey('cobrança atrasada'))
  })

  it('trata nulo e indefinido como vazio', () => {
    expect(flowNameKey(null)).toBe('')
    expect(flowNameKey(undefined)).toBe('')
  })
})

describe('isFlowNameTaken', () => {
  it('acusa colisão mesmo com caixa e acento diferentes', () => {
    expect(isFlowNameTaken('boas vindas wellness', flows)).toBe(false) // hífen importa
    expect(isFlowNameTaken('BOAS-VINDAS WELLNESS', flows)).toBe(true)
    expect(isFlowNameTaken('  Teste  ', flows)).toBe(true)
  })

  it('o fluxo não colide consigo mesmo (renomear)', () => {
    expect(isFlowNameTaken('Teste', flows, 2)).toBe(false)
    expect(isFlowNameTaken('Teste', flows, 1)).toBe(true)
  })

  it('nome vazio nunca colide — quem barra vazio é o formulário', () => {
    expect(isFlowNameTaken('', flows)).toBe(false)
    expect(isFlowNameTaken('   ', flows)).toBe(false)
  })
})

describe('uniqueFlowName', () => {
  it('devolve o próprio nome quando está livre', () => {
    expect(uniqueFlowName('Aniversário', flows)).toBe('Aniversário')
  })

  it('sufixa (1) na primeira colisão', () => {
    expect(uniqueFlowName('Boas-vindas Wellness', flows)).toBe('Boas-vindas Wellness (1)')
  })

  it('pula sufixos já ocupados', () => {
    expect(uniqueFlowName('Teste', flows)).toBe('Teste (2)')
  })

  it('não aninha sufixo: "Teste (1)" vira "Teste (2)", não "Teste (1) (1)"', () => {
    expect(uniqueFlowName('Teste (1)', flows)).toBe('Teste (2)')
  })

  it('apara espaço das pontas', () => {
    expect(uniqueFlowName('  Novo fluxo  ', flows)).toBe('Novo fluxo')
  })

  it('conta a partir do sufixo mesmo em lista longa', () => {
    const muitos = Array.from({ length: 5 }, (_, i) => ({
      id: i + 10,
      flow_name: i === 0 ? 'Campanha' : `Campanha (${i})`
    }))
    expect(uniqueFlowName('Campanha', muitos)).toBe('Campanha (5)')
  })
})
