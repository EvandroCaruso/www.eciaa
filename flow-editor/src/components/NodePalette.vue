<script setup>
/**
 * Paleta lateral. O conteúdo vem inteiro de msgflow_node_types — nenhum tipo de
 * nó está codificado aqui. Adicionar "Menu" ao produto é um INSERT no banco.
 */
defineProps({
  types: { type: Array, required: true },
  disabled: { type: Boolean, default: false }
})

const CATEGORIES = [
  { key: 'trigger', label: 'Início' },
  { key: 'message', label: 'Mensagem' },
  { key: 'logic', label: 'Lógica' },
  { key: 'action', label: 'Ações' },
  { key: 'integration', label: 'Integrações' }
]

function onDragStart(event, type) {
  event.dataTransfer.setData('application/msgflow-type', type.node_type)
  event.dataTransfer.effectAllowed = 'move'
}
</script>

<template>
  <aside class="mf-palette">
    <div class="mf-palette__title">Blocos</div>
    <p class="mf-palette__hint">Arraste para o canvas</p>

    <template v-for="cat in CATEGORIES" :key="cat.key">
      <div v-if="types.some((t) => t.category === cat.key)" class="mf-palette__group">
        <div class="mf-palette__group-label">{{ cat.label }}</div>
        <div
          v-for="t in types.filter((x) => x.category === cat.key)"
          :key="t.node_type"
          class="mf-palette__item"
          :class="{ 'is-disabled': disabled }"
          :style="{ '--node-color': t.color }"
          :draggable="!disabled"
          :title="t.params_schema?.help || t.label"
          @dragstart="onDragStart($event, t)"
        >
          <span class="mf-palette__icon">{{ t.icon }}</span>
          <span>{{ t.label }}</span>
        </div>
      </div>
    </template>
  </aside>
</template>

<style scoped>
.mf-palette {
  width: 190px;
  flex: 0 0 190px;
  background: var(--surface);
  border-right: 1px solid var(--border);
  padding: 14px 12px;
  overflow-y: auto;
}
.mf-palette__title { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .5px; color: var(--text2); }
.mf-palette__hint { font-size: 11px; color: var(--text2); margin: 4px 0 16px; }
.mf-palette__group { margin-bottom: 16px; }
.mf-palette__group-label { font-size: 10px; text-transform: uppercase; color: var(--text2); margin-bottom: 6px; letter-spacing: .5px; }
.mf-palette__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  margin-bottom: 6px;
  background: var(--surface2);
  border: 1px solid var(--border);
  border-left: 3px solid var(--node-color, var(--accent));
  border-radius: 6px;
  cursor: grab;
  user-select: none;
}
.mf-palette__item:hover { border-color: var(--accent); border-left-color: var(--node-color, var(--accent)); }
.mf-palette__item.is-disabled { opacity: .4; cursor: not-allowed; }
.mf-palette__icon { font-size: 15px; }
</style>
