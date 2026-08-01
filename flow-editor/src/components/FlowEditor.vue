<script setup>
/**
 * Editor de canvas.
 *
 * O `graph` (formato n8n) é a fonte da verdade. As estruturas do Vue Flow são
 * derivadas dele e re-sincronizadas depois de toda operação estrutural. Só o
 * arrasto de posição escreve direto no graph, para não recriar o array no meio
 * da interação e cortar o movimento.
 */
import { ref, computed, nextTick, onMounted, onBeforeUnmount, markRaw, provide } from 'vue'
import { VueFlow, useVueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls, ControlButton } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'

import MsgFlowNode from './MsgFlowNode.vue'
import BlockPicker from './BlockPicker.vue'
import ContextMenu from './ContextMenu.vue'
import PropertiesPanel from './PropertiesPanel.vue'
import ModalDialog from './ModalDialog.vue'

import { call, crud } from '../lib/api.js'
import { isFlowNameTaken } from '../core/names.js'
import { organizarGrafo } from '../core/layout.js'
import { writeClip, readClip, hasClip } from '../lib/storage.js'
import {
  createEmptyGraph, addNode, deleteNode, renameNode, connect, disconnect,
  copyNodes, pasteNodes, toVueFlow, fromVueFlow, validate, findNode, outputIndexFrom
} from '../core/graph.js'

const props = defineProps({
  flowId: { type: [Number, String], required: true },
  // árvore de pastas, para montar o caminho do fluxo no cabeçalho
  folders: { type: Array, default: () => [] },
  // demais fluxos do cliente: o rename inline precisa deles para aplicar a
  // mesma regra de nome único que a lista aplica
  flows: { type: Array, default: () => [] }
})
const emit = defineEmits(['back', 'toast'])

const nodeTypesComponents = { msgflow: markRaw(MsgFlowNode) }

// Alguns hooks não existem em toda versão do Vue Flow e desestruturar um nome
// inexistente derruba o componente inteiro no setup. Por isso pegamos o objeto
// e só usamos o que de fato veio.
const vf = useVueFlow()
const { onConnect, onNodeDragStop, onNodeClick, onPaneClick, screenToFlowCoordinate, fitView } = vf

const loading = ref(true)
const saving = ref(false)
// folder_id undefined = o backend não informou; null = raiz
// is_published olha o GRAFO no ar, não a versão: despublicar preserva o histórico
const flowMeta = ref({ flow_name: '', version: 0, is_published: false, has_draft: false, folder_id: undefined })

// rename inline no cabeçalho, sem sair da tela de edição
const editandoNome = ref(false)
const nomeDraft = ref('')
const nomeErro = ref('')
const nomeInput = ref(null)
const graph = ref(createEmptyGraph())
const typesList = ref([])
const nodes = ref([])
const edges = ref([])
const selectedName = ref(null)
const lastSaved = ref('')
const dialog = ref({ open: false, mode: null, title: '', message: '', confirmLabel: '', danger: false })
const pickerAberto = ref(false)
const pendenteExclusao = ref({ nomes: [], arestas: [] })
const ctx = ref(null) // { x, y, titulo, itens }

const typesByKey = computed(() => Object.fromEntries(typesList.value.map((t) => [t.node_type, t])))
const readonly = computed(() => !crud.update)
const dirty = computed(() => JSON.stringify(graph.value) !== lastSaved.value)
const tiposNoFluxo = computed(() => graph.value.nodes.map((n) => n.type))

const selectedNode = computed(() => {
  if (!selectedName.value) return null
  const n = findNode(graph.value, selectedName.value)
  if (!n) return null
  return { name: n.name, nodeType: n.type, parameters: n.parameters, spec: typesByKey.value[n.type] || null }
})

const report = computed(() => validate(graph.value, typesByKey.value))

/**
 * `pendente` = existe algo além do que está no ar. Dois jeitos de acontecer:
 * o que está na tela não foi salvo (`dirty`), ou existe rascunho salvo que não
 * foi publicado (`has_draft`).
 *
 * ⚠️ Esta é a MESMA definição que o ponto 🟢/🟡 usa na lista, e tem de continuar
 * sendo. Na primeira versão o ponto olhava só `dirty` aqui e só `has_draft` lá —
 * resultado: o mesmo fluxo aparecia verde no editor e amarelo na lista, e o
 * editor se contradizia (botão dizendo "Publicar alterações" ao lado de um ponto
 * verde). Se mudar um lado, mude o outro.
 */
const pendente = computed(() => dirty.value || flowMeta.value.has_draft)

/**
 * Um único botão no slot principal, com três estados (decisão do Evandro, 29/07).
 * O slot mostra a ação mais importante do momento:
 *
 *   não publicado ................ Publicar
 *   publicado, com pendência ..... Publicar alterações
 *   publicado e em dia ........... Despublicar
 *
 * Despublicar um fluxo COM pendência continua possível pelo menu ⋮ da lista.
 */

