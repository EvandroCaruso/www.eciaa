import { describe, it, expect } from 'vitest'
import {
  OPERADORES,
  SUBJECTS,
  DIAS_SEMANA,
  chaveOperadores,
  operadoresDe,
  operadorSpec,
  labelOperador,
  tipoDeCampo,
  newCondition,
  condicaoIncompleta,
  migraRegra,
  normalizeParameters,
  withConditions,
  addCondition,
  updateCondition,
  removeCondition,
  trocaOperador,
  rotuloLogica,
  fraseVerdadeiro,
  fraseFalso,
  aceitaExact,
  normalizaTexto
} from './condition.js'

describe('catálogo de operadores', () => {
  it('um mesmo id de operador tem o MESMO rótulo em todos os sujeitos', () => {
    // o resumo do card procura o rótulo só pelo id (labelOperador); id ambíguo
    // pintaria "É" num lugar e outra coisa no outro, para a mesma instrução
    const porId = new Map()
    for (const lista of Object.values(OPERADORES)) {
      for (const op of lista) {
        if (porId.has(op.id)) expect(porId.get(op.id)).toBe(op.label)
        else porId.set(op.id, op.label)
      }
    }
    expect(porId.size).toBeGreaterThan(0)
  })

  it('operador de aridade 0 não declara editor de valor', () => {
    for (const lista of Object.values(OPERADORES)) {
      for (const op of lista) {
        if (op.aridade === 0) expect(op.editor).toBe('none')
        else expect(op.editor).not.toBe('none')
      }
    }
  })

  it('a lista de ids é a congelada — renomear operador é teste vermelho, não divergência muda', () => {
    // o executor casa por id; renomear "is" quebraria fluxo publicado em silêncio
    const ids = new Set()
    for (const lista of Object.values(OPERADORES)) for (const op of lista) ids.add(op.id)
    expect([...ids].sort()).toEqual([
      'after', 'before', 'between', 'contains', 'ends_with', 'exists',
      'greater_than', 'has_any_value', 'inside', 'is', 'is_empty', 'is_not',
      'less_than', 'not_contains', 'not_exists', 'on', 'outside', 'starts_with'
    ])
  })

  it('todo sujeito com operadores está na lista de SUBJECTS', () => {
    for (const k of Object.keys(OPERADORES)) {
      expect(SUBJECTS).toContain(k.startsWith('field:') ? 'field' : k)
    }
  })

  it('campo de tipo desconhecido cai em texto, nunca fica sem operadores', () => {
    expect(tipoDeCampo('checkbox')).toBe('text')
    expect(tipoDeCampo(undefined)).toBe('text')
    expect(tipoDeCampo('date')).toBe('date')
    const c = { subject: 'field', field: 'x', field_type: 'list' }
    expect(chaveOperadores(c)).toBe('field:text')
    expect(operadoresDe(c).length).toBeGreaterThan(0)
  })

  it('sujeito inventado não tem operadores e não explode', () => {
    expect(chaveOperadores({ subject: 'inventado' })).toBe(null)
    expect(operadoresDe({ subject: 'inventado' })).toEqual([])
    expect(operadorSpec({ subject: 'inventado', op: 'is' })).toBe(null)
  })

  it('labelOperador devolve o id cru quando não conhece — não quebra a tela', () => {
    expect(labelOperador('is')).toBe('É')
    expect(labelOperador('nao_existe')).toBe('nao_existe')
  })

  it('os sete dias saem na ordem em que a pessoa lê', () => {
    expect(DIAS_SEMANA.map((d) => d.key)).toEqual(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])
  })
})

