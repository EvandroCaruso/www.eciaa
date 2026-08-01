import { describe, it, expect } from 'vitest'
import { problemasDoBloco, textoDosProblemas } from './problemas.js'

const CAMPO_COND = {
  key: 'conditions',
  type: 'condition-list',
  groups: [
    { title: 'OPERAÇÕES MAIS USADAS', subjects: [
      { subject: 'label', label: 'Etiqueta' },
      { subject: 'business_hours', label: 'Horário de Atendimento' }
    ] }
  ]
}

const CAMPO_BLOCKS = {
  key: 'blocks',
  type: 'blocks',
  sub_types: [
    { kind: 'text', label: 'Texto', icon: '💬', fields: [{ key: 'text', label: 'Mensagem', type: 'rich-text', required: true }] },
    { kind: 'image', label: 'Imagem', icon: '🖼️', fields: [{ key: 'asset_id', label: 'Arquivo', type: 'asset' }] },
    { kind: 'contact', label: 'Contato', icon: '👤', fields: [{ key: 'phone', label: 'Telefone', type: 'text', required: true }] }
  ]
}

const specCondicao = { params_schema: { fields: [CAMPO_COND] } }
const specConteudo = { params_schema: { fields: [CAMPO_BLOCKS] } }

describe('problemasDoBloco — Condição', () => {
  it('acusa a condição sem valor, nomeando o sujeito', () => {
    const p = problemasDoBloco({
      nodeType: 'eciaa.condition',
      parameters: { mode: 'ALL', conditions: [{ id: 'a', subject: 'label', op: 'is' }] },
      spec: specCondicao
    })
    expect(p).toHaveLength(1)
    expect(p[0]).toContain('Etiqueta')
  })

  it('condição completa não gera aviso', () => {
    const p = problemasDoBloco({
      nodeType: 'eciaa.condition',
      parameters: { mode: 'ALL', conditions: [{ id: 'a', subject: 'label', op: 'is', value: 'vip' }] },
      spec: specCondicao
    })
    expect(p).toEqual([])
  })

  it('operador de aridade 0 não é pendência', () => {
    const p = problemasDoBloco({
      nodeType: 'eciaa.condition',
      parameters: { mode: 'ALL', conditions: [{ id: 'a', subject: 'business_hours', op: 'inside' }] },
      spec: specCondicao
    })
    expect(p).toEqual([])
  })

  it('bloco de condição SEM condição nenhuma não é pendência', () => {
    // é um bloco recém-criado, não um bloco errado — acusar aqui faria todo
    // arrastar de bloco nascer com ✗ vermelho, e o aviso perderia o sentido
    const p = problemasDoBloco({
      nodeType: 'eciaa.condition',
      parameters: { mode: 'ALL', conditions: [] },
      spec: specCondicao
    })
    expect(p).toEqual([])
  })

  it('acusa CADA condição incompleta, não só a primeira', () => {
    const p = problemasDoBloco({
      nodeType: 'eciaa.condition',
      parameters: { mode: 'ALL', conditions: [
        { id: 'a', subject: 'label', op: 'is' },
        { id: 'b', subject: 'label', op: 'is', value: 'vip' },
        { id: 'c', subject: 'label', op: 'is_not' }
      ] },
      spec: specCondicao
    })
    expect(p).toHaveLength(2)
  })
})

describe('problemasDoBloco — Conteúdo', () => {
  it('mensagem sem nenhuma parte é pendência', () => {
    const p = problemasDoBloco({ nodeType: 'eciaa.content', parameters: { blocks: [] }, spec: specConteudo })
    expect(p.join(' ')).toMatch(/vazia/i)
  })

  it('texto obrigatório em branco é pendência', () => {
    const p = problemasDoBloco({
      nodeType: 'eciaa.content',
      parameters: { blocks: [{ id: '1', kind: 'text', text: '   ' }] },
      spec: specConteudo
    })
    expect(p).toHaveLength(1)
    expect(p[0]).toContain('Mensagem')
  })

  it('mídia sem arquivo escolhido é pendência mesmo sem `required` no schema', () => {
    const p = problemasDoBloco({
      nodeType: 'eciaa.content',
      parameters: { blocks: [{ id: '1', kind: 'image', caption: 'oi' }] },
      spec: specConteudo
    })
    expect(p.join(' ')).toMatch(/arquivo/i)
  })

  it('"usar o número conectado" NÃO cobra o telefone', () => {
    // o número real só existe no dispatch; cobrar aqui seria acusar o
    // comportamento correto
    const p = problemasDoBloco({
      nodeType: 'eciaa.content',
      parameters: { blocks: [{ id: '1', kind: 'contact', phone: '', use_connected_number: true }] },
      spec: specConteudo
    })
    expect(p).toEqual([])
  })

  it('sem "número conectado", telefone em branco volta a ser pendência', () => {
    const p = problemasDoBloco({
      nodeType: 'eciaa.content',
      parameters: { blocks: [{ id: '1', kind: 'contact', phone: '' }] },
      spec: specConteudo
    })
    expect(p).toHaveLength(1)
    expect(p[0]).toContain('Telefone')
  })
})

describe('problemasDoBloco — genérico', () => {
  it('campo required do próprio bloco é cobrado sem código específico', () => {
    // é o que faz bloco NOVO (INSERT no catálogo, sem deploy) nascer coberto
    const spec = { params_schema: { fields: [{ key: 'url', label: 'Endereço', type: 'text', required: true }] } }
    expect(problemasDoBloco({ nodeType: 'eciaa.http', parameters: {}, spec })).toHaveLength(1)
    expect(problemasDoBloco({ nodeType: 'eciaa.http', parameters: { url: 'x' }, spec })).toEqual([])
  })

  it('campo NÃO obrigatório em branco nunca vira aviso', () => {
    const spec = { params_schema: { fields: [{ key: 'nota', label: 'Nota', type: 'text' }] } }
    expect(problemasDoBloco({ nodeType: 'eciaa.x', parameters: {}, spec })).toEqual([])
  })

  it('bloco sem schema nenhum não explode', () => {
    expect(problemasDoBloco({ nodeType: 'eciaa.start', parameters: {}, spec: {} })).toEqual([])
    expect(problemasDoBloco({})).toEqual([])
  })

  it('zero e false são conteúdo, não falta de conteúdo', () => {
    const spec = { params_schema: { fields: [{ key: 'n', label: 'N', type: 'number', required: true }] } }
    expect(problemasDoBloco({ nodeType: 'x', parameters: { n: 0 }, spec })).toEqual([])
    expect(problemasDoBloco({ nodeType: 'x', parameters: { n: false }, spec })).toEqual([])
  })
})

describe('textoDosProblemas', () => {
  it('sem pendência, sem balão', () => {
    expect(textoDosProblemas([])).toBe('')
    expect(textoDosProblemas(undefined)).toBe('')
  })

  it('uma pendência usa singular; várias, plural com a contagem', () => {
    expect(textoDosProblemas(['a'])).toBe('Falta configurar:\n• a')
    expect(textoDosProblemas(['a', 'b'])).toBe('Faltam configurar 2 itens:\n• a\n• b')
  })
})
