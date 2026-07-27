<script setup>
/**
 * Editor de canvas.
 *
 * O `graph` (formato n8n) é a fonte da verdade. As estruturas do Vue Flow são
 * derivadas dele e re-sincronizadas depois de toda operação estrutural. Só o
 * arrasto de posição escreve direto no graph, para não recriar o array no meio
 * da interação e cortar o movimento.
 */
import { ref, computed, onMounted, onBeforeUnmount, markRaw } from 'vue'
import { VueFlow, useVueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'

import MsgFlowNode from './MsgFlowNode.vue'
import NodePalette from './NodePalette.vue'
import PropertiesPanel from './PropertiesPanel.vue'
import ModalDialog from './ModalDialog.vue'

import { call, crud } from '../lib/api.js'
import { writeClip, readClip } from '../lib/storage.js'
import {
  createEmptyGraph, addNode, deleteNode, renameNode, connect, disconnect,
  copyNodes, pasteNodes, toVueFlow, fromVueFlow, validate, findNode
} from '../core/graph.js'

const props = defineProps({ flowId: { type: [Number, String], required: true } })
const emit = defineEmits(['back', 'toast'])

const nodeTypesComponents = { msgflow: markRaw(MsgFlowNode) }

const {
  onConnect, onNodeDragStop, onNodeClick, onPaneClick,
  screenToFlowCoordinate, fitView
} = useVueFlow()

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
const canvasEl = ref(null)

const typesByKey = computed(() => Object.fromEntries(typesList.value.map((t) => [t.node_type, t])))
const readonly = computed(() => !crud.update)
const dirty = computed(() => JSON.stringify(graph.value) !== lastSaved.value)

const selectedNode = computed(() => {
  if (!selectedName.value) return null
  const n = findNode(graph.value, selectedName.value)
  if (!n) return null
  return { name: n.name, nodeType: n.type, parameters: n.parameters, spec: typesByKey.value[n.type] || null }
})

const report = computed(() => validate(graph.value, typesByKey.value))

/**
 * Recria as estruturas do Vue Flow a partir do graph.
 * Preserva a seleção: sem isso, renomear ou colar desmarca tudo e um Ctrl+C
 * logo em seguida não copiaria nada.
 */
function syncFromGraph(keepSelected) {
  // Quando a chamada diz exatamente o que deve ficar selecionado (colar, duplicar),
  // essa lista manda. Fora isso, preserva a seleção que já existia.
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
    // maxZoom no fitView: um fluxo recém-criado tem só o nó de Início, e sem esse
    // teto o enquadramento vai ao zoom máximo e o nó aparece gigante.
    setTimeout(() => fitView({ padding: 0.3, maxZoom: 1 }), 60)
  } catch (e) {
    emit('toast', { type: 'error', text: e.message })
  } finally {
    loading.value = false
  }
}

// ---------- edição do grafo ----------

function apply(fn) {
  if (readonly.value) return
  try {
    graph.value = fn(graph.value)
    syncFromGraph()
  } catch (e) {
    emit('toast', { type: 'error', text: e.message })
  }
}

onConnect((params) => {
  const outputIndex = Number(String(params.sourceHandle || 'out-0').replace('out-', '')) || 0
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

function onDrop(event) {
  event.preventDefault()
  if (readonly.value) return
  const nodeType = event.dataTransfer.getData('application/msgflow-type')
  if (!nodeType) return

  const spec = typesByKey.value[nodeType]
  if (spec?.params_schema?.singleton && graph.value.nodes.some((n) => n.type === nodeType)) {
    emit('toast', { type: 'error', text: `O fluxo só pode ter um bloco "${spec.label}".` })
    return
  }

  const pos = screenToFlowCoordinate({ x: event.clientX, y: event.clientY })
  const defaults = {}
  for (const f of spec?.params_schema?.fields || []) {
    if (f.default !== undefined) defaults[f.key] = f.default
  }

  apply((g) => addNode(g, {
    type: nodeType,
    name: spec?.label || nodeType,
    typeVersion: spec?.type_version || 1,
    position: [Math.round(pos.x - 115), Math.round(pos.y - 40)],
    parameters: defaults
  }).graph)
}

// O Vue Flow não expõe um hook `onSelectionChange` — quem manda no painel é o
// clique. Clicar num nó abre o painel dele; clicar no vazio fecha.
onNodeClick(({ node }) => {
  selectedName.value = node.id
})

onPaneClick(() => {
  selectedName.value = null
})

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
    syncFromGraph()
  } catch (e) {
    onError(e.message)
  }
}

function onDeleteNode(name) {
  const spec = typesByKey.value[findNode(graph.value, name)?.type]
  if (spec?.params_schema?.deletable === false) {
    emit('toast', { type: 'error', text: `O bloco "${spec.label}" não pode ser excluído.` })
    return
  }
  apply((g) => deleteNode(g, name))
  selectedName.value = null
}

// ---------- teclado: copiar, colar, duplicar, excluir ----------

function selectedNames() {
  return nodes.value.filter((n) => n.selected).map((n) => n.id)
}

/** Cola e deixa selecionado o que acabou de ser colado — não o original. */
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

async function onKeydown(event) {
  if (loading.value) return
  const tag = (event.target.tagName || '').toLowerCase()
  if (['input', 'textarea', 'select'].includes(tag)) return

  const ctrl = event.ctrlKey || event.metaKey
  const names = selectedNames()

  if (ctrl && event.key.toLowerCase() === 'c' && names.length) {
    event.preventDefault()
    writeClip(copyNodes(graph.value, names))
    emit('toast', { type: 'ok', text: `${names.length} bloco(s) copiado(s).` })
  } else if (ctrl && event.key.toLowerCase() === 'v') {
    event.preventDefault()
    const clip = await readClip()
    if (!clip || !clip.nodes?.length) return
    // um Início colado viraria um segundo Início — o validate barraria na publicação
    const filtered = {
      nodes: clip.nodes.filter((n) => !typesByKey.value[n.type]?.params_schema?.singleton),
      connections: clip.connections
    }
    if (!filtered.nodes.length) {
      emit('toast', { type: 'error', text: 'Nada para colar (o bloco de Início é único por fluxo).' })
      return
    }
    pasteAndSelect(filtered)
  } else if (ctrl && event.key.toLowerCase() === 'd' && names.length) {
    event.preventDefault()
    pasteAndSelect(copyNodes(graph.value, names))
  } else if ((event.key === 'Delete' || event.key === 'Backspace') && names.length) {
    event.preventDefault()
    apply((g) => names.reduce((acc, name) => {
      const spec = typesByKey.value[findNode(acc, name)?.type]
      return spec?.params_schema?.deletable === false ? acc : deleteNode(acc, name)
    }, g))
    selectedName.value = null
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
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
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
      <NodePalette :types="typesList" :disabled="readonly" />

      <div ref="canvasEl" class="mf-canvas" @drop="onDrop" @dragover.prevent>
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

        <div v-if="loading" class="mf-canvas__overlay">Carregando fluxo…</div>
        <div v-else-if="!nodes.length" class="mf-canvas__overlay">
          Arraste um bloco da paleta para começar.
        </div>

        <div class="mf-hotkeys">Ctrl+C copiar · Ctrl+V colar · Ctrl+D duplicar · Del excluir · Shift+clique multi-seleção</div>
      </div>

      <PropertiesPanel
        :node="selectedNode"
        :readonly="readonly"
        :can-delete="crud.delete"
        @update-params="updateParams"
        @rename="onRename"
        @delete="onDeleteNode"
        @close="selectedName = null"
      />
    </div>

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
}
</style>
