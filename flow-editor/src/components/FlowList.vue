<script setup>
/**
 * Tela de lista: pastas + fluxos.
 * Layout inspirado no ChatPRO (faixa de pastas acima, tabela de fluxos abaixo),
 * com os tokens do design system ECiaA.
 */
import { computed, ref, onMounted } from 'vue'
import { call, crud } from '../lib/api.js'
import { createEmptyGraph, addNode } from '../core/graph.js'
import ModalDialog from './ModalDialog.vue'

const emit = defineEmits(['open', 'toast'])

const loading = ref(true)
const folders = ref([])
const flows = ref([])
const currentFolder = ref(null) // null = raiz
const search = ref('')
const menuFor = ref(null)

const dialog = ref({ open: false, mode: null, title: '', label: '', message: '', value: '', confirmLabel: '', danger: false, target: null })

const importInput = ref(null)

const visibleFlows = computed(() => {
  const term = search.value.trim().toLowerCase()
  return flows.value
    .filter((f) => (f.folder_id ?? null) === currentFolder.value)
    .filter((f) => !term || f.flow_name.toLowerCase().includes(term))
    .sort((a, b) => a.flow_name.localeCompare(b.flow_name, 'pt-BR'))
})

const visibleFolders = computed(() =>
  folders.value.filter((f) => (f.parent_id ?? null) === currentFolder.value)
)

const currentFolderName = computed(() => {
  if (currentFolder.value === null) return null
  return folders.value.find((f) => f.id === currentFolder.value)?.folder_name || '…'
})

function countIn(folderId) {
  return flows.value.filter((f) => f.folder_id === folderId).length
}

async function load() {
  loading.value = true
  try {
    const data = await call('list')
    folders.value = data.folders || []
    flows.value = data.flows || []
  } catch (e) {
    emit('toast', { type: 'error', text: e.message })
  } finally {
    loading.value = false
  }
}

onMounted(load)

function ask(cfg) {
  dialog.value = { open: true, ...cfg }
}
function closeDialog() {
  dialog.value = { ...dialog.value, open: false }
}

function askNewFlow() {
  ask({ mode: 'new-flow', title: 'Novo fluxo', label: 'Nome do fluxo', value: '', placeholder: 'Ex.: Boas-vindas', confirmLabel: 'Criar' })
}
function askNewFolder() {
  ask({ mode: 'new-folder', title: 'Nova pasta', label: 'Nome da pasta', value: '', confirmLabel: 'Criar' })
}
function askRenameFlow(flow) {
  ask({ mode: 'rename-flow', title: 'Renomear fluxo', label: 'Nome do fluxo', value: flow.flow_name, confirmLabel: 'Salvar', target: flow })
}
function askRenameFolder(folder) {
  ask({ mode: 'rename-folder', title: 'Renomear pasta', label: 'Nome da pasta', value: folder.folder_name, confirmLabel: 'Salvar', target: folder })
}
function askDeleteFlow(flow) {
  ask({
    mode: 'delete-flow', title: 'Excluir fluxo', danger: true, confirmLabel: 'Excluir', target: flow,
    message: `O fluxo "${flow.flow_name}" deixa de aparecer na lista. O histórico de versões é preservado.`
  })
}
function askDeleteFolder(folder) {
  ask({
    mode: 'delete-folder', title: 'Excluir pasta', danger: true, confirmLabel: 'Excluir', target: folder,
    message: `A pasta "${folder.folder_name}" será removida. Os fluxos dentro dela voltam para a raiz — nenhum fluxo é excluído.`
  })
}

async function onDialogConfirm(value) {
  const { mode, target } = dialog.value
  closeDialog()
  try {
    if (mode === 'new-flow') {
      // todo fluxo nasce com o nó de Início já posto — nunca com canvas vazio
      const { graph } = addNode(createEmptyGraph(), { type: 'eciaa.start', name: 'Início', position: [80, 200] })
      const res = await call('create', { flow_name: value, folder_id: currentFolder.value, graph })
      await load()
      emit('open', res.flow.id)
    } else if (mode === 'new-folder') {
      await call('folder_create', { folder_name: value, parent_id: currentFolder.value })
      await load()
    } else if (mode === 'rename-flow') {
      await call('rename', { flow_id: target.id, flow_name: value })
      await load()
    } else if (mode === 'rename-folder') {
      await call('folder_rename', { folder_id: target.id, folder_name: value })
      await load()
    } else if (mode === 'delete-flow') {
      await call('delete', { flow_id: target.id })
      await load()
      emit('toast', { type: 'ok', text: 'Fluxo excluído.' })
    } else if (mode === 'delete-folder') {
      await call('folder_delete', { folder_id: target.id })
      await load()
    }
  } catch (e) {
    emit('toast', { type: 'error', text: e.message })
  }
}

