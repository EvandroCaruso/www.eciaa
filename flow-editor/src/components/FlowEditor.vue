<script setup>
/**
 * Editor de canvas.
 *
 * O `graph` (formato n8n) é a fonte da verdade. As estruturas do Vue Flow são
 * derivadas dele e re-sincronizadas depois de toda operação estrutural. Só o
 * arrasto de posição escreve direto no graph, para não recriar o array no meio
 * da interação e cortar o movimento.
 */
import { ref, computed, onMounted, onBeforeUnmount, markRaw, provide } from 'vue'
import { VueFlow, useVueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'

import MsgFlowNode from './MsgFlowNode.vue'
import BlockPicker from './BlockPicker.vue'
import ContextMenu from './ContextMenu.vue'
import PropertiesPanel from './PropertiesPanel.vue'
import ModalDialog from './ModalDialog.vue'

import { call, crud } from '../lib/api.js'
import { writeClip, readClip, hasClip } from '../lib/storage.js'
import {
  createEmptyGraph, addNode, deleteNode, renameNode, connect, disconnect,
  copyNodes, pasteNodes, toVueFlow, fromVueFlow, validate, findNode, outputIndexFrom
} from '../core/graph.js'

const props = defineProps({ flowId: { type: [Number, String], required: true } })
const emit = defineEmits(['back', 'toast'])

const nodeTypesComponents = { msgflow: markRaw(MsgFlowNode) }

// Alguns hooks não existem em toda versão do Vue Flow e desestruturar um nome
// inexistente derruba o componente inteiro no setup. Por isso pegamos o objeto
// e só usamos o que de fato veio.
const vf = useVueFlow()
const { onConnect, onNodeDragStop, onNodeClick, onPaneClick, screenToFlowCoordinate, fitView } = vf

const loading = ref(true)
const saving = ref(false)
const flowMeta = ref({ flow_name: '', version: 0, has_draft: false })
const graph = ref(createEmptyGraph())
const typesList = ref([])
const nodes = ref([])
const edges = ref([])
const selectedName = ref(null)
const lastSaved = ref('')
const dialog = ref({ open: false, mode: null, title: '', message: '', confirmLabel: '', danger: false })
const pickerAberto = ref(false)
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
    flowMeta.value = { flow_name: f.flow_name, version: f.version, has_draft: !!f.graph_draft }
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

function apply(fn, keepSelected) {
  if (readonly.value) return false
  try {
    graph.value = fn(graph.value)
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
  graph.value = g
  selectedName.value = node.name
  syncFromGraph([node.name])
}

function updateParams(parameters) {
  const n = findNode(graph.value, selectedName.value)
  if (!n) return
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

function excluirNo(nome) {
  if (!podeExcluir(nome)) {
    emit('toast', { type: 'error', text: 'O bloco de Início não pode ser excluído.' })
    return
  }
  apply((g) => deleteNode(g, nome), [])
  if (selectedName.value === nome) selectedName.value = null
}

function duplicarNo(nome) {
  const clip = copyNodes(graph.value, [nome])
  if (!clip.nodes.length) return
  const { graph: g, names } = pasteNodes(graph.value, clip)
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
      { rotulo: 'Selecionar tudo', atalho: 'Ctrl+A', acao: () => selecionarTudo() },
      { rotulo: 'Enquadrar', acao: () => fitView({ padding: 0.3, maxZoom: 1 }) }
    ]
  }
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
  } else if (event.key === 'Delete' || event.key === 'Backspace') {
    if (!nomes.length && !arestasSel.length) return
    event.preventDefault()
    apply((g) => {
      let out = g
      // conexões primeiro: apagar o nó já leva as dele junto
      for (const e of arestasSel) out = disconnect(out, e.source, outputIndexFrom(e.sourceHandle), e.target)
      for (const nome of nomes) if (podeExcluir(nome)) out = deleteNode(out, nome)
      return out
    }, [])
    if (nomes.includes(selectedName.value)) selectedName.value = null
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
    const res = await call('publish', { flow_id: props.flowId, graph: graph.value })
    lastSaved.value = JSON.stringify(graph.value)
    flowMeta.value.version = res.version
    flowMeta.value.has_draft = false
    emit('toast', { type: 'ok', text: `Publicado como v${res.version}.` })
  } catch (e) {
    emit('toast', { type: 'error', text: e.message })
  } finally {
    saving.value = false
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

function goBack() {
  if (dirty.value) {
    dialog.value = {
      open: true, mode: 'leave', title: 'Sair sem salvar?',
      message: 'Há alterações que ainda não foram salvas como rascunho. Se sair agora, elas se perdem.',
      confirmLabel: 'Sair mesmo assim', danger: true
    }
    return
  }
  emit('back')
}

function onDialogConfirm() {
  const mode = dialog.value.mode
  dialog.value = { ...dialog.value, open: false }
  if (mode === 'publish') doPublish()
  else if (mode === 'leave') emit('back')
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
      <button class="back-btn" @click="goBack">← Voltar</button>
      <h2 class="mf-topbar__title">{{ flowMeta.flow_name || 'Fluxo' }}</h2>
      <span v-if="dirty" class="mf-badge mf-badge--draft">alterações não salvas</span>
      <span v-else-if="flowMeta.version > 0" class="mf-badge mf-badge--ok">v{{ flowMeta.version }}</span>
      <span v-else class="mf-badge">não publicado</span>

      <span class="mf-topbar__spacer"></span>

      <span v-if="report.errors.length" class="mf-badge" style="color:var(--error);border-color:var(--error)">
        {{ report.errors.length }} problema(s)
      </span>
      <button class="mf-btn" @click="exportJson">Exportar JSON</button>
      <button class="mf-btn" :disabled="readonly || saving || !dirty" @click="save">
        {{ saving ? 'Salvando…' : 'Salvar rascunho' }}
      </button>
      <button class="mf-btn mf-btn--primary" :disabled="readonly || saving" @click="askPublish">Publicar</button>
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
          <Controls />
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
          + adicionar · botão direito abre o menu · Ctrl+C/V/D · Del exclui bloco ou conexão · Shift+clique multi-seleção
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