const acaoPublicacao = computed(() => {
  if (!flowMeta.value.is_published) return { modo: 'publicar', label: 'Publicar', primary: true }
  if (pendente.value) return { modo: 'publicar', label: 'Publicar alterações', primary: true }
  return { modo: 'despublicar', label: 'Despublicar', primary: false }
})

/**
 * Caminho raiz→pasta do fluxo, para o cabeçalho. Guard contra ciclo no banco.
 * Vazio quando o fluxo está na raiz — ou quando o backend não mandou folder_id,
 * caso em que o cabeçalho mostra só "Todos os fluxos" e o Voltar cai na pasta
 * onde a lista já estava (ninguém é levado para o lugar errado).
 */
const folderPath = computed(() => {
  const byId = Object.fromEntries(props.folders.map((f) => [f.id, f]))
  const out = []
  let cur = flowMeta.value.folder_id == null ? null : byId[flowMeta.value.folder_id]
  let guard = 0
  while (cur && guard < 50) {
    out.unshift(cur)
    cur = cur.parent_id == null ? null : byId[cur.parent_id]
    guard += 1
  }
  return out
})

function specDe(nome) {
  const n = findNode(graph.value, nome)
  return n ? typesByKey.value[n.type] : null
}
function podeExcluir(nome) {
  return specDe(nome)?.params_schema?.deletable !== false
}

/**
 * Recria as estruturas do Vue Flow a partir do graph.
 * Preserva a seleção: sem isso, renomear ou colar desmarca tudo e um Ctrl+C
 * logo em seguida não copiaria nada.
 */
function syncFromGraph(keepSelected) {
  const selecionados = new Set(keepSelected)
  if (!keepSelected) {
    for (const n of nodes.value) if (n.selected) selecionados.add(n.id)
    if (selectedName.value) selecionados.add(selectedName.value)
  }
  const { nodes: vn, edges: ve } = toVueFlow(graph.value, typesByKey.value)
  nodes.value = vn.map((n) => (selecionados.has(n.id) ? { ...n, selected: true } : n))
  edges.value = ve
}

async function load() {
  loading.value = true
  try {
    const [typesRes, flowRes] = await Promise.all([
      call('node_types'),
      call('get', { flow_id: props.flowId })
    ])
    typesList.value = (typesRes.node_types || []).filter((t) => t.is_enabled !== false)

    const f = flowRes.flow
    flowMeta.value = {
      flow_name: f.flow_name,
      version: f.version,
      is_published: !!f.graph,
      has_draft: !!f.graph_draft,
      folder_id: f.folder_id === undefined ? undefined : (f.folder_id ?? null)
    }
    graph.value = f.graph_draft || f.graph || createEmptyGraph()
    lastSaved.value = JSON.stringify(graph.value)

    syncFromGraph()
    // maxZoom: um fluxo recém-criado tem só o nó de Início, e sem esse teto o
    // enquadramento vai ao zoom máximo e o bloco aparece gigante.
    setTimeout(() => fitView({ padding: 0.3, maxZoom: 1 }), 60)
  } catch (e) {
    emit('toast', { type: 'error', text: e.message })
  } finally {
    loading.value = false
  }
}

// ---------- edição do grafo ----------

/**
 * Histórico para o Ctrl+Z.
 *
 * Guarda o grafo inteiro serializado antes de cada mudança. O grafo é JSON puro e
 * pequeno (um fluxo grande tem dezenas de nós), então snapshot inteiro é mais
 * barato de acertar do que diff — e é o que faz o desfazer valer TAMBÉM para
 * sub-bloco, que vive dentro de `parameters` e não tem operação própria.
 */
const undoStack = ref([])
const TETO_UNDO = 50

function pushUndo() {
  if (readonly.value) return
  undoStack.value.push(JSON.stringify(graph.value))
  if (undoStack.value.length > TETO_UNDO) undoStack.value.shift()
}

function desfazer() {
  if (readonly.value || !undoStack.value.length) {
    emit('toast', { type: 'error', text: 'Não há nada para desfazer.' })
    return
  }
  graph.value = JSON.parse(undoStack.value.pop())
  if (!findNode(graph.value, selectedName.value)) selectedName.value = null
  syncFromGraph(selectedName.value ? [selectedName.value] : [])
  emit('toast', { type: 'ok', text: 'Desfeito.' })
}

function apply(fn, keepSelected) {
  if (readonly.value) return false
  const antes = JSON.stringify(graph.value)
  try {
    graph.value = fn(graph.value)
    // só entra no histórico o que de fato mudou — senão o Ctrl+Z gasta passos à toa
    if (JSON.stringify(graph.value) !== antes) undoStack.value.push(antes)
    if (undoStack.value.length > TETO_UNDO) undoStack.value.shift()
    syncFromGraph(keepSelected)
    return true
  } catch (e) {
    emit('toast', { type: 'error', text: e.message })
    return false
  }
}

