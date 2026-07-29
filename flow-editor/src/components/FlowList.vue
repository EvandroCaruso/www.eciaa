<script setup>
/**
 * Tela de lista: pastas + fluxos.
 * Layout inspirado no ChatPRO (faixa de pastas acima, tabela de fluxos abaixo),
 * com os tokens do design system ECiaA.
 *
 * A pasta corrente é PROP, não estado local: o editor precisa devolver o usuário
 * à pasta de onde o fluxo saiu, e isso só funciona se quem manda na navegação
 * for o App (que sobrevive à troca de tela).
 */
import { computed, ref, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { call, crud } from '../lib/api.js'
import { createEmptyGraph, addNode } from '../core/graph.js'
import { isFlowNameTaken, uniqueFlowName } from '../core/names.js'
import ModalDialog from './ModalDialog.vue'

const props = defineProps({
  folderId: { type: [Number, String], default: null }
})
const emit = defineEmits(['open', 'toast', 'update:folderId', 'folders'])

const loading = ref(true)
const folders = ref([])
const flows = ref([])
const search = ref('')

const currentFolder = computed({
  get: () => props.folderId ?? null,
  set: (v) => emit('update:folderId', v ?? null)
})

const dialog = ref({ open: false, mode: null, title: '', label: '', message: '', value: '', confirmLabel: '', danger: false, target: null, error: '' })

const importInput = ref(null)

// ---------------------------------------------------------------------------
// árvore de pastas
// ---------------------------------------------------------------------------

const foldersById = computed(() => Object.fromEntries(folders.value.map((f) => [f.id, f])))

/** Cadeia raiz→folha de uma pasta. O guard evita loop se o banco tiver ciclo. */
function pathOf(folderId) {
  const out = []
  let cur = folderId == null ? null : foldersById.value[folderId]
  let guard = 0
  while (cur && guard < 50) {
    out.unshift(cur)
    cur = cur.parent_id == null ? null : foldersById.value[cur.parent_id]
    guard += 1
  }
  return out
}

const currentPath = computed(() => pathOf(currentFolder.value))

/** "Pasta 01 / Sub-Pasta" — usado no menu "Mover para", que antes achatava tudo. */
function pathLabel(folderId) {
  const p = pathOf(folderId)
  return p.length ? p.map((f) => f.folder_name).join(' / ') : 'Raiz'
}

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

/** Pastas de destino do "Mover para", ordenadas pelo caminho inteiro. */
const moveTargets = computed(() =>
  [...folders.value].sort((a, b) => pathLabel(a.id).localeCompare(pathLabel(b.id), 'pt-BR'))
)

function countIn(folderId) {
  return flows.value.filter((f) => f.folder_id === folderId).length
}

async function load() {
  loading.value = true
  try {
    const data = await call('list')
    folders.value = data.folders || []
    flows.value = data.flows || []
    // o editor precisa da árvore para montar o caminho no título
    emit('folders', folders.value)
    // pasta apagada por outra sessão não pode deixar a tela num limbo vazio
    if (currentFolder.value !== null && !foldersById.value[currentFolder.value]) {
      currentFolder.value = null
    }
  } catch (e) {
    emit('toast', { type: 'error', text: e.message })
  } finally {
    loading.value = false
  }
}

onMounted(load)

// ---------------------------------------------------------------------------
// diálogos
// ---------------------------------------------------------------------------

function ask(cfg) {
  dialog.value = { open: true, error: '', ...cfg }
}
function closeDialog() {
  dialog.value = { ...dialog.value, open: false, error: '' }
}
function rejectDialog(message) {
  dialog.value = { ...dialog.value, error: message }
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

  // Nome digitado à mão que colide: RECUSA (decisão de 2026-07-29). O auto-(1)
  // vale só para importar/duplicar, onde o usuário não escolheu nome nenhum.
  if (mode === 'new-flow' && isFlowNameTaken(value, flows.value)) {
    rejectDialog('Já existe um fluxo com esse nome. Os nomes são únicos em todo o cliente, inclusive em outras pastas.')
    return
  }
  if (mode === 'rename-flow' && isFlowNameTaken(value, flows.value, target.id)) {
    rejectDialog('Já existe outro fluxo com esse nome. Os nomes são únicos em todo o cliente, inclusive em outras pastas.')
    return
  }

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

// ---------------------------------------------------------------------------
// ações do fluxo
// ---------------------------------------------------------------------------

async function cloneFlow(flow) {
  closeMenu()
  try {
    // o nome livre sai da lista ANTES da cópia entrar nela
    const desired = uniqueFlowName(flow.flow_name, flows.value)
    const res = await call('clone', { flow_id: flow.id, flow_name: desired })
    const novoId = res?.flow?.id ?? null
    // o backend de hoje ainda carimba " (cópia)"; enquanto ele não aprender a
    // regra, corrigimos aqui — o nome é o mesmo nos dois caminhos.
    if (novoId && res?.flow?.flow_name !== desired) {
      await call('rename', { flow_id: novoId, flow_name: desired })
    }
    await load()
    emit('toast', { type: 'ok', text: `Fluxo duplicado como "${desired}".` })
  } catch (e) {
    emit('toast', { type: 'error', text: e.message })
  }
}

async function moveTo(flow, folderId) {
  closeMenu()
  if ((flow.folder_id ?? null) === (folderId ?? null)) return
  try {
    await call('move', { flow_id: flow.id, folder_id: folderId ?? null })
    await load()
    emit('toast', { type: 'ok', text: `"${flow.flow_name}" movido para ${pathLabel(folderId)}.` })
  } catch (e) {
    emit('toast', { type: 'error', text: e.message })
  }
}

async function exportFlow(flow) {
  closeMenu()
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
    const pedido = parsed.flow_name || file.name.replace(/\.json$/i, '')
    // importar não pode falhar por nome ocupado: vira "(1)", "(2)"…
    const name = uniqueFlowName(pedido, flows.value)
    const res = await call('create', { flow_name: name, folder_id: currentFolder.value, graph })
    await load()
    emit('toast', {
      type: 'ok',
      text: name === pedido ? `Fluxo "${name}" importado.` : `Já havia um "${pedido}" — importado como "${name}".`
    })
    emit('open', res.flow.id)
  } catch (e) {
    emit('toast', { type: 'error', text: `Falha ao importar: ${e.message}` })
  }
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ---------------------------------------------------------------------------
// menu ⋮ — vive no <body> via Teleport
//
// Antes era position:absolute dentro do <td>: o container da lista tem
// overflow-y:auto, então o menu era CORTADO nas últimas linhas. Fixed + Teleport
// tira o menu do fluxo de recorte; o flip decide se abre para baixo ou para cima.
// ---------------------------------------------------------------------------

const menuFor = ref(null)
const menuEl = ref(null)
const menuPos = ref({ left: 0, top: 0, maxHeight: 320 })

function closeMenu() {
  menuFor.value = null
}

async function toggleMenu(flow, ev) {
  if (menuFor.value === flow.id) return closeMenu()
  const rect = ev.currentTarget.getBoundingClientRect()
  menuFor.value = flow.id
  await nextTick()
  positionMenu(rect)
}

function positionMenu(rect) {
  const el = menuEl.value
  if (!el) return
  const margem = 8
  const abaixo = window.innerHeight - rect.bottom - margem - 4
  const acima = rect.top - margem - 4
  const altura = el.scrollHeight
  const paraCima = altura > abaixo && acima > abaixo

  const maxHeight = Math.max(140, paraCima ? acima : abaixo)
  const usada = Math.min(altura, maxHeight)

  let left = rect.right - el.offsetWidth
  left = Math.min(Math.max(margem, left), window.innerWidth - margem - el.offsetWidth)

  menuPos.value = {
    left,
    top: paraCima ? rect.top - 4 - usada : rect.bottom + 4,
    maxHeight
  }
}

// Menu fixo não acompanha a rolagem — em vez de recalcular a cada scroll, fecha.
function onWindowChange() {
  if (menuFor.value !== null) closeMenu()
}

// Teleportado para o <body>, o menu não bubbla mais pelo container da lista:
// o clique-fora precisa ser ouvido no documento. O botão ⋮ usa @click.stop,
// então o clique que ABRE não chega aqui e não fecha na sequência.
function onDocumentClick() {
  if (menuFor.value !== null) closeMenu()
}

onMounted(() => {
  window.addEventListener('scroll', onWindowChange, true)
  window.addEventListener('resize', onWindowChange)
  document.addEventListener('click', onDocumentClick)
})
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onWindowChange, true)
  window.removeEventListener('resize', onWindowChange)
  document.removeEventListener('click', onDocumentClick)
})

