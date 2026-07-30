import { describe, it, expect } from 'vitest'
import { parseVars, insertVar, splitByVars, unknownVars, wrapSelection, tokenFor } from './vars.js'

const CONHECIDAS = ['nome-completo', 'primeiro-nome', 'telefone', 'attr.EVO_Contrato', 'vars.unidade']

describe('parseVars', () => {
  it('acha as variáveis com as posições certas', () => {
    const v = parseVars('Olá [primeiro-nome]!')
    expect(v).toHaveLength(1)
    expect(v[0].key).toBe('primeiro-nome')
    expect('Olá [primeiro-nome]!'.slice(v[0].start, v[0].end)).toBe('[primeiro-nome]')
  })

  it('aceita ponto, sublinhado e hífen na chave', () => {
    const keys = parseVars('[attr.EVO_Contrato] [vars.unidade] [nome-completo]').map((v) => v.key)
    expect(keys).toEqual(['attr.EVO_Contrato', 'vars.unidade', 'nome-completo'])
  })

  it('não casa chave duplas do n8n/Chatwoot', () => {
    // D5: {{ }} é do n8n e do Chatwoot. Não é nossa sintaxe e não pode virar pílula.
    expect(parseVars('Olá {{contact.name}} e {{1}}')).toHaveLength(0)
  })

  it('ignora colchete vazio ou com espaço', () => {
    expect(parseVars('[] [ ] [nome completo]')).toHaveLength(0)
  })

  it('é reentrante — chamar duas vezes dá o mesmo resultado', () => {
    // a regex é global e mora no módulo: sem resetar lastIndex, a 2ª chamada pula ocorrências
    const t = '[nome-completo] e [telefone]'
    expect(parseVars(t)).toHaveLength(2)
    expect(parseVars(t)).toHaveLength(2)
  })
})

describe('insertVar', () => {
  it('insere no ponto do cursor, não no fim', () => {
    const r = insertVar('Olá , tudo bem?', 4, 4, 'primeiro-nome')
    expect(r.text).toBe('Olá [primeiro-nome], tudo bem?')
  })

  it('deixa o cursor logo depois do token', () => {
    const r = insertVar('Olá ', 4, 4, 'nome-completo')
    expect(r.cursor).toBe(4 + '[nome-completo]'.length)
    expect(r.text.slice(0, r.cursor)).toBe('Olá [nome-completo]')
  })

  it('substitui a seleção', () => {
    const r = insertVar('Olá Maria!', 4, 9, 'primeiro-nome')
    expect(r.text).toBe('Olá [primeiro-nome]!')
  })

  it('não estoura com cursor fora do texto', () => {
    expect(insertVar('abc', 99, 99, 'telefone').text).toBe('abc[telefone]')
    expect(insertVar('abc', -5, -5, 'telefone').text).toBe('[telefone]abc')
  })

  it('funciona no texto vazio', () => {
    expect(insertVar('', 0, 0, 'telefone')).toEqual({ text: '[telefone]', cursor: 10 })
  })

  it('tokenFor é a única fonte do formato', () => {
    expect(tokenFor('ddd')).toBe('[ddd]')
  })
})

describe('splitByVars', () => {
  it('separa texto e variável preservando o conteúdo', () => {
    const partes = splitByVars('Olá [primeiro-nome]!', CONHECIDAS)
    expect(partes.map((p) => p.valor).join('')).toBe('Olá [primeiro-nome]!')
    expect(partes.map((p) => p.tipo)).toEqual(['texto', 'var', 'texto'])
  })

  it('marca como desconhecida a variável que a paleta não ofereceu', () => {
    const partes = splitByVars('[nome-completo] [inventada]', CONHECIDAS)
    const vars = partes.filter((p) => p.tipo === 'var')
    expect(vars[0].conhecida).toBe(true)
    expect(vars[1].conhecida).toBe(false)
  })

  it('lida com variável colada na outra', () => {
    const partes = splitByVars('[nome-completo][telefone]', CONHECIDAS)
    expect(partes).toHaveLength(2)
    expect(partes.every((p) => p.tipo === 'var')).toBe(true)
  })

  it('texto sem variável vira um pedaço só', () => {
    expect(splitByVars('sem nada', CONHECIDAS)).toEqual([{ tipo: 'texto', valor: 'sem nada' }])
  })

  it('texto vazio não gera pedaço', () => {
    expect(splitByVars('', CONHECIDAS)).toEqual([])
  })
})

describe('unknownVars', () => {
  it('lista só as que não existem, sem repetir', () => {
    expect(unknownVars('[x] [nome-completo] [x] [y]', CONHECIDAS)).toEqual(['x', 'y'])
  })
})

describe('wrapSelection', () => {
  it('envolve a seleção com o marcador do WhatsApp', () => {
    expect(wrapSelection('Olá Maria', 4, 9, '*').text).toBe('Olá *Maria*')
  })

  it('desmarca quando já estava marcado', () => {
    // marcar duas vezes empilharia asteriscos e o WhatsApp mostraria o símbolo
    expect(wrapSelection('Olá *Maria*', 4, 11, '*').text).toBe('Olá Maria')
  })

  it('sem seleção, insere o par e deixa o cursor no meio', () => {
    const r = wrapSelection('Olá ', 4, 4, '_')
    expect(r.text).toBe('Olá __')
    expect(r.cursor).toBe(5)
  })

  it('serve para itálico e tachado', () => {
    expect(wrapSelection('abc', 0, 3, '_').text).toBe('_abc_')
    expect(wrapSelection('abc', 0, 3, '~').text).toBe('~abc~')
  })
})