describe('newCondition', () => {
  it('nasce com o primeiro operador da lista — é o que a tela já mostra em azul', () => {
    expect(newCondition({ subject: 'label' }).op).toBe('is')
    expect(newCondition({ subject: 'time' }).op).toBe('after')
    expect(newCondition({ subject: 'business_hours' }).op).toBe('inside')
  })

  it('condição de campo carrega o vocabulário do Conteúdo, não contact.custom_attributes.X', () => {
    const c = newCondition({
      subject: 'field', field: 'EVO_Contrato', field_source: 'client',
      field_type: 'date', field_label: 'Contrato EVO'
    })
    expect(c.field).toBe('EVO_Contrato')
    expect(c.field_type).toBe('date')
    expect(c.field_source).toBe('client')
    expect(c.op).toBe('after')
  })

  it('cada condição ganha id próprio', () => {
    const a = newCondition({ subject: 'label' })
    const b = newCondition({ subject: 'label' })
    expect(a.id).not.toBe(b.id)
  })
})

describe('condicaoIncompleta', () => {
  it('ausente e vazio NÃO são a mesma coisa em assignee', () => {
    // sem valor = "tem alguém atribuído", que é pergunta legítima;
    // value vazio seria pergunta pela metade
    expect(condicaoIncompleta({ subject: 'assignee', op: 'is' })).toBe(false)
    expect(condicaoIncompleta({ subject: 'assignee', op: 'is', value: '' })).toBe(true)
    expect(condicaoIncompleta({ subject: 'assignee', op: 'is', value: 26 })).toBe(false)
  })

  it('operador de aridade 0 nunca está incompleto', () => {
    expect(condicaoIncompleta({ subject: 'business_hours', op: 'inside' })).toBe(false)
    expect(condicaoIncompleta({ subject: 'field', field_type: 'text', op: 'has_any_value' })).toBe(false)
  })

  it('operador de aridade 1 sem valor está incompleto', () => {
    expect(condicaoIncompleta({ subject: 'label', op: 'is' })).toBe(true)
    expect(condicaoIncompleta({ subject: 'label', op: 'is', value: 'vip' })).toBe(false)
  })

  it('entre exige DOIS valores preenchidos', () => {
    expect(condicaoIncompleta({ subject: 'time', op: 'between' })).toBe(true)
    expect(condicaoIncompleta({ subject: 'time', op: 'between', value: ['18:00'] })).toBe(true)
    expect(condicaoIncompleta({ subject: 'time', op: 'between', value: ['18:00', ''] })).toBe(true)
    expect(condicaoIncompleta({ subject: 'time', op: 'between', value: ['18:00', '23:59'] })).toBe(false)
  })

  it('zero é valor válido, não falta de valor', () => {
    expect(condicaoIncompleta({ subject: 'field', field_type: 'number', op: 'is', value: 0 })).toBe(false)
  })

  it('condição legacy nunca é acusada de incompleta — ela é só somente-leitura', () => {
    expect(condicaoIncompleta({ subject: 'legacy', attr: 'vars.x', op: 'contains' })).toBe(false)
  })
})

describe('migração do formato antigo', () => {
  it('regra antiga de etiqueta com valor vazio vira INCOMPLETA, não Etiqueta É ""', () => {
    // é o dado REAL dos fluxos 1, 12 e 15 em produção: {equals, contact.labels, ''}
    const c = migraRegra({ attr: 'contact.labels', op: 'equals', value: '' })
    expect(c.subject).toBe('label')
    expect(c.op).toBe('is')
    expect('value' in c).toBe(false)
    expect(condicaoIncompleta(c)).toBe(true)
  })

  it('etiqueta com valor de verdade atravessa inteira', () => {
    const c = migraRegra({ attr: 'contact.labels', op: 'equals', value: 'vip' })
    expect(c).toMatchObject({ subject: 'label', op: 'is', value: 'vip' })
  })

  it('os três campos nativos viram o vocabulário do Conteúdo', () => {
    expect(migraRegra({ attr: 'contact.name', op: 'contains', value: 'Ana' })).toMatchObject({
      subject: 'field', field: 'nome-completo', field_source: 'system', op: 'contains', value: 'Ana'
    })
    expect(migraRegra({ attr: 'contact.phone', op: 'equals', value: '55' }).field).toBe('telefone')
    expect(migraRegra({ attr: 'contact.email', op: 'equals', value: 'a@b' }).field).toBe('email')
  })

  it('custom_attributes.X vira campo do cliente com a chave nua', () => {
    const c = migraRegra({ attr: 'contact.custom_attributes.EVO_Contrato', op: 'equals', value: '1' })
    expect(c).toMatchObject({ subject: 'field', field: 'EVO_Contrato', field_source: 'client', field_type: 'text' })
  })

  it('exists vira "possui algum valor" e não carrega valor nenhum', () => {
    const c = migraRegra({ attr: 'contact.name', op: 'exists', value: 'lixo' })
    expect(c.op).toBe('has_any_value')
    expect('value' in c).toBe(false)
  })

  it('vars.* vira legacy, nunca sumindo da lista', () => {
    const c = migraRegra({ attr: 'vars.unidade', op: 'contains', value: 'Castanhal' })
    expect(c.subject).toBe('legacy')
    expect(c.attr).toBe('vars.unidade')
    expect(c.value).toBe('Castanhal')
  })

  it('etiqueta com "contém" vira legacy — não é expressável em É/NÃO É', () => {
    expect(migraRegra({ attr: 'contact.labels', op: 'contains', value: 'x' }).subject).toBe('legacy')
  })

  it('regra sem atributo vira legacy em vez de sumir', () => {
    expect(migraRegra({ attr: '', op: 'equals', value: 'x' }).subject).toBe('legacy')
    expect(migraRegra(null).subject).toBe('legacy')
  })
})

