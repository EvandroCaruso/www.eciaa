/**
 * Cliente da API do mini-app.
 *
 * O shell HTML que o n8n devolve (já autenticado pelo Hub) injeta:
 *
 *   window.__MSGFLOW_CTX__ = {
 *     apiUrl:   'https://n1.eciaa.com.br/webhook/eciaa-hub-app/msgflows',
 *     hubToken: '<level_token>',   // prova de origem, vai no header X-Hub-Token
 *     jwt:      '<token do Hub>',  // carrega o clientId — o backend NUNCA lê client_id da query
 *     clientId: '0',               // só para exibir na tela
 *     crud:     { view:true, create:true, update:true, delete:true },
 *     userName: 'Evandro'
 *   }
 *
 * Sem esse objeto (ex.: `npm run dev`), caímos num backend falso em memória —
 * o que permite construir e verificar o editor antes do workflow n8n existir.
 */

import { createEmptyGraph } from '../core/graph.js'
import { isFlowNameTaken, uniqueFlowName } from '../core/names.js'

export function getContext() {
  const ctx = typeof window !== 'undefined' ? window.__MSGFLOW_CTX__ : null
  if (ctx && ctx.apiUrl) return { ...ctx, mock: false }
  return {
    apiUrl: null,
    hubToken: '',
    jwt: '',
    clientId: '0',
    crud: { view: true, create: true, update: true, delete: true },
    userName: 'dev',
    mock: true
  }
}

const ctx = getContext()

export const isMock = ctx.mock
export const crud = ctx.crud || { view: true, create: false, update: false, delete: false }
export const clientId = ctx.clientId

/**
 * Toda chamada é POST com o corpo em JSON. O `action` roteia no Switch do n8n.
 * O client_id vai no JWT, não no corpo — mandar na query foi o IDOR do v0.
 */
export async function call(action, payload = {}) {
  if (ctx.mock) {
    // O backend falso tem de recusar do MESMO jeito que o real, senão o erro só
    // aparece em produção — foi o caso do asset_delete de anexo em uso.
    const fake = await mockCall(action, payload)
    if (fake && fake.ok === false) throw new Error(fake.error || `A operação "${action}" foi recusada.`)
    return fake
  }

  const res = await fetch(ctx.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Hub-Token': ctx.hubToken
    },
    body: JSON.stringify({ action, token: ctx.jwt, ...payload })
  })

  if (!res.ok) throw new Error(`Falha na chamada "${action}" (HTTP ${res.status})`)

  const data = await res.json()
  if (data && data.ok === false) throw new Error(data.error || `A operação "${action}" foi recusada.`)
  return data
}

// ---------------------------------------------------------------------------
// Campos do contato e anexos
// ---------------------------------------------------------------------------

/**
 * Catálogo de variáveis. O editor NÃO guarda cópia da lista de campos de sistema:
 * ela é montada no backend, junto da consulta ao cwmkt daquele cliente, para que
 * exista uma definição só — a mesma que o executor terá de resolver no envio.
 *
 * Memoizado: a paleta abre várias vezes por sessão e a lista não muda no meio.
 */
let camposPromise = null

export function fetchContactFields() {
  if (!camposPromise) {
    camposPromise = call('contact_fields')
      .then((r) => ({
        system: r.system || [],
        client: r.client || [],
        client_error: r.client_error || null
      }))
      .catch((e) => {
        camposPromise = null // erro não vira cache: a próxima tentativa refaz
        return { system: [], client: [], client_error: e.message }
      })
  }
  return camposPromise
}

/** Lê um File do <input type=file> como base64 puro (sem o prefixo data:). */
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onerror = () => reject(new Error('Não foi possível ler o arquivo.'))
    fr.onload = () => {
      const s = String(fr.result || '')
      resolve(s.slice(s.indexOf(',') + 1))
    }
    fr.readAsDataURL(file)
  })
}

export const MAX_ASSET_BYTES = 8 * 1024 * 1024