async function cloneFlow(flow) {
  menuFor.value = null
  try {
    await call('clone', { flow_id: flow.id })
    await load()
    emit('toast', { type: 'ok', text: 'Fluxo duplicado.' })
  } catch (e) {
    emit('toast', { type: 'error', text: e.message })
  }
}

async function moveToRoot(flow) {
  menuFor.value = null
  try {
    await call('move', { flow_id: flow.id, folder_id: null })
    await load()
  } catch (e) {
    emit('toast', { type: 'error', text: e.message })
  }
}

async function moveTo(flow, folderId) {
  menuFor.value = null
  try {
    await call('move', { flow_id: flow.id, folder_id: folderId })
    await load()
  } catch (e) {
    emit('toast', { type: 'error', text: e.message })
  }
}

async function exportFlow(flow) {
  menuFor.value = null
  try {
    const { flow: full } = await call('get', { flow_id: flow.id })
    const graph = full.graph || full.graph_draft || createEmptyGraph()
    const blob = new Blob([JSON.stringify({ flow_name: full.flow_name, description: full.description, graph }, null, 2)], {
      type: 'application/json'
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${full.flow_slug || 'fluxo'}.json`
    a.click()
    URL.revokeObjectURL(url)
  } catch (e) {
    emit('toast', { type: 'error', text: e.message })
  }
}

async function onImportFile(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  try {
    const parsed = JSON.parse(await file.text())
    const graph = parsed.graph || parsed
    if (!graph || !Array.isArray(graph.nodes)) throw new Error('Arquivo não parece um fluxo exportado.')
    const name = parsed.flow_name || file.name.replace(/\.json$/i, '')
    const res = await call('create', { flow_name: name, folder_id: currentFolder.value, graph })
    await load()
    emit('toast', { type: 'ok', text: `Fluxo "${name}" importado.` })
    emit('open', res.flow.id)
  } catch (e) {
    emit('toast', { type: 'error', text: `Falha ao importar: ${e.message}` })
  }
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
</script>

<template>
  <div class="mf-list" @click="menuFor = null">
    <header class="mf-list__head">
      <div>
        <h2 class="mf-list__title">Fluxos de mensagem</h2>
        <nav class="mf-list__crumbs">
          <a href="#" @click.prevent="currentFolder = null">Todos os fluxos</a>
          <template v-if="currentFolderName"> / <strong>{{ currentFolderName }}</strong></template>
        </nav>
      </div>
      <span style="flex:1"></span>
      <button v-if="crud.create" class="mf-btn" @click="importInput.click()">Importar JSON</button>
      <button v-if="crud.create" class="mf-btn" @click="askNewFolder">Criar pasta +</button>
      <button v-if="crud.create" class="mf-btn mf-btn--primary" @click="askNewFlow">Criar novo fluxo +</button>
      <input ref="importInput" type="file" accept="application/json,.json" hidden @change="onImportFile" />
    </header>

    <div v-if="loading" class="mf-empty">Carregando…</div>

    <template v-else>
      <div v-if="visibleFolders.length" class="mf-folders">
        <div
          v-for="folder in visibleFolders"
          :key="folder.id"
          class="mf-folder"
          @dblclick="currentFolder = folder.id"
        >
          <span class="mf-folder__icon" @click="currentFolder = folder.id">📁</span>
          <span class="mf-folder__name" @click="currentFolder = folder.id">{{ folder.folder_name }}</span>
          <span class="mf-folder__count">{{ countIn(folder.id) }}</span>
          <button
            v-if="crud.update"
            class="mf-btn mf-btn--ghost mf-btn--sm"
            title="Renomear"
            @click.stop="askRenameFolder(folder)"
          >✎</button>
          <button
            v-if="crud.delete"
            class="mf-btn mf-btn--ghost mf-btn--sm mf-btn--danger"
            title="Excluir pasta"
            @click.stop="askDeleteFolder(folder)"
          >✕</button>
        </div>
      </div>

      <div class="mf-list__toolbar">
        <input v-model="search" class="mf-input" style="max-width:280px" placeholder="Buscar fluxo…" />
      </div>

      <table v-if="visibleFlows.length" class="mf-table">
        <thead>
          <tr>
            <th>Nome</th>
            <th style="width:120px">Situação</th>
            <th style="width:140px">Última alteração</th>
            <th style="width:44px"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="flow in visibleFlows" :key="flow.id" @dblclick="emit('open', flow.id)">
            <td>
              <a href="#" class="mf-table__link" @click.prevent="emit('open', flow.id)">{{ flow.flow_name }}</a>
              <div v-if="flow.description" class="mf-help">{{ flow.description }}</div>
            </td>
            <td>
              <span v-if="flow.has_draft" class="mf-badge mf-badge--draft">rascunho</span>
              <span v-else-if="flow.version > 0" class="mf-badge mf-badge--ok">v{{ flow.version }}</span>
              <span v-else class="mf-badge">não publicado</span>
            </td>
            <td style="color: var(--text2)">{{ formatDate(flow.updated_at) }}</td>
            <td style="position:relative">
              <button class="mf-btn mf-btn--ghost mf-btn--sm" @click.stop="menuFor = menuFor === flow.id ? null : flow.id">⋮</button>
              <div v-if="menuFor === flow.id" class="mf-menu" @click.stop>
                <button @click="emit('open', flow.id)">Abrir</button>
                <button v-if="crud.create" @click="cloneFlow(flow)">Duplicar</button>
                <button v-if="crud.update" @click="menuFor = null; askRenameFlow(flow)">Renomear</button>
                <button @click="exportFlow(flow)">Exportar JSON</button>
                <template v-if="crud.update">
                  <div class="mf-menu__sep"></div>
                  <div class="mf-menu__label">Mover para</div>
                  <button v-if="flow.folder_id !== null" @click="moveToRoot(flow)">Raiz</button>
                  <button
                    v-for="f in folders.filter((x) => x.id !== flow.folder_id)"
                    :key="f.id"
                    @click="moveTo(flow, f.id)"
                  >{{ f.folder_name }}</button>
                </template>
                <template v-if="crud.delete">
                  <div class="mf-menu__sep"></div>
                  <button class="is-danger" @click="menuFor = null; askDeleteFlow(flow)">Excluir</button>
                </template>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <div v-else class="mf-empty">
        <p v-if="search">Nenhum fluxo encontrado para “{{ search }}”.</p>
        <template v-else>
          <p>Nenhum fluxo {{ currentFolderName ? 'nesta pasta' : 'ainda' }}.</p>
          <button v-if="crud.create" class="mf-btn mf-btn--primary" @click="askNewFlow">Criar o primeiro fluxo</button>
        </template>
      </div>
    </template>

    <ModalDialog
      :open="dialog.open"
      :title="dialog.title"
      :message="dialog.message"
      :label="dialog.label"
      :model-value="dialog.value"
      :placeholder="dialog.placeholder"
      :confirm-label="dialog.confirmLabel"
      :danger="dialog.danger"
      @confirm="onDialogConfirm"
      @cancel="closeDialog"
    />
  </div>
</template>

<style scoped>
.mf-list { flex: 1; overflow-y: auto; padding: 20px 24px; }
.mf-list__head { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 20px; flex-wrap: wrap; }
.mf-list__title { margin: 0; font-size: 18px; }
.mf-list__crumbs { font-size: 12px; color: var(--text2); margin-top: 4px; }
.mf-list__crumbs a { color: var(--accent2); text-decoration: none; }
.mf-list__toolbar { margin-bottom: 12px; }

.mf-folders { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 20px; }
.mf-folder {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
  min-width: 190px;
}
.mf-folder:hover { border-color: var(--accent); }
.mf-folder__name { flex: 1; }
.mf-folder__count { color: var(--text2); font-size: 12px; }

.mf-table { width: 100%; border-collapse: collapse; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.mf-table th {
  text-align: left;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: .5px;
  color: var(--text2);
  font-weight: 600;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
}
.mf-table td { padding: 12px 14px; border-bottom: 1px solid var(--border); vertical-align: top; }
.mf-table tr:last-child td { border-bottom: none; }
.mf-table tr:hover td { background: var(--surface2); }
.mf-table__link { color: var(--text); text-decoration: none; font-weight: 500; }
.mf-table__link:hover { color: var(--accent2); }

.mf-menu {
  position: absolute;
  right: 8px;
  top: 34px;
  z-index: 40;
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 4px;
  min-width: 170px;
  max-height: 300px;
  overflow-y: auto;
  box-shadow: 0 8px 24px rgba(0,0,0,.5);
}
.mf-menu button {
  display: block;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  color: var(--text);
  font: inherit;
  padding: 7px 10px;
  border-radius: 5px;
  cursor: pointer;
}
.mf-menu button:hover { background: var(--bg); }
.mf-menu button.is-danger { color: var(--error); }
.mf-menu__sep { height: 1px; background: var(--border); margin: 4px 0; }
.mf-menu__label { font-size: 10px; text-transform: uppercase; color: var(--text2); padding: 4px 10px; letter-spacing: .5px; }
</style>