onConnect((params) => {
  const outputIndex = outputIndexFrom(params.sourceHandle)
  apply((g) => connect(g, params.source, outputIndex, params.target))
})

onNodeDragStop(({ nodes: dragged }) => {
  if (readonly.value) return
  let changed = false
  for (const vn of dragged) {
    const n = findNode(graph.value, vn.id)
    if (!n) continue
    const x = Math.round(vn.position.x)
    const y = Math.round(vn.position.y)
    if (n.position[0] !== x || n.position[1] !== y) {
      n.position = [x, y]
      changed = true
    }
  }
  if (changed) graph.value = { ...graph.value }
})

onNodeClick(({ node }) => { selectedName.value = node.id; fecharPopups() })
onPaneClick(() => { selectedName.value = null; fecharPopups() })

function fecharPopups() {
  pickerAberto.value = false
  ctx.value = null
}

/**
 * Fecha o seletor e o menu ao clicar fora. Feito com listener no documento, e
 * não com um overlay por cima do canvas: o overlay engolia o clique e obrigava
 * o usuário a clicar duas vezes para selecionar um bloco.
 */
function onDocumentClick(event) {
  if (event.target.closest('.mf-picker, .mf-add-btn, .mf-ctx')) return
  fecharPopups()
}

/** Posição livre no canvas: evita empilhar blocos exatamente uns sobre os outros. */
function posicaoLivre(x, y) {
  let px = x
  let py = y
  const ocupada = () => graph.value.nodes.some((n) => Math.abs(n.position[0] - px) < 60 && Math.abs(n.position[1] - py) < 60)
  let voltas = 0
  while (ocupada() && voltas < 40) { px += 40; py += 40; voltas++ }
  return [Math.round(px), Math.round(py)]
}

function parametrosPadrao(spec) {
  const d = {}
  for (const f of spec?.params_schema?.fields || []) {
    if (f.default !== undefined) d[f.key] = f.default
  }
  return d
}

/**
 * Insere um bloco. Se houver exatamente um bloco selecionado, o novo nasce à
 * direita dele e já se conecta na primeira saída livre — é o comportamento do
 * n8n e poupa o arrasto manual da conexão.
 */
