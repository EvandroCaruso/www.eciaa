<script setup>
import { computed, inject } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { handleIdFor } from '../core/graph.js'

const props = defineProps({
  id: { type: String, required: true },
  data: { type: Object, required: true },
  selected: { type: Boolean, default: false }
})

// O editor injeta as ações; assim o nó não precisa emitir para cima nem
// carregar callbacks dentro de `data` (que é serializado no grafo).
const acoes = inject('msgflowAcoes', null)

const spec = computed(() => props.data.spec || {})
const color = computed(() => spec.value.color || 'var(--accent)')
const outputs = computed(() => spec.value.outputs || [{ key: 'main', label: '' }])
const schema = computed(() => spec.value.params_schema || {})
const isStart = computed(() => props.data.nodeType === 'eciaa.start')
const podeExcluir = computed(() => schema.value.deletable !== false)
const podeDuplicar = computed(() => schema.value.singleton !== true)

const preview = computed(() => {
  const p = props.data.parameters || {}
  if (props.data.nodeType === 'eciaa.content') return p.text || ''
  if (props.data.nodeType === 'eciaa.condition') {
    const rules = p.rules || []
    if (!rules.length) return ''
    const join = p.mode === 'ANY' ? ' ou ' : ' e '
    return rules
      .map((r) => `${r.attr} ${labelOp(r.op)} ${r.op === 'exists' ? '' : `"${r.value ?? ''}"`}`.trim())
      .join(join)
  }
  if (isStart.value) return 'O fluxo começa aqui'
  return ''
})

function labelOp(op) {
  return { equals: 'é igual a', contains: 'contém', exists: 'existe' }[op] || op
}
</script>

<template>
  <div class="mf-node" :class="{ 'is-selected': selected }" :style="{ '--node-color': color }">
    <!-- atalhos rápidos: aparecem no hover ou com o bloco selecionado -->
    <div v-if="acoes" class="mf-node__tools nodrag nopan">
      <button
        v-if="podeDuplicar"
        class="mf-node__tool"
        title="Duplicar bloco (Ctrl+D)"
        @click.stop="acoes.duplicar(id)"
      >⧉</button>
      <button
        class="mf-node__tool mf-node__tool--danger"
        :disabled="!podeExcluir"
        :title="podeExcluir ? 'Excluir bloco (Del)' : 'O bloco de Início não pode ser excluído'"
        @click.stop="podeExcluir && acoes.excluir(id)"
      >✕</button>
    </div>

    <Handle v-if="!isStart" type="target" :position="Position.Left" id="in-0" />

    <div class="mf-node__head">
      <span class="mf-node__icon">{{ spec.icon || '⬜' }}</span>
      <div style="min-width:0; flex:1">
        <div class="mf-node__name">{{ data.name }}</div>
        <div class="mf-node__type">{{ spec.label || data.nodeType }}</div>
      </div>
    </div>

    <div class="mf-node__body has-outputs">{{ preview }}</div>

    <div class="mf-node__outputs">
      <div v-for="(out, i) in outputs" :key="out.key" class="mf-node__output">
        {{ out.label }}
        <Handle type="source" :position="Position.Right" :id="handleIdFor(i)" />
      </div>
    </div>
  </div>
</template>