describe('normalizeParameters', () => {
  it('NÃO muda o objeto de entrada', () => {
    // §1.1 do spec do Conteúdo: abrir um fluxo publicado só para olhar não
    // pode reescrevê-lo. Converter é leitura, não escrita.
    const p = { mode: 'ALL', rules: [{ attr: 'contact.labels', op: 'equals', value: 'vip' }] }
    const antes = JSON.stringify(p)
    normalizeParameters(p)
    expect(JSON.stringify(p)).toBe(antes)
  })

  it('converte rules[] em conditions[] na leitura', () => {
    const p = normalizeParameters({ mode: 'ANY', rules: [{ attr: 'contact.labels', op: 'equals', value: 'vip' }] })
    expect(p.mode).toBe('ANY')
    expect(p.conditions).toHaveLength(1)
    expect(p.conditions[0].subject).toBe('label')
  })

  it('é idempotente sobre a forma nova', () => {
    const um = normalizeParameters({ mode: 'ALL', conditions: [{ id: 'a', subject: 'label', op: 'is', value: 'x' }] })
    const dois = normalizeParameters(um)
    expect(dois.conditions).toEqual(um.conditions)
  })

  it('condição sem id ganha um, para a lista do Vue ter chave estável', () => {
    const p = normalizeParameters({ conditions: [{ subject: 'label', op: 'is', value: 'x' }] })
    expect(p.conditions[0].id).toBeTruthy()
  })

  it('bloco vazio e parâmetros nulos não quebram', () => {
    expect(normalizeParameters(null).conditions).toEqual([])
    expect(normalizeParameters({}).conditions).toEqual([])
    expect(normalizeParameters({}).mode).toBe('ALL')
  })

  it('mode inválido cai em ALL — nunca fica indefinido', () => {
    expect(normalizeParameters({ mode: 'TALVEZ' }).mode).toBe('ALL')
  })
})

describe('withConditions', () => {
  it('APAGA rules — espelho aqui rotearia tráfego pelo ramo errado, em silêncio', () => {
    const p = withConditions({ mode: 'ALL', rules: [{ attr: 'x', op: 'equals', value: 'y' }] }, [])
    expect('rules' in p).toBe(false)
    expect(p.conditions).toEqual([])
  })

  it('preserva as outras chaves dos parâmetros', () => {
    const p = withConditions({ mode: 'ANY', qualquer: 1 }, [{ id: 'a' }])
    expect(p.mode).toBe('ANY')
    expect(p.qualquer).toBe(1)
  })
})

