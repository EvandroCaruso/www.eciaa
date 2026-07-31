import { describe, it, expect } from 'vitest'
import { resumoSubBloco, resumoBloco, linhasDoBloco, resumoCondicao, linhasDaCondicao } from './preview.js'

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

const CTX = {
  sujeitos: {
    label: 'Etiqueta',
    weekday: 'Dia da Semana ao passar por aqui',
    time: 'Hora ao passar por aqui',
    business_hours: 'Horário de Atendimento',
    assignee: 'Atendimento está atribuído para um membro'
  },
  campos: { 'nome-completo': { label: 'Nome completo', type: 'text' } },
  agentes: { 26: 'Evandro Caruso' }
}

describe('resumoCondicao', () => {
  it('usa o rótulo do sujeito vindo do SCHEMA, não um literal do código', () => {
    // é o labelOp() do MsgFlowNode.vue que este arquivo existe para matar:
    // rótulo redigitado no componente diverge do catálogo sem dar teste vermelho
    const r = resumoCondicao({ subject: 'label', op: 'is', value: 'vip' }, CTX)
    expect(r.titulo).toBe('Etiqueta')
    expect(r.operador).toBe('É')
    expect(r.valor).toBe('vip')
  })

  it('sem rótulo no contexto cai na chave crua, e não em vazio', () => {
    expect(resumoCondicao({ subject: 'label', op: 'is', value: 'x' }, {}).titulo).toBe('label')
  })

  it('campo usa o catálogo vivo; sem ele, a fotografia gravada', () => {
    // é o que mantém o card legível com o cwmkt fora do ar
    const c = { subject: 'field', field: 'nome-completo', field_type: 'text', op: 'contains', value: 'Ana' }
    expect(resumoCondicao(c, CTX).titulo).toBe('Nome completo')

    const orfao = { subject: 'field', field: 'EVO_Contrato', field_label: 'Contrato EVO', field_type: 'text', op: 'is', value: '1' }
    expect(resumoCondicao(orfao, CTX).titulo).toBe('Contrato EVO')
    expect(resumoCondicao({ ...orfao, field_label: undefined }, CTX).titulo).toBe('EVO_Contrato')
  })

  it('falta de valor é DITA, não escondida', () => {
    expect(resumoCondicao({ subject: 'label', op: 'is' }, CTX).valor).toBe('selecione, por favor')
    expect(resumoCondicao({ subject: 'label', op: 'is' }, CTX).incompleta).toBe(true)
  })

  it('operador sem valor não mostra valor nenhum', () => {
    const r = resumoCondicao({ subject: 'business_hours', op: 'inside' }, CTX)
    expect(r.operador).toBe('está dentro')
    expect(r.valor).toBe('')
  })

  it('assignee sem valor é OUTRA PERGUNTA, não falta de valor', () => {
    expect(resumoCondicao({ subject: 'assignee', op: 'is' }, CTX).valor).toBe('qualquer membro')
    expect(resumoCondicao({ subject: 'assignee', op: 'is', value: 26 }, CTX).valor).toBe('Evandro Caruso')
    // agente que saiu do time: o nome gravado ainda deixa o card legível
    expect(resumoCondicao({ subject: 'assignee', op: 'is', value: 99, value_label: 'Fulano' }, CTX).valor).toBe('Fulano')
    expect(resumoCondicao({ subject: 'assignee', op: 'is', value: 99 }, CTX).valor).toBe('#99')
  })

  it('dia da semana sai por extenso, não como mon/tue', () => {
    expect(resumoCondicao({ subject: 'weekday', op: 'is', value: 'tue' }, CTX).valor).toBe('Terça-feira')
  })

  it('entre mostra as duas pontas', () => {
    expect(resumoCondicao({ subject: 'time', op: 'between', value: ['18:00', '23:59'] }, CTX).valor)
      .toBe('18:00 e 23:59')
  })

  it('regra legacy aparece com o texto original e marcada', () => {
    const r = resumoCondicao({ subject: 'legacy', attr: 'vars.unidade', op: 'contains', value: 'Castanhal' }, CTX)
    expect(r.titulo).toBe('vars.unidade')
    expect(r.operador).toBe('contém')
    expect(r.legacy).toBe(true)
  })
})

describe('linhasDaCondicao', () => {
  it('uma linha por condição, na ordem', () => {
    const p = { conditions: [
      { subject: 'label', op: 'is', value: 'vip' },
      { subject: 'weekday', op: 'is_not', value: 'sun' },
      { subject: 'business_hours', op: 'inside' }
    ] }
    expect(linhasDaCondicao(p, CTX)).toEqual([
      'Etiqueta · É · vip',
      'Dia da Semana ao passar por aqui · NÃO É · Domingo',
      'Horário de Atendimento · está dentro'
    ])
  })

  it('bloco sem condições não vira lixo visual', () => {
    expect(linhasDaCondicao({ conditions: [] }, CTX)).toEqual([])
    expect(linhasDaCondicao(null, CTX)).toEqual([])
  })
})
