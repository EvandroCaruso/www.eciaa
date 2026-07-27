<script setup>
/**
 * Casca do mini-app: alterna entre a lista e o editor.
 *
 * Sem router de URL de propósito — o app vive dentro de um iframe cuja URL não
 * pode mudar (é o que faz o botão Voltar do Hub continuar funcionando).
 */
import { ref } from 'vue'
import FlowList from './components/FlowList.vue'
import FlowEditor from './components/FlowEditor.vue'
import { isMock, clientId } from './lib/api.js'

const screen = ref('list')
const currentFlowId = ref(null)
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

function backToList() {
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
      @open="openFlow"
      @toast="showToast"
    />

    <FlowEditor
      v-else
      :key="currentFlowId"
      :flow-id="currentFlowId"
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