describe('operações da lista', () => {
  it('adiciona no fim e devolve o id de quem nasceu', () => {
    const { conditions, id } = addCondition([{ id: 'a' }], { subject: 'label' })
    expect(conditions).toHaveLength(2)
    expect(conditions[1].id).toBe(id)
  })

  it('atualiza só a condição alvo', () => {
    const l = updateCondition([{ id: 'a', value: 1 }, { id: 'b', value: 2 }], 'b', { value: 9 })
    expect(l[0].value).toBe(1)
    expect(l[1].value).toBe(9)
  })

  it('remove por id', () => {
    expect(removeCondition([{ id: 'a' }, { id: 'b' }], 'a').map((c) => c.id)).toEqual(['b'])
  })
})

describe('trocaOperador', () => {
  it('preserva o valor quando a aridade não muda — trocar É por Contém não apaga o que foi digitado', () => {
    const c = { subject: 'field', field_type: 'text', op: 'is', value: 'Ana' }
    expect(trocaOperador(c, 'contains')).toMatchObject({ op: 'contains', value: 'Ana' })
  })

  it('limpa o valor ao ir para aridade 0, senão fica lixo gravado', () => {
    const c = { subject: 'field', field_type: 'text', op: 'is', value: 'Ana' }
    expect('value' in trocaOperador(c, 'has_any_value')).toBe(false)
  })

  it('limpa ao mudar de um valor para dois', () => {
    const c = { subject: 'time', op: 'after', value: '08:00' }
    expect('value' in trocaOperador(c, 'between')).toBe(false)
  })

  it('operador que não pertence ao sujeito é ignorado', () => {
    const c = { subject: 'label', op: 'is', value: 'x' }
    expect(trocaOperador(c, 'greater_than')).toBe(c)
  })
})

describe('rótulos derivados do modo', () => {
  it('Lógica E e Lógica Ou são DERIVADOS, nunca gravados', () => {
    expect(rotuloLogica('ALL')).toBe('E')
    expect(rotuloLogica('ANY')).toBe('Ou')
  })

  it('as frases das saídas mudam com o modo', () => {
    expect(fraseVerdadeiro('ANY')).toBe('Corresponde a UMA das opções')
    expect(fraseVerdadeiro('ALL')).toBe('Corresponde a TODAS as condições')
    expect(fraseFalso('ANY')).toBe('Não corresponde a UMA das opções')
    expect(fraseFalso('ALL')).toBe('Não corresponde a TODAS as condições')
  })

  it('as saídas falam de CORRESPONDÊNCIA, nunca de verdadeiro/falso', () => {
    // Vocabulário de runtime numa tela de construção foi o que fez a homologação
    // de 31/07 parar: aqui se monta uma máscara, e máscara não tem valor lógico
    // até o executor perguntá-la a um contato (principio-mascara.md, no vault).
    for (const mode of ['ALL', 'ANY']) {
      for (const frase of [fraseVerdadeiro(mode), fraseFalso(mode)]) {
        expect(frase.toLowerCase()).not.toMatch(/verdadeir|fals/)
        expect(frase).toMatch(/orresponde/)
      }
    }
  })

  it('a saída de baixo é a NEGAÇÃO literal da de cima, não uma frase própria', () => {
    // "Não corresponde a NENHUMA condição" (o texto antigo do modo ANY) diz outra
    // coisa: a regra é declarada só para a correspondência, e o complemento dela
    // nunca é reescrito à mão.
    for (const mode of ['ALL', 'ANY']) {
      expect(fraseFalso(mode).toLowerCase()).toBe('não ' + fraseVerdadeiro(mode).toLowerCase())
    }
  })
})

