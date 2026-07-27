<script setup>
/**
 * Seletor de blocos — abre pelo "+" no canto do canvas, como no n8n.
 *
 * O conteúdo vem inteiro de msgflow_node_types: nenhum tipo está codificado aqui.
 * Tipos marcados como `singleton` que já existem no fluxo não aparecem — é por
 * isso que o bloco de Início some da lista depois que o fluxo o tem.
 */
const props = defineProps({
  types: { type: Array, required: true },
  jaNoFluxo: { type: Array, default: () => [] } // node_types já presentes
})

const emit = defineEmits(['inserir', 'fechar'])

const CATEGORIAS = [
  { key: 'trigger', label: 'Início' },
  { key: 'message', label: 'Mensagem' },
  { key: 'logic', label: 'Lógica' },
  { key: 'action', label: 'Ações' },
  { key: 'integration', label: 'Integrações' }
]

function disponivel(t) {
  const unico = t.params_schema?.singleton === true
  return !(unico && props.jaNoFluxo.includes(t.node_type))
}

function doCategoria(cat) {
  return props.types.filter((t) => t.category === cat && disponivel(t))
}

function onDragStart(event, type) {
  event.dataTransfer.setData('application/msgflow-type', type.node_type)
  event.dataTransfer.effectAllowed = 'move'
  emit('fechar')
}
</script>

<template>
  <div class="mf-picker nodrag nopan" @click.stop>
    <div class="mf-picker__title">Adicionar bloco</div>
    <p class="mf-picker__hint">Clique para inserir, ou arraste para o canvas.</p>

    <template v-for="cat in CATEGORIAS" :key="cat.key">
      <template v-if="doCategoria(cat.key).length">
        <div class="mf-picker__group-label">{{ cat.label }}</div>
        <button
          v-for="t in doCategoria(cat.key)"
          :key="t.node_type"
          class="mf-picker__item"
          :style="{ '--node-color': t.color }"
          :title="t.params_schema?.help || t.label"
          draggable="true"
          @dragstart="onDragStart($event, t)"
          @click="emit('inserir', t.node_type)"
        >
          <span class="mf-picker__icon">{{ t.icon }}</span>
          <span>{{ t.label }}</span>
        </button>
      </template>
    </template>

    <p v-if="!types.some(disponivel)" class="mf-picker__empty">
      Nenhum bloco disponível para adicionar.
    </p>
  </div>
</template>
