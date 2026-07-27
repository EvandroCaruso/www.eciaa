<script setup>
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { handleIdFor } from '../core/graph.js'

const props = defineProps({
  data: { type: Object, required: true },
  selected: { type: Boolean, default: false }
})

const spec = computed(() => props.data.spec || {})
const color = computed(() => spec.value.color || 'var(--accent)')
const outputs = computed(() => spec.value.outputs || [{ key: 'main', label: '' }])
const isStart = computed(() => props.data.nodeType === 'eciaa.start')

/** Prévia do conteúdo dentro do cartão — o que dá leitura ao canvas. */
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
    <Handle v-if="!isStart" type="target" :position="Position.Left" id="in-0" />

    <div class="mf-node__head">
      <span class="mf-node__icon">{{ spec.icon || '⬜' }}</span>
      <div style="min-width:0; flex:1">
        <div class="mf-node__name">{{ data.name }}</div>
        <div class="mf-node__type">{{ spec.label || data.nodeType }}</div>
      </div>
    </div>

    <div class="mf-node__body">{{ preview }}</div>

    <div class="mf-node__outputs">
      <div v-for="(out, i) in outputs" :key="out.key" class="mf-node__output">
        {{ out.label }}
        <Handle type="source" :position="Position.Right" :id="handleIdFor(i)" />
      </div>
    </div>
  </div>
</template>