// ---------------------------------------------------------------------------
// arrastar fluxo para pasta
// ---------------------------------------------------------------------------

const dragFlowId = ref(null)
const dropAlvo = ref(undefined) // undefined = nenhum · null = raiz · number = pasta

const arrastando = computed(() => dragFlowId.value !== null)

function podeSoltarEm(folderId) {
  if (!crud.update || dragFlowId.value === null) return false
  const f = flows.value.find((x) => x.id === dragFlowId.value)
  return !!f && (f.folder_id ?? null) !== (folderId ?? null)
}

function onDragStart(flow, ev) {
  if (!crud.update) return
  closeMenu()
  dragFlowId.value = flow.id
  ev.dataTransfer.effectAllowed = 'move'
  // alguns navegadores cancelam o arrasto sem payload
  ev.dataTransfer.setData('text/plain', String(flow.id))
}

function onDragEnd() {
  dragFlowId.value = null
  dropAlvo.value = undefined
}

function onDragOver(folderId, ev) {
  if (!podeSoltarEm(folderId)) return
  ev.preventDefault()
  ev.dataTransfer.dropEffect = 'move'
  dropAlvo.value = folderId ?? null
}

function onDragLeave(folderId) {
  if (dropAlvo.value === (folderId ?? null)) dropAlvo.value = undefined
}