function inserirBloco(nodeType) {
  pickerAberto.value = false
  const spec = typesByKey.value[nodeType]
  if (!spec) return

  if (spec.params_schema?.singleton && tiposNoFluxo.value.includes(nodeType)) {
    emit('toast', { type: 'error', text: `O fluxo só pode ter um bloco "${spec.label}".` })
    return
  }

  const selecionados = nodes.value.filter((n) => n.selected).map((n) => n.id)
  const ancora = selecionados.length === 1 ? findNode(graph.value, selecionados[0]) : null

  let pos
  if (ancora) {
    pos = posicaoLivre(ancora.position[0] + 300, ancora.position[1])
  } else {
    const el = document.querySelector('.mf-canvas')
    const r = el.getBoundingClientRect()
    const c = screenToFlowCoordinate({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
    pos = posicaoLivre(Math.round(c.x - 115), Math.round(c.y - 50))
  }

  const { graph: g1, node } = addNode(graph.value, {
    type: nodeType,
    name: spec.label || nodeType,
    typeVersion: spec.type_version || 1,
    position: pos,
    parameters: parametrosPadrao(spec)
  })

  let g2 = g1
  if (ancora) {
    const specAncora = typesByKey.value[ancora.type]
    const totalSaidas = specAncora?.outputs?.length || 1
    const jaLigadas = (g1.connections[ancora.name] || {}).main || []
    let livre = -1
    for (let i = 0; i < totalSaidas; i++) {
      if (!jaLigadas[i] || jaLigadas[i].length === 0) { livre = i; break }
    }
    if (livre >= 0) g2 = connect(g1, ancora.name, livre, node.name)
  }

  pushUndo()
  graph.value = g2
  selectedName.value = node.name
  syncFromGraph([node.name])
}

function onDrop(event) {
  event.preventDefault()
  if (readonly.value) return
  const nodeType = event.dataTransfer.getData('application/msgflow-type')
  if (!nodeType) return

  const spec = typesByKey.value[nodeType]
  if (spec?.params_schema?.singleton && tiposNoFluxo.value.includes(nodeType)) {
    emit('toast', { type: 'error', text: `O fluxo só pode ter um bloco "${spec.label}".` })
    return
  }

  const p = screenToFlowCoordinate({ x: event.clientX, y: event.clientY })
  const [x, y] = posicaoLivre(Math.round(p.x - 115), Math.round(p.y - 50))

  const { graph: g, node } = addNode(graph.value, {
    type: nodeType,
    name: spec?.label || nodeType,
    typeVersion: spec?.type_version || 1,
    position: [x, y],
    parameters: parametrosPadrao(spec)
  })
  pushUndo()
  graph.value = g
  selectedName.value = node.name
  syncFromGraph([node.name])
}

function updateParams(parameters) {
  const n = findNode(graph.value, selectedName.value)
  if (!n) return
  // sub-bloco excluído entra aqui: por isso o Ctrl+Z cobre os dois níveis
  pushUndo()
  n.parameters = parameters
  graph.value = { ...graph.value }
  syncFromGraph()
}

function onRename({ from, to, onError }) {
  try {
    graph.value = renameNode(graph.value, from, to)
    selectedName.value = to
    syncFromGraph([to])
  } catch (e) {
    onError(e.message)
  }
}

/**
 * Excluir bloco NUNCA acontece no clique: passa pelo modal. Vale para os quatro
 * caminhos — botão do card, painel de propriedades, menu de contexto e a tecla
 * Del —, porque todos desembocam aqui ou em `pedirExclusaoEmMassa`.
 */
function excluirNo(nome) {
  if (!podeExcluir(nome)) {
    emit('toast', { type: 'error', text: 'O bloco de Início não pode ser excluído.' })
    return
  }
  pendenteExclusao.value = { nomes: [nome], arestas: [] }
  dialog.value = {
    open: true, mode: 'delete', title: 'Excluir bloco?',
    message: `O bloco “${nome}” e as conexões dele serão removidos. Dá para desfazer com Ctrl+Z.`,
    confirmLabel: 'Excluir', danger: true
  }
}

function doDelete() {
  const { nomes, arestas } = pendenteExclusao.value
  pendenteExclusao.value = { nomes: [], arestas: [] }
  apply((g) => {
    let out = g
    // conexões primeiro: apagar o nó já leva as dele junto
    for (const e of arestas) out = disconnect(out, e.source, outputIndexFrom(e.sourceHandle), e.target)
    for (const nome of nomes) if (podeExcluir(nome)) out = deleteNode(out, nome)
    return out
  }, [])
  if (nomes.includes(selectedName.value)) selectedName.value = null
}

function duplicarNo(nome) {
  const clip = copyNodes(graph.value, [nome])
  if (!clip.nodes.length) return
  const { graph: g, names } = pasteNodes(graph.value, clip)
  pushUndo()
  graph.value = g
  selectedName.value = names[0]
  syncFromGraph(names)
}

/** Remove uma conexão a partir do id da aresta do Vue Flow. */
function excluirAresta(edgeId) {
  const e = edges.value.find((x) => x.id === edgeId)
  if (!e) return
  const saida = outputIndexFrom(e.sourceHandle)
  apply((g) => disconnect(g, e.source, saida, e.target))
}

// disponibiliza as ações para a toolbar dentro de cada nó
provide('msgflowAcoes', {
  duplicar: (nome) => !readonly.value && duplicarNo(nome),
  excluir: (nome) => !readonly.value && excluirNo(nome)
})

// ---------- menu de contexto ----------

function onContextMenu(event) {
  const noEl = event.target.closest('.vue-flow__node')
  const arestaEl = event.target.closest('.vue-flow__edge')
  if (!noEl && !arestaEl && !event.target.closest('.vue-flow__pane')) return

  event.preventDefault()
  pickerAberto.value = false

  if (noEl) return menuDoNo(noEl.dataset.id, event)
  if (arestaEl) return menuDaAresta(arestaEl.getAttribute('data-id'), event)
  return menuDoCanvas(event)
}

function menuDoNo(nome, event) {
  selectedName.value = nome
  const spec = specDe(nome)
  const unico = spec?.params_schema?.singleton === true
  ctx.value = {
    x: event.clientX, y: event.clientY, titulo: nome,
    itens: [
      { rotulo: 'Configurar', acao: () => { selectedName.value = nome } },
      { rotulo: 'Copiar', atalho: 'Ctrl+C', desabilitado: readonly.value,
        acao: () => { writeClip(copyNodes(graph.value, [nome])); emit('toast', { type: 'ok', text: '1 bloco copiado.' }) } },
      { rotulo: 'Duplicar', atalho: 'Ctrl+D', desabilitado: readonly.value || unico,
        dica: unico ? 'Bloco único por fluxo' : '', acao: () => duplicarNo(nome) },
      { rotulo: 'Desconectar tudo', desabilitado: readonly.value,
        acao: () => apply((g) => desconectarTudo(g, nome)) },
      { separador: true },
      { rotulo: 'Excluir', atalho: 'Del', perigo: true,
        desabilitado: readonly.value || !podeExcluir(nome),
        dica: podeExcluir(nome) ? '' : 'O bloco de Início não pode ser excluído',
        acao: () => excluirNo(nome) }
    ]
  }
}

function menuDaAresta(edgeId, event) {
  const e = edges.value.find((x) => x.id === edgeId)
  ctx.value = {
    x: event.clientX, y: event.clientY,
    titulo: e ? `${e.source} → ${e.target}` : 'Conexão',
    itens: [
      { rotulo: 'Excluir conexão', atalho: 'Del', perigo: true, desabilitado: readonly.value,
        acao: () => excluirAresta(edgeId) }
    ]
  }
}

function menuDoCanvas(event) {
  ctx.value = {
    x: event.clientX, y: event.clientY, titulo: '',
    itens: [
      { rotulo: 'Adicionar bloco…', desabilitado: readonly.value, acao: () => { pickerAberto.value = true } },
      { rotulo: 'Colar', atalho: 'Ctrl+V', desabilitado: readonly.value || !hasClip(), acao: () => colar() },
      { separador: true },
      { rotulo: 'Organizar blocos', atalho: 'Shift+Alt+O', desabilitado: readonly.value || !nodes.value.length, acao: () => organizar() },
      { rotulo: 'Selecionar tudo', atalho: 'Ctrl+A', acao: () => selecionarTudo() },
      { rotulo: 'Enquadrar', acao: () => fitView({ padding: 0.3, maxZoom: 1 }) }
    ]
  }
}

/**
 * Organiza os blocos em camadas da esquerda para a direita — o "Tidy up" do n8n.
 *
 * As alturas reais dos cards vêm do Vue Flow e entram como parâmetro: o core é
 * puro e não lê o DOM. Sem elas o layout ainda sai, só menos justo — um bloco de
 * Conteúdo com seis partes é bem mais alto que um de Início.
 *
 * Passa por `apply`, que empilha o desfazer SÓ se algo mudou: clicar num fluxo
 * que já está arrumado não gasta um passo de Ctrl+Z.
 */
function organizar() {
  if (readonly.value || !nodes.value.length) return
  const alturas = {}
  for (const vn of vf.getNodes.value) {
    const h = vn.dimensions && vn.dimensions.height
    if (h) alturas[vn.id] = h
  }
  const mudou = apply((g) => organizarGrafo(g, { alturas }), selectedName.value ? [selectedName.value] : [])
  if (!mudou) return
  setTimeout(() => fitView({ padding: 0.3, maxZoom: 1 }), 60)
  emit('toast', { type: 'ok', text: 'Blocos organizados. Ctrl+Z desfaz.' })
}

/** Remove todas as conexões que entram ou saem do nó, mantendo o nó. */
function desconectarTudo(g, nome) {
  const semSaidas = { ...g, connections: { ...g.connections } }
  delete semSaidas.connections[nome]
  for (const src of Object.keys(semSaidas.connections)) {
    const main = (semSaidas.connections[src].main || []).map((alvos) => alvos.filter((t) => t.node !== nome))
    if (main.every((alvos) => alvos.length === 0)) delete semSaidas.connections[src]
    else semSaidas.connections[src] = { main }
  }
  return semSaidas
}

function selecionarTudo() {
  nodes.value = nodes.value.map((n) => ({ ...n, selected: true }))
  selectedName.value = null
}

// ---------- teclado ----------

function selectedNames() {
  return nodes.value.filter((n) => n.selected).map((n) => n.id)
}

function pasteAndSelect(clip) {
  if (readonly.value) return
  try {
    const { graph: next, names } = pasteNodes(graph.value, clip)
    graph.value = next
    selectedName.value = names.length === 1 ? names[0] : null
    syncFromGraph(names)
    emit('toast', { type: 'ok', text: `${names.length} bloco(s) colado(s).` })
  } catch (e) {
    emit('toast', { type: 'error', text: e.message })
  }
}

async function colar() {
  const clip = await readClip()
  if (!clip || !clip.nodes?.length) return
  // um Início colado viraria um segundo Início — o validate barraria na publicação
  const filtrado = {
    nodes: clip.nodes.filter((n) => !typesByKey.value[n.type]?.params_schema?.singleton),
    connections: clip.connections
  }
  if (!filtrado.nodes.length) {
    emit('toast', { type: 'error', text: 'Nada para colar (o bloco de Início é único por fluxo).' })
    return
  }
  pasteAndSelect(filtrado)
}

async function onKeydown(event) {
  if (loading.value) return
  const tag = (event.target.tagName || '').toLowerCase()
  if (['input', 'textarea', 'select'].includes(tag)) return

  if (event.key === 'Escape') { fecharPopups(); return }

  // Shift+Alt+O organiza. Fora de Ctrl de propósito: Ctrl+O é "abrir arquivo" do
  // navegador, e este app roda dentro de um iframe do Chatwoot.
  if (event.shiftKey && event.altKey && (event.key || '').toLowerCase() === 'o') {
    event.preventDefault()
    organizar()
    return
  }

  const ctrl = event.ctrlKey || event.metaKey
  const nomes = selectedNames()
  const arestasSel = edges.value.filter((e) => e.selected)

  if (ctrl && event.key.toLowerCase() === 'c' && nomes.length) {
    event.preventDefault()
    writeClip(copyNodes(graph.value, nomes))
    emit('toast', { type: 'ok', text: `${nomes.length} bloco(s) copiado(s).` })
  } else if (ctrl && event.key.toLowerCase() === 'v') {
    event.preventDefault()
    colar()
  } else if (ctrl && event.key.toLowerCase() === 'd' && nomes.length) {
    event.preventDefault()
    pasteAndSelect(copyNodes(graph.value, nomes))
  } else if (ctrl && event.key.toLowerCase() === 'a') {
    event.preventDefault()
    selecionarTudo()
  } else if (ctrl && event.key.toLowerCase() === 'z') {
    event.preventDefault()
    desfazer()
  } else if (event.key === 'Delete' || event.key === 'Backspace') {
    if (!nomes.length && !arestasSel.length) return
    event.preventDefault()
    const apagaveis = nomes.filter(podeExcluir)
    if (!apagaveis.length && !arestasSel.length) return
    pendenteExclusao.value = { nomes: apagaveis, arestas: arestasSel }
    const partes = []
    if (apagaveis.length) partes.push(`${apagaveis.length} bloco(s)`)
    if (arestasSel.length) partes.push(`${arestasSel.length} conexão(ões)`)
    dialog.value = {
      open: true, mode: 'delete', title: 'Excluir?',
      message: `${partes.join(' e ')} serão removidos. Dá para desfazer com Ctrl+Z.`,
      confirmLabel: 'Excluir', danger: true
    }
  }
}

// ---------- persistência ----------

async function save() {
  if (readonly.value || saving.value) return
  saving.value = true
  try {
    await call('save', { flow_id: props.flowId, graph: graph.value })
    lastSaved.value = JSON.stringify(graph.value)
    flowMeta.value.has_draft = true
    emit('toast', { type: 'ok', text: 'Rascunho salvo.' })
  } catch (e) {
    emit('toast', { type: 'error', text: e.message })
  } finally {
    saving.value = false
  }
}

function askPublish() {
  if (!report.value.ok) {
    emit('toast', { type: 'error', text: report.value.errors[0].message })
    return
  }
  const warn = report.value.warnings.length
    ? `Atenção: ${report.value.warnings.map((w) => w.message).join(' ')}`
    : 'O fluxo publicado passa a ser a versão que o executor vai ler.'
  dialog.value = { open: true, mode: 'publish', title: 'Publicar fluxo', message: warn, confirmLabel: 'Publicar', danger: false }
}

async function doPublish() {
  dialog.value = { ...dialog.value, open: false }
  saving.value = true
  try {
    // Publicar SALVA o que está na tela: manda o graph corrente e o backend o
    // grava como versão publicada, zerando o rascunho. Não existe publicar uma
    // coisa e ficar com outra salva — por isso o ponto fica verde ao final.
    const res = await call('publish', { flow_id: props.flowId, graph: graph.value })
    lastSaved.value = JSON.stringify(graph.value)
    flowMeta.value.version = res.version
    flowMeta.value.is_published = true
    flowMeta.value.has_draft = false
    emit('toast', { type: 'ok', text: `Publicado como v${res.version}.` })
  } catch (e) {
    emit('toast', { type: 'error', text: e.message })
  } finally {
    saving.value = false
  }
}

function askUnpublish() {
  dialog.value = {
    open: true, mode: 'unpublish', title: 'Despublicar fluxo',
    message: 'O fluxo sai do ar e deixa de ser executado. O conteúdo não se perde: vira rascunho, e o histórico de versões fica intacto.',
    confirmLabel: 'Despublicar', danger: true
  }
}

async function doUnpublish() {
  saving.value = true
  try {
    await call('unpublish', { flow_id: props.flowId })
    // o que estava no ar virou rascunho — o que está na tela continua igual,
    // então o ponto não muda; o que muda é o badge.
    flowMeta.value.is_published = false
    flowMeta.value.has_draft = true
    emit('toast', { type: 'ok', text: 'Fluxo despublicado. Ele saiu do ar.' })
  } catch (e) {
    emit('toast', { type: 'error', text: e.message })
  } finally {
    saving.value = false
  }
}

// ---------- nome do fluxo, editável no próprio cabeçalho ----------

async function comecarEdicaoNome() {
  if (readonly.value) return
  nomeDraft.value = flowMeta.value.flow_name
  nomeErro.value = ''
  editandoNome.value = true
  await nextTick()
  nomeInput.value?.focus()
  nomeInput.value?.select()
}

function cancelarEdicaoNome() {
  editandoNome.value = false
  nomeErro.value = ''
}

async function salvarNome() {
  const novo = nomeDraft.value.trim()
  if (!novo || novo === flowMeta.value.flow_name) return cancelarEdicaoNome()

  // mesma regra da lista: nome único no cliente inteiro
  if (isFlowNameTaken(novo, props.flows, Number(props.flowId))) {
    nomeErro.value = 'Já existe outro fluxo com esse nome.'
    return
  }
  try {
    await call('rename', { flow_id: props.flowId, flow_name: novo })
    flowMeta.value.flow_name = novo
    editandoNome.value = false
    nomeErro.value = ''
    emit('toast', { type: 'ok', text: 'Nome alterado.' })
  } catch (e) {
    nomeErro.value = e.message
  }
}

function exportJson() {
  const payload = { flow_name: flowMeta.value.flow_name, graph: graph.value }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${flowMeta.value.flow_name || 'fluxo'}.json`
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Sair do editor para uma pasta. O Voltar usa a pasta DO FLUXO (item 7); o
 * caminho no cabeçalho usa a pasta clicada. Os dois passam pelo mesmo guarda de
 * alterações não salvas — senão o breadcrumb virava um atalho para perder tudo.
 */
const saidaPendente = ref(undefined)

function leaveTo(folderId) {
  saidaPendente.value = folderId
  if (dirty.value) {
    dialog.value = {
      open: true, mode: 'leave', title: 'Sair sem salvar?',
      message: 'Há alterações que ainda não foram salvas como rascunho. Se sair agora, elas se perdem.',
      confirmLabel: 'Sair mesmo assim', danger: true
    }
    return
  }
  emit('back', folderId)
}

function goBack() {
  leaveTo(flowMeta.value.folder_id)
}

function onDialogConfirm() {
  const mode = dialog.value.mode
  dialog.value = { ...dialog.value, open: false }
  if (mode === 'delete') doDelete()
  else if (mode === 'publish') doPublish()
  else if (mode === 'unpublish') doUnpublish()
  else if (mode === 'leave') emit('back', saidaPendente.value)
}

onMounted(() => {
  load()
  window.addEventListener('keydown', onKeydown)
  document.addEventListener('click', onDocumentClick)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  document.removeEventListener('click', onDocumentClick)
})
</script>

<template>
  <div class="mf-editor">
    <header class="mf-topbar">
      <button class="back-btn" title="Voltar para a pasta do fluxo" @click="goBack">← Voltar</button>

      <!-- caminho até o fluxo, cada pasta clicável, terminando no nome dele -->
      <nav class="mf-editor__crumbs">
        <a href="#" @click.prevent="leaveTo(null)">Todos os fluxos</a>
        <template v-for="f in folderPath" :key="f.id">
          <span class="mf-crumb__sep">/</span>
          <a href="#" @click.prevent="leaveTo(f.id)">{{ f.folder_name }}</a>
        </template>
        <span class="mf-crumb__sep">/</span>

        <!-- clicar no nome edita ali mesmo; Enter salva, Esc desiste -->
        <input
          v-if="editandoNome"
          ref="nomeInput"
          v-model="nomeDraft"
          class="mf-input mf-nome-input"
          :class="{ 'is-invalid': nomeErro }"
          :title="nomeErro"
          @keydown.enter.prevent="salvarNome"
          @keydown.esc.prevent="cancelarEdicaoNome"
          @blur="salvarNome"
        />
        <h2
          v-else
          class="mf-topbar__title"
          :class="{ 'is-editavel': !readonly }"
          :title="readonly ? '' : 'Clique para renomear'"
          @click="comecarEdicaoNome"
        >{{ flowMeta.flow_name || 'Fluxo' }}</h2>
      </nav>

      <span v-if="nomeErro" class="mf-badge" style="color:var(--error);border-color:var(--error)">{{ nomeErro }}</span>

      <!--
        Dois controles independentes (decisão de 2026-07-29):
          badge = está no ar ou não · ponto = o que está na tela está salvo ou não.
      -->
      <span class="mf-status">
        <span
          class="mf-dot"
          :class="pendente ? 'is-warn' : 'is-ok'"
          :title="dirty
            ? 'O que está na tela ainda não foi salvo.'
            : (flowMeta.has_draft
                ? 'Há alterações salvas que ainda não foram publicadas.'
                : 'Não há alterações pendentes.')"
        ></span>
        <span class="mf-badge" :class="{ 'mf-badge--ok': flowMeta.is_published }">
          {{ flowMeta.is_published ? 'Publicado' : 'Não publicado' }}
        </span>
      </span>

      <span class="mf-topbar__spacer"></span>

      <span v-if="report.errors.length" class="mf-badge" style="color:var(--error);border-color:var(--error)">
        {{ report.errors.length }} problema(s)
      </span>
      <button class="mf-btn" @click="exportJson">Exportar JSON</button>
      <button class="mf-btn" :disabled="readonly || saving || !dirty" @click="save">
        {{ saving ? 'Salvando…' : 'Salvar' }}
      </button>
      <!-- um só botão, três estados — ver `acaoPublicacao` -->
      <button
        class="mf-btn"
        :class="{ 'mf-btn--primary': acaoPublicacao.primary }"
        :disabled="readonly || saving"
        @click="acaoPublicacao.modo === 'publicar' ? askPublish() : askUnpublish()"
      >{{ acaoPublicacao.label }}</button>
    </header>

    <div class="mf-body">
      <div class="mf-canvas" @drop="onDrop" @dragover.prevent @contextmenu="onContextMenu">
        <VueFlow
          v-model:nodes="nodes"
          v-model:edges="edges"
          :node-types="nodeTypesComponents"
          :default-viewport="{ zoom: 0.9 }"
          :min-zoom="0.2"
          :max-zoom="2"
          :delete-key-code="null"
          multi-selection-key-code="Shift"
        >
          <Background :gap="18" :size="1" pattern-color="var(--border)" />
          <!-- ⚠️ `show-interactive="false"` tira o CADEADO nativo do Vue Flow.
               Ele alterna "canvas travado/destravado" e não tem papel aqui: para
               quem não conhece o controle, clicar sem querer congela o editor sem
               dizer nada, e o sintoma ("parou de arrastar") não aponta a causa.
               Também era o botão que o Evandro vinha confundindo com o Organizar
               (31/07 e 01/08) — dois ícones na mesma coluna, um deles inútil. -->
          <Controls :show-interactive="false">
            <!-- Organizar entra como mais um controle, na mesma coluna do zoom:
                 é onde a mão já está quando o fluxo virou espaguete -->
            <ControlButton
              class="mf-tidy"
              :class="{ 'is-off': readonly || !nodes.length }"
              title="Organizar blocos (Shift+Alt+O)"
              @click="organizar"
            >
              <!-- VASSOURA. Os três retângulos ligados por chaves que estavam aqui
                   liam como cadeado no tamanho real do controle (Evandro, 31/07) —
                   e "trancar" é o oposto do que o botão faz. -->
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 3.2 12.4 10.8" />
                <path d="M13.4 7.6 16.4 10.6" />
                <path d="M12.2 10 4.4 17.8 7.8 21.2 15.6 13.4 Z" />
                <path d="M7.4 14.8 10.8 18.2" />
              </svg>
            </ControlButton>
          </Controls>
          <MiniMap pannable zoomable />
        </VueFlow>

        <button
          class="mf-add-btn"
          :disabled="readonly"
          :title="readonly ? 'Você não tem permissão para editar' : 'Adicionar bloco'"
          @click.stop="pickerAberto = !pickerAberto"
        >+</button>


        <BlockPicker
          v-if="pickerAberto"
          :types="typesList"
          :ja-no-fluxo="tiposNoFluxo"
          @inserir="inserirBloco"
          @fechar="pickerAberto = false"
        />

        <div v-if="loading" class="mf-canvas__overlay">Carregando fluxo…</div>
        <div v-else-if="!nodes.length" class="mf-canvas__overlay">
          Use o + para adicionar o primeiro bloco.
        </div>

        <div class="mf-hotkeys">
          + adicionar · botão direito abre o menu · Shift+Alt+O organiza · Ctrl+C/V/D · Del exclui bloco ou conexão · Shift+clique multi-seleção
        </div>
      </div>

      <PropertiesPanel
        :node="selectedNode"
        :readonly="readonly"
        :can-delete="crud.delete && !!selectedName && podeExcluir(selectedName)"
        @update-params="updateParams"
        @rename="onRename"
        @delete="excluirNo"
        @close="selectedName = null"
      />
    </div>

    <ContextMenu
      v-if="ctx"
      :x="ctx.x" :y="ctx.y" :titulo="ctx.titulo" :itens="ctx.itens"
      @fechar="ctx = null"
    />

    <ModalDialog
      :open="dialog.open"
      :title="dialog.title"
      :message="dialog.message"
      :confirm-label="dialog.confirmLabel"
      :danger="dialog.danger"
      @confirm="onDialogConfirm"
      @cancel="dialog = { ...dialog, open: false }"
    />
  </div>
</template>

<style scoped>
.mf-editor { display: flex; flex-direction: column; height: 100%; }

/* caminho no cabeçalho: pastas clicáveis + nome do fluxo em destaque */
.mf-editor__crumbs { display: flex; align-items: center; gap: 6px; min-width: 0; flex-wrap: wrap; }
.mf-editor__crumbs a {
  color: var(--text2);
  text-decoration: none;
  font-size: 13px;
  padding: 2px 6px;
  border-radius: 5px;
}
.mf-editor__crumbs a:hover { color: var(--accent2); background: var(--surface2); }
.mf-editor__crumbs .mf-topbar__title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mf-topbar__title.is-editavel { cursor: text; padding: 2px 6px; border-radius: 5px; border: 1px solid transparent; }
.mf-topbar__title.is-editavel:hover { border-color: var(--border); background: var(--surface2); }
.mf-nome-input { font-size: 16px; font-weight: 600; padding: 2px 6px; min-width: 220px; }
.mf-nome-input.is-invalid { border-color: var(--error); }
.mf-canvas__overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text2);
  pointer-events: none;
}
.mf-hotkeys {
  position: absolute;
  left: 12px;
  bottom: 10px;
  font-size: 11px;
  color: var(--text2);
  background: color-mix(in srgb, var(--surface) 85%, transparent);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 4px 8px;
  pointer-events: none;
  z-index: 6;
}
</style>