export async function uploadAsset(file, kind) {
  // O mesmo teto do backend, conferido aqui só para o erro chegar antes de subir
  // 8 MB pela rede. Quem manda é o backend — este é conveniência.
  if (file.size > MAX_ASSET_BYTES) {
    throw new Error(`Arquivo de ${(file.size / 1048576).toFixed(1)} MB. O limite é 8 MB.`)
  }
  const content_b64 = await fileToBase64(file)
  const r = await call('asset_upload', {
    filename: file.name,
    mime: file.type || 'application/octet-stream',
    kind,
    content_b64
  })
  return r.asset
}

export const listAssets = () => call('asset_list').then((r) => r.assets || [])
export const getAsset = (asset_id) => call('asset_get', { asset_id }).then((r) => r.asset)
export const deleteAsset = (asset_id) => call('asset_delete', { asset_id })

// ---------------------------------------------------------------------------
// Backend falso — só para desenvolvimento local
// ---------------------------------------------------------------------------

const MOCK_TYPES = [
  {
    node_type: 'eciaa.start', type_version: 1, label: 'Início', category: 'trigger',
    icon: '🚀', color: '#10b981',
    outputs: [{ key: 'main', label: '' }],
    params_schema: { fields: [], singleton: true, deletable: false, help: 'Todo fluxo começa aqui.' },
    sort_order: 0
  },
  {
    node_type: 'eciaa.content', type_version: 2, label: 'Conteúdo', category: 'message',
    icon: '💬', color: '#6366f1',
    outputs: [{ key: 'main', label: '' }],
    params_schema: {
      help: 'Monte a mensagem em partes: texto, pausa, mídia. Cada parte vira uma bolha no WhatsApp, na ordem em que estiver aqui.',
      fields: [
        { key: 'blocks', type: 'blocks', label: 'Mensagem', default: [], sub_types: [
          { kind: 'text', label: 'Texto', icon: '🔤', fields: [
            { key: 'text', type: 'rich-text', label: 'Texto', rows: 6, required: true, vars: true,
              placeholder: 'Olá [primeiro-nome]! Tudo bem?' }
          ] },
          { kind: 'delay', label: 'Atraso', icon: '⏱', fields: [
            { key: 'seconds', type: 'range', label: 'Digitando por', min: 0, max: 6, step: 0.5, default: 3, unit: 's' },
            { key: 'typing', type: 'switch', label: 'Mostrar “digitando…”', default: true }
          ] },
          { kind: 'image', label: 'Imagem', icon: '🖼', fields: [
            { key: 'asset_id', type: 'asset', label: 'Imagem', required: true, accept: 'image/jpeg,image/png,image/webp' },
            { key: 'caption', type: 'rich-text', label: 'Legenda', rows: 2, vars: true }
          ] },
          { kind: 'video', label: 'Vídeo', icon: '🎬', fields: [
            { key: 'asset_id', type: 'asset', label: 'Vídeo', required: true, accept: 'video/mp4' },
            { key: 'caption', type: 'rich-text', label: 'Legenda', rows: 2, vars: true }
          ] },
          { kind: 'audio', label: 'Áudio', icon: '🔊', fields: [
            { key: 'asset_id', type: 'asset', label: 'Áudio', required: true, accept: 'audio/ogg,audio/mpeg' }
          ] },
          { kind: 'file', label: 'Arquivo', icon: '📄', fields: [
            { key: 'asset_id', type: 'asset', label: 'Arquivo', required: true, accept: '*/*' }
          ] },
          { kind: 'contact', label: 'Contato', icon: '👤', fields: [
            { key: 'display_name', type: 'text', label: 'Nome', required: true },
            { key: 'organization', type: 'text', label: 'Organização' },
            { key: 'phone', type: 'phone', label: 'Telefone', default_country: 'BR' },
            { key: 'use_connected_number', type: 'switch', label: 'Utilizar o número de WhatsApp conectado', default: false }
          ] }
        ] }
      ]
    },
    sort_order: 1
  },
  {
    node_type: 'eciaa.condition', type_version: 1, label: 'Condição', category: 'logic',
    icon: '🔀', color: '#f59e0b',
    outputs: [{ key: 'true', label: 'Verdadeiro' }, { key: 'false', label: 'Falso' }],
    params_schema: {
      fields: [
        { key: 'mode', type: 'radio', label: 'O contato precisa atender', default: 'ALL',
          options: [{ value: 'ALL', label: 'todas as regras' }, { value: 'ANY', label: 'qualquer uma das regras' }] },
        { key: 'rules', type: 'rule-list', label: 'Regras', default: [],
          item: {
            attr: { type: 'combo', label: 'Atributo', default: 'contact.labels',
              options: ['contact.name', 'contact.phone', 'contact.email', 'contact.labels', 'contact.custom_attributes.', 'vars.'] },
            op: { type: 'select', label: 'Operador', default: 'contains',
              options: [{ value: 'equals', label: 'é igual a' }, { value: 'contains', label: 'contém' }, { value: 'exists', label: 'existe' }] },
            value: { type: 'text', label: 'Valor', hidden_when: { op: 'exists' } }
          } }
      ]
    },
    sort_order: 2
  }
]

