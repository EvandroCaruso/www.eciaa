<script setup>
/**
 * Casca do mini-app: alterna entre a lista e o editor.
 *
 * Sem router de URL de propósito — o app vive dentro de um iframe cuja URL não
 * pode mudar (é o que faz o botão Voltar do Hub continuar funcionando).
 *
 * A pasta corrente e a árvore de pastas moram AQUI, não na lista: a lista é
 * destruída ao abrir o editor, e o editor precisa devolver o usuário à pasta de
 * origem do fluxo — com o estado dentro da lista, todo Voltar caía na raiz.
 */
import { ref } from 'vue'
import FlowList from './components/FlowList.vue'
import FlowEditor from './components/FlowEditor.vue'
import { isMock, clientId } from './lib/api.js'

const screen = ref('list')
const currentFlowId = ref(null)
const currentFolder = ref(null)
const folders = ref([])
// os demais fluxos do cliente, para o rename inline do editor validar nome único
const flows = ref([])
// ordenação da lista: mesma razão da pasta — sobrevive à ida e volta ao editor
const sortBy = ref('name')
const sortDir = ref('asc')
const toast = ref(null)
let toastTimer = null

function showToast(payload) {
  toast.value = payload
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = null }, payload.type === 'error' ? 6000 : 3000)
}

function openFlow(id) {
  currentFlowId.value = id
  screen.value = 'editor'
}

/**
 * `folderId` vem do editor:
 *   number    → pasta do fluxo (ou a que ele clicou no caminho)
 *   null      → raiz
 *   undefined → o backend não informou a pasta; mantém onde a lista estava
 */
function backToList(folderId) {
  if (folderId !== undefined) currentFolder.value = folderId
  currentFlowId.value = null
  screen.value = 'list'
}
</script>

<template>
  <div class="mf-app">
    <div v-if="isMock" class="mf-devbar">
      modo desenvolvimento — dados falsos em memória (cliente {{ clientId }})
    </div>

    <FlowList
      v-if="screen === 'list'"
      v-model:folder-id="currentFolder"
      v-model:sort-by="sortBy"
      v-model:sort-dir="sortDir"
      @open="openFlow"
      @toast="showToast"
      @folders="folders = $event"
      @flows="flows = $event"
    />

    <FlowEditor
      v-else
      :key="currentFlowId"
      :flow-id="currentFlowId"
      :folders="folders"
      :flows="flows"
      @back="backToList"
      @toast="showToast"
    />

    <div v-if="toast" class="mf-toast" :class="`mf-toast--${toast.type}`">{{ toast.text }}</div>
  </div>
</template>

<style scoped>
.mf-devbar {
  background: var(--warn);
  color: #1a1d27;
  font-size: 11px;
  text-align: center;
  padding: 3px;
  font-weight: 600;
}
</style>