async function onDrop(folderId, ev) {
  if (!podeSoltarEm(folderId)) return
  ev.preventDefault()
  const flow = flows.value.find((x) => x.id === dragFlowId.value)
  onDragEnd()
  if (flow) await moveTo(flow, folderId ?? null)
}
</script>

<template>
  <div class="mf-list" @click="closeMenu">
    <header class="mf-list__head">
      <div>
        <h2 class="mf-list__title">Fluxos de mensagem</h2>
        <!-- caminho completo: cada nível navega e cada nível recebe fluxo arrastado -->
        <nav class="mf-list__crumbs">
          <a
            href="#"
            :class="{ 'is-drop': dropAlvo === null && arrastando }"
            @click.prevent="currentFolder = null"
            @dragover="onDragOver(null, $event)"
            @dragleave="onDragLeave(null)"
            @drop="onDrop(null, $event)"
          >Todos os fluxos</a>
          <template v-for="(f, i) in currentPath" :key="f.id">
            <span class="mf-crumb__sep">/</span>
            <strong v-if="i === currentPath.length - 1">{{ f.folder_name }}</strong>
            <a
              v-else
              href="#"
              :class="{ 'is-drop': dropAlvo === f.id && arrastando }"
              @click.prevent="currentFolder = f.id"
              @dragover="onDragOver(f.id, $event)"
              @dragleave="onDragLeave(f.id)"
              @drop="onDrop(f.id, $event)"
            >{{ f.folder_name }}</a>
          </template>
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
          :class="{ 'is-drop': dropAlvo === folder.id && arrastando }"
          @dblclick="currentFolder = folder.id"
          @dragover="onDragOver(folder.id, $event)"
          @dragleave="onDragLeave(folder.id)"
          @drop="onDrop(folder.id, $event)"
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
        <span v-if="arrastando" class="mf-help">Solte sobre uma pasta — ou sobre o caminho, para tirar da pasta.</span>
      </div>

      <table v-if="visibleFlows.length" class="mf-table">
        <thead>
          <tr>
            <th>Nome</th>
            <th style="width:150px">Situação</th>
            <th style="width:140px">Última alteração</th>
            <th style="width:44px"></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="flow in visibleFlows"
            :key="flow.id"
            :class="{ 'is-dragging': dragFlowId === flow.id }"
            :draggable="crud.update"
            @dragstart="onDragStart(flow, $event)"
            @dragend="onDragEnd"
            @dblclick="emit('open', flow.id)"
          >
            <td>
              <a href="#" class="mf-table__link" @click.prevent="emit('open', flow.id)">{{ flow.flow_name }}</a>
              <div v-if="flow.description" class="mf-help">{{ flow.description }}</div>
            </td>
            <td>
              <!--
                Dois controles independentes (decisão de 2026-07-29):
                  badge = está no ar ou não · ponto = o salvo está em dia ou não.
                Versão (v1, v2…) saiu daqui — segue viva em msgflow_flow_versions.
              -->
              <span class="mf-status">
                <span
                  class="mf-dot"
                  :class="flow.has_draft ? 'is-warn' : 'is-ok'"
                  :title="flow.has_draft
                    ? 'Há alterações salvas em rascunho que ainda não foram publicadas.'
                    : 'Não há alterações pendentes.'"
                ></span>
                <span class="mf-badge" :class="{ 'mf-badge--ok': flow.version > 0 }">
                  {{ flow.version > 0 ? 'Publicado' : 'Não publicado' }}
                </span>
              </span>
            </td>
            <td style="color: var(--text2)">{{ formatDate(flow.updated_at) }}</td>
            <td>
              <button class="mf-btn mf-btn--ghost mf-btn--sm" title="Mais ações" @click.stop="toggleMenu(flow, $event)">⋮</button>
            </td>
          </tr>
        </tbody>
      </table>

      <div v-else class="mf-empty">
        <p v-if="search">Nenhum fluxo encontrado para “{{ search }}”.</p>
        <template v-else>
          <p>Nenhum fluxo {{ currentPath.length ? 'nesta pasta' : 'ainda' }}.</p>
          <button v-if="crud.create" class="mf-btn mf-btn--primary" @click="askNewFlow">Criar o primeiro fluxo</button>
        </template>
      </div>
    </template>

    <Teleport to="body">
      <div
        v-if="menuFor !== null"
        ref="menuEl"
        class="mf-menu"
        :style="{ left: `${menuPos.left}px`, top: `${menuPos.top}px`, maxHeight: `${menuPos.maxHeight}px` }"
        @click.stop
      >
        <template v-for="flow in flows.filter((f) => f.id === menuFor)" :key="flow.id">
          <button @click="closeMenu(); emit('open', flow.id)">Abrir</button>
          <button v-if="crud.create" @click="cloneFlow(flow)">Duplicar</button>
          <button v-if="crud.update" @click="closeMenu(); askRenameFlow(flow)">Renomear</button>
          <button @click="exportFlow(flow)">Exportar JSON</button>
          <template v-if="crud.update">
            <div class="mf-menu__sep"></div>
            <div class="mf-menu__label">Mover para</div>
            <button v-if="flow.folder_id !== null" @click="moveTo(flow, null)">Raiz</button>
            <button
              v-for="f in moveTargets.filter((x) => x.id !== flow.folder_id)"
              :key="f.id"
              @click="moveTo(flow, f.id)"
            >{{ pathLabel(f.id) }}</button>
          </template>
          <template v-if="crud.delete">
            <div class="mf-menu__sep"></div>
            <button class="is-danger" @click="closeMenu(); askDeleteFlow(flow)">Excluir</button>
          </template>
        </template>
      </div>
    </Teleport>

    <ModalDialog
      :open="dialog.open"
      :title="dialog.title"
      :message="dialog.message"
      :label="dialog.label"
      :model-value="dialog.value"
      :placeholder="dialog.placeholder"
      :confirm-label="dialog.confirmLabel"
      :danger="dialog.danger"
      :error="dialog.error"
      @confirm="onDialogConfirm"
      @cancel="closeDialog"
    />
  </div>