const mockDb = {
  seq: 3,
  assets: [],
  folders: [
    { id: 1, parent_id: null, folder_name: 'Boas-vindas', sort_order: 0 },
    { id: 2, parent_id: null, folder_name: 'Cobrança', sort_order: 1 },
    // subpasta de propósito: é o caso que o breadcrumb antigo não mostrava
    { id: 3, parent_id: 1, folder_name: 'Sub-Pasta', sort_order: 0 }
  ],
  flows: [
    {
      id: 1, folder_id: 1, flow_name: 'Boas-vindas padrão', flow_slug: 'boas-vindas-padrao',
      description: 'Primeiro contato', version: 1, is_active: true,
      graph: createEmptyGraph(), graph_draft: null,
      updated_at: new Date().toISOString()
    },
    {
      id: 2, folder_id: null, flow_name: 'Fluxo solto', flow_slug: 'fluxo-solto',
      description: '', version: 0, is_active: true,
      graph: null, graph_draft: null,
      updated_at: new Date().toISOString()
    }
  ]
}

function slugify(name) {
  return String(name)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    .slice(0, 140) || 'fluxo'
}

async function mockCall(action, p) {
  await new Promise((r) => setTimeout(r, 80))
  const flows = mockDb.flows
  const byId = (id) => flows.find((f) => f.id === Number(id))

  switch (action) {
    case 'node_types':
      return { ok: true, node_types: MOCK_TYPES }

    case 'list':
      return {
        ok: true,
        folders: mockDb.folders,
        flows: flows.filter((f) => f.is_active).map((f) => ({
          id: f.id, folder_id: f.folder_id, flow_name: f.flow_name, flow_slug: f.flow_slug,
          description: f.description, version: f.version,
          // publicado é sobre o GRAFO estar no ar, não sobre já ter tido versão:
          // despublicar zera o graph e preserva o histórico (version segue > 0)
          is_published: f.graph !== null,
          has_draft: f.graph_draft !== null, updated_at: f.updated_at
        }))
      }

    case 'get': {
      const f = byId(p.flow_id)
      if (!f) throw new Error('Fluxo não encontrado.')
      return { ok: true, flow: f }
    }

    case 'create': {
      // espelha a regra do backend: nome é único no cliente inteiro
      if (isFlowNameTaken(p.flow_name, flows.filter((f) => f.is_active))) {
        throw new Error('Já existe um fluxo com esse nome.')
      }
      const id = ++mockDb.seq
      const f = {
        id, folder_id: p.folder_id ?? null, flow_name: p.flow_name,
        flow_slug: slugify(p.flow_name), description: p.description || '',
        version: 0, is_active: true, graph: null, graph_draft: p.graph || null,
        updated_at: new Date().toISOString()
      }
      flows.push(f)
      return { ok: true, flow: f }
    }

    case 'save': {
      const f = byId(p.flow_id)
      f.graph_draft = p.graph
      f.updated_at = new Date().toISOString()
      return { ok: true, updated_at: f.updated_at }
    }

    case 'publish': {
      const f = byId(p.flow_id)
      f.graph = p.graph
      f.graph_draft = null
      f.version += 1
      f.updated_at = new Date().toISOString()
      return { ok: true, version: f.version }
    }

    case 'unpublish': {
      const f = byId(p.flow_id)
      if (f.graph === null) throw new Error('Este fluxo não está publicado.')
      // o que estava no ar vira rascunho: despublicar não pode perder trabalho
      f.graph_draft = f.graph_draft || f.graph
      f.graph = null
      f.updated_at = new Date().toISOString()
      return { ok: true }
    }

    case 'rename': {
      const f = byId(p.flow_id)
      if (isFlowNameTaken(p.flow_name, flows.filter((x) => x.is_active), f.id)) {
        throw new Error('Já existe outro fluxo com esse nome.')
      }
      f.flow_name = p.flow_name
      if (p.description !== undefined) f.description = p.description
      return { ok: true }
    }

    case 'clone': {
      const src = byId(p.flow_id)
      const id = ++mockDb.seq
      // duplicar nunca falha por nome ocupado: o usuário não escolheu nome
      const nome = uniqueFlowName(p.flow_name || src.flow_name, flows.filter((f) => f.is_active))
      const f = {
        ...JSON.parse(JSON.stringify(src)), id,
        flow_name: nome, flow_slug: slugify(`${nome}-${id}`),
        version: 0, graph_draft: src.graph || src.graph_draft, graph: null,
        updated_at: new Date().toISOString()
      }
      flows.push(f)
      return { ok: true, flow: f }
    }

    case 'delete': {
      byId(p.flow_id).is_active = false
      return { ok: true }
    }

    case 'move': {
      byId(p.flow_id).folder_id = p.folder_id ?? null
      return { ok: true }
    }

    case 'folder_create': {
      const id = ++mockDb.seq
      mockDb.folders.push({ id, parent_id: p.parent_id ?? null, folder_name: p.folder_name, sort_order: 99 })
      return { ok: true, folder_id: id }
    }

    case 'folder_rename': {
      mockDb.folders.find((f) => f.id === Number(p.folder_id)).folder_name = p.folder_name
      return { ok: true }
    }

    case 'folder_delete': {
      mockDb.folders = mockDb.folders.filter((f) => f.id !== Number(p.folder_id))
      flows.forEach((f) => { if (f.folder_id === Number(p.folder_id)) f.folder_id = null })
      return { ok: true }
    }

    case 'contact_fields':
      return {
        ok: true,
        system: [
          { key: 'nome-completo', label: 'Nome completo' },
          { key: 'primeiro-nome', label: 'Primeiro nome' },
          { key: 'sobrenome', label: 'Sobrenome' },
          { key: 'telefone', label: 'Telefone' },
          { key: 'ddd', label: 'DDD' },
          { key: 'email', label: 'E-mail' },
          { key: 'identificador', label: 'Identificador externo' },
          { key: 'cidade', label: 'Cidade' },
          { key: 'pais', label: 'País' }
        ],
        client: [
          { key: 'EVO_Contrato', label: 'Contrato EVO' },
          { key: 'nome-indicador', label: 'Nome do indicador' }
        ],
        client_error: null
      }

    case 'asset_upload': {
      const id = ++mockDb.seq
      const a = {
        id, filename: p.filename, mime: p.mime,
        size_bytes: Math.floor((p.content_b64 || '').length * 0.75),
        created_at: new Date().toISOString(), content_b64: p.content_b64
      }
      mockDb.assets.push(a)
      return { ok: true, reused: false, asset: a }
    }

    case 'asset_list':
      return { ok: true, assets: mockDb.assets.map(({ content_b64, ...a }) => a) }

    case 'asset_get':
      return { ok: true, asset: mockDb.assets.find((a) => a.id === Number(p.asset_id)) }

    case 'asset_delete': {
      const emUso = flows.some((f) => JSON.stringify(f.graph_draft || f.graph || {}).includes(`"asset_id":${p.asset_id}`))
      if (emUso) return { ok: false, error: 'Este arquivo está em uso e não pode ser excluído.', in_use_by: ['(mock)'] }
      mockDb.assets = mockDb.assets.filter((a) => a.id !== Number(p.asset_id))
      return { ok: true }
    }

    default:
      throw new Error(`Ação desconhecida: ${action}`)
  }
}