describe('comparação de texto — caixa e acento', () => {
  const texto = { subject: 'field', field: 'x', field_type: 'text', op: 'contains' }

  it('a caixa cai SEMPRE, com exact ou sem', () => {
    expect(normalizaTexto('Preço', false)).toBe(normalizaTexto('preço', false))
    expect(normalizaTexto('Preço', true)).toBe(normalizaTexto('preço', true))
  })

  it('sem exact o acento também cai — é o padrão do projeto', () => {
    const alvo = normalizaTexto('anuncio', false)
    for (const grafia of ['anúncio', 'anùncio', 'ANÚNCIO', ' Anúncio ']) {
      expect(normalizaTexto(grafia, false)).toBe(alvo)
    }
    expect(normalizaTexto('não', false)).toBe(normalizaTexto('nao', false))
  })

  it('com exact o acento passa a importar', () => {
    expect(normalizaTexto('anúncio', true)).not.toBe(normalizaTexto('anuncio', true))
  })

  it('cedilha e trema são diacríticos como os outros', () => {
    expect(normalizaTexto('serviço', false)).toBe('servico')
    expect(normalizaTexto('Müller', false)).toBe('muller')
  })

  it('nulo e indefinido não explodem — viram vazio', () => {
    expect(normalizaTexto(null, false)).toBe('')
    expect(normalizaTexto(undefined, true)).toBe('')
  })

  it('só texto digitado aceita o check Idêntico', () => {
    expect(aceitaExact(texto)).toBe(true)
    expect(aceitaExact({ ...texto, op: 'ends_with' })).toBe(true)
    // aridade 0 não compara grafia nenhuma
    expect(aceitaExact({ ...texto, op: 'has_any_value' })).toBe(false)
    expect(aceitaExact({ ...texto, op: 'is_empty' })).toBe(false)
    // data e número comparam valor tipado, não escrita
    expect(aceitaExact({ ...texto, field_type: 'date', op: 'on' })).toBe(false)
    expect(aceitaExact({ ...texto, field_type: 'number', op: 'is' })).toBe(false)
    // etiqueta vem da lista viva do cwmkt: não há grafia para a pessoa decidir
    expect(aceitaExact({ subject: 'label', op: 'is' })).toBe(false)
  })

  it('trocar para um operador sem grafia APAGA o exact', () => {
    const c = { ...texto, value: 'anúncio', exact: true }
    expect(trocaOperador(c, 'is_empty').exact).toBeUndefined()
    // e preserva onde ainda faz sentido
    expect(trocaOperador(c, 'starts_with').exact).toBe(true)
  })
})

describe('operadores novos de 31/07', () => {
  it('texto ganhou Termina Com', () => {
    expect(OPERADORES['field:text'].map((o) => o.id)).toContain('ends_with')
    expect(labelOperador('ends_with')).toBe('Termina Com')
  })

  it('os QUATRO operadores de presença existem nos três tipos de campo', () => {
    // existir e ter conteúdo são perguntas diferentes: a chave pode estar
    // ausente da ficha, presente em branco, ou presente com conteúdo
    for (const k of ['field:text', 'field:date', 'field:number']) {
      const ids = OPERADORES[k].map((o) => o.id)
      for (const p of ['has_any_value', 'is_empty', 'exists', 'not_exists']) {
        expect(ids).toContain(p)
      }
    }
  })

  it('os quatro de presença não pedem valor e têm o mesmo rótulo em todo tipo', () => {
    expect(labelOperador('exists')).toBe('Existe')
    expect(labelOperador('not_exists')).toBe('Não existe')
    expect(labelOperador('is_empty')).toBe('Vazio')
    for (const k of ['field:text', 'field:date', 'field:number']) {
      for (const o of OPERADORES[k]) {
        if (['has_any_value', 'is_empty', 'exists', 'not_exists'].includes(o.id)) {
          expect(o.aridade).toBe(0)
          expect(o.editor).toBe('none')
        }
      }
    }
  })

  it('o `exists` LEGADO continua virando has_any_value, não o homônimo novo', () => {
    // no formato antigo `exists` queria dizer "tem conteúdo"; traduzir para o
    // operador novo de mesmo nome mudaria o sentido de regra já publicada
    expect(migraRegra({ attr: 'contact.name', op: 'exists' }).op).toBe('has_any_value')
  })

  it('Vazio não pede valor, então nunca está incompleta', () => {
    const c = { subject: 'field', field: 'x', field_type: 'text', op: 'is_empty' }
    expect(operadorSpec(c).aridade).toBe(0)
    expect(condicaoIncompleta(c)).toBe(false)
  })
})