</template>

<style scoped>
.mf-list { flex: 1; overflow-y: auto; padding: 20px 24px; }
.mf-list__head { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 20px; flex-wrap: wrap; }
.mf-list__title { margin: 0; font-size: 18px; }
.mf-list__crumbs { font-size: 12px; color: var(--text2); margin-top: 4px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.mf-list__crumbs a { color: var(--accent2); text-decoration: none; padding: 2px 6px; border-radius: 5px; border: 1px solid transparent; }
.mf-list__crumbs a:hover { background: var(--surface2); }
.mf-list__crumbs a.is-drop { border-color: var(--accent); background: var(--surface2); color: var(--text); }
.mf-list__toolbar { margin-bottom: 12px; display: flex; align-items: center; gap: 12px; }

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
.mf-folder.is-drop { border-color: var(--accent); background: var(--surface2); box-shadow: 0 0 0 2px var(--accent) inset; }
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
.mf-table tr[draggable='true'] { cursor: grab; }
.mf-table tr.is-dragging td { opacity: .45; }
.mf-table__link { color: var(--text); text-decoration: none; font-weight: 500; }
.mf-table__link:hover { color: var(--accent2); }
</style>

<style>
/* Sem `scoped`: o menu vive no <body> via Teleport e não recebe o atributo de escopo. */
.mf-menu {
  position: fixed;
  z-index: 120;
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 4px;
  min-width: 190px;
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
  white-space: nowrap;
}
.mf-menu button:hover { background: var(--bg); }
.mf-menu button.is-danger { color: var(--error); }
.mf-menu__sep { height: 1px; background: var(--border); margin: 4px 0; }
.mf-menu__label { font-size: 10px; text-transform: uppercase; color: var(--text2); padding: 4px 10px; letter-spacing: .5px; }
</style>
