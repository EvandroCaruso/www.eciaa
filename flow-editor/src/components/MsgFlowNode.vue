<script setup>
import { computed, inject } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { handleIdFor } from '../core/graph.js'
import { linhasDoBloco, linhasDaCondicao } from '../core/preview.js'
import { subTypesFrom } from '../core/subblocks.js'
import { normalizeParameters, sujeitosDoCampo, fraseVerdadeiro } from '../core/condition.js'

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
  if (isStart.value) return 'O fluxo começa aqui'
  return ''
})

/**
 * Sequência do Conteúdo e lista da Condição: UMA linha por parte. As duas vêm de
 * core/preview.js, a mesma função que o painel usa — recalcular aqui foi o que
 * fez o indicador 🟢/🟡 divergir entre as duas telas, e era também o que o
 * `labelOp()` deste arquivo fazia com os rótulos de operador (removido).
 */
const linhas = computed(() => {
  const p = props.data.parameters || {}

  if (props.data.nodeType === 'eciaa.content') {
    const campoBlocks = (schema.value.fields || []).find((f) => f.type === 'blocks')
    return linhasDoBloco(p, subTypesFrom(campoBlocks))
  }

  if (props.data.nodeType === 'eciaa.condition') {
    const campo = (schema.value.fields || []).find((f) => f.type === 'condition-list')
    // Sem catálogo vivo aqui de propósito: o card cai na fotografia gravada
    // (field_label, value_label), que é o que o mantém legível com o cwmkt fora.
    return linhasDaCondicao(normalizeParameters(p), { sujeitos: sujeitosDoCampo(campo) })
  }

  return []
})

/** Frase da saída Verdadeiro, no topo do corpo — muda com o modo E/Ou. */
const cabecalhoCondicao = computed(() => {
  if (props.data.nodeType !== 'eciaa.condition' || !linhas.value.length) return ''
  return fraseVerdadeiro(normalizeParameters(props.data.parameters || {}).mode)
})
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

    <div v-if="linhas.length" class="mf-node__body has-outputs mf-node__body--linhas">
      <span v-if="cabecalhoCondicao" class="mf-node__cab">{{ cabecalhoCondicao }}</span>
      <span v-for="(l, i) in linhas" :key="i" :title="l">{{ l }}</span>
    </div>
    <div v-else class="mf-node__body has-outputs">{{ preview }}</div>

    <div class="mf-node__outputs">
      <div v-for="(out, i) in outputs" :key="out.key" class="mf-node__output">
        {{ out.label }}
        <Handle type="source" :position="Position.Right" :id="handleIdFor(i)" />
      </div>
    </div>
  </div>
</template>
