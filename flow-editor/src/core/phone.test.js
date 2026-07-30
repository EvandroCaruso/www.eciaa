import { describe, it, expect } from 'vitest'
import { formatarNacional, paraE164, deE164, telefoneValido, paisPor, soDigitos } from './phone.js'

describe('formatarNacional (BR)', () => {
  it('celular de 11 dígitos', () => {
    expect(formatarNacional('15991195899')).toBe('(15) 99119-5899')
  })

  it('fixo de 10 dígitos', () => {
    expect(formatarNacional('1591195899')).toBe('(15) 9119-5899')
  })

  it('formata enquanto se digita, sem estorvar', () => {
    expect(formatarNacional('1')).toBe('(1')
    expect(formatarNacional('15')).toBe('(15')
    expect(formatarNacional('159')).toBe('(15) 9')
    expect(formatarNacional('15991')).toBe('(15) 991')
    expect(formatarNacional('1599119')).toBe('(15) 9911-9')
  })

  it('ignora o que já vem formatado e não duplica máscara', () => {
    expect(formatarNacional('(15) 99119-5899')).toBe('(15) 99119-5899')
  })

  it('descarta dígito além do 11º', () => {
    expect(formatarNacional('159911958990000')).toBe('(15) 99119-5899')
  })

  it('vazio continua vazio', () => {
    expect(formatarNacional('')).toBe('')
    expect(formatarNacional(null)).toBe('')
  })
})

describe('formatarNacional (fora do Brasil)', () => {
  it('agrupa de 3 em 3 em vez de inventar máscara', () => {
    expect(formatarNacional('351912345678', 'PT')).toBe('351 912 345 678')
  })
})

describe('paraE164', () => {
  it('põe o DDI do país escolhido', () => {
    expect(paraE164('(15) 99119-5899', 'BR')).toBe('+5515991195899')
    expect(paraE164('912345678', 'PT')).toBe('+351912345678')
  })

  it('sem número, não inventa um E.164 só com DDI', () => {
    expect(paraE164('', 'BR')).toBe('')
  })
})

describe('deE164', () => {
  it('reabre o que foi gravado', () => {
    expect(deE164('+5515991195899')).toEqual({ code: 'BR', nacional: '15991195899' })
  })

  it('casa o DDI mais longo primeiro', () => {
    // +1 (EUA) não pode engolir +55 nem +351
    expect(deE164('+351912345678').code).toBe('PT')
    expect(deE164('+15551234567').code).toBe('US')
  })

  it('número sem + assume o país informado', () => {
    expect(deE164('15991195899', 'BR')).toEqual({ code: 'BR', nacional: '15991195899' })
  })

  it('vazio devolve o padrão', () => {
    expect(deE164('')).toEqual({ code: 'BR', nacional: '' })
  })

  it('ida e volta preserva o número', () => {
    const e164 = paraE164('15991195899', 'BR')
    const { code, nacional } = deE164(e164)
    expect(paraE164(nacional, code)).toBe(e164)
  })
})

describe('telefoneValido', () => {
  it('BR aceita 10 e 11 dígitos', () => {
    expect(telefoneValido('15991195899', 'BR')).toBe(true)
    expect(telefoneValido('1591195899', 'BR')).toBe(true)
  })

  it('BR recusa truncado', () => {
    expect(telefoneValido('159911', 'BR')).toBe(false)
  })

  it('fora do BR é frouxo de propósito', () => {
    expect(telefoneValido('912345678', 'PT')).toBe(true)
    expect(telefoneValido('123', 'PT')).toBe(false)
  })
})

describe('auxiliares', () => {
  it('paisPor cai no padrão quando não conhece', () => {
    expect(paisPor('XX').code).toBe('BR')
  })

  it('soDigitos limpa qualquer máscara', () => {
    expect(soDigitos('+55 (15) 99119-5899')).toBe('5515991195899')
  })
})
