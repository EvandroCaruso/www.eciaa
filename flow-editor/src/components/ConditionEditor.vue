<script setup>
/**
 * Popover de DOIS PAINÉIS: operadores à esquerda, valor à direita.
 *
 * ⚠️ Teleport + position:fixed, não absolute. O `.mf-props__body` tem
 * `overflow-y: auto`, e overflow vale para os dois eixos: um popover absolute
 * dentro dele seria RECORTADO — e este tem 520 px contra os 320 px do painel,
 * então não haveria como caber por dentro. A aritmética de flip/clamp está em
 * core/popover.js, testada.
 *
 * Sem botão Salvar, de propósito (decisão do Evandro): escolher já aplica. O
 * rascunho local existe mesmo assim para o Ctrl+Z contar UM passo por popover —
 * o histórico do editor guarda o grafo inteiro serializado a cada update, então
 * emitir por tecla encheria o undo de lixo.
 */
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { operadoresDe, operadorSpec, trocaOperador } from '../core/condition.js'
import { posicionaNoDom } from '../core/popover.js'
import ConditionValueEditor from './ConditionValueEditor.vue'

const props = defineProps({
  condition: { type: Object, required: true },
  titulo: { type: String, default: '' },
  catalogo: { type: Object, default: () => ({}) },
  anchor: { type: Object, required: true },
  // o card que abriu: sem ignorá-lo, clicar nele fecha e reabre em alternância
  gatilho: { type: Object, default: null },
  readonly: { type: Boolean, default: false }
})
const emit = defineEmits(['update', 'close'])

const caixa = ref(null)
const pos = ref({ left: -9999, top: -9999, maxHeight: 380 })
const rascunho = ref(JSON.parse(JSON.stringify(props.condition)))

const operadores = computed(() => operadoresDe(rascunho.value))
const spec = computed(() => operadorSpec(rascunho.value))
const editor = computed(() => (spec.value ? spec.value.editor : 'none'))

function selecionaOperador(id) {
  if (props.readonly) return
  // trocaOperador preserva o valor quando a aridade não muda: trocar "É" por
  // "Contém" não pode apagar o que a pessoa já digitou
  rascunho.value = trocaOperador(rascunho.value, id)
}

function setValor(v) {
  if (v === undefined) delete rascunho.value.value
  else rascunho.value.value = v
}

/** Escolher numa lista aplica e fecha — é um gesto só, como na referência. */
function escolheuNaLista(rotulo) {
  if (rascunho.value.subject === 'assignee') {
    if ('value' in rascunho.value) rascunho.value.value_label = rotulo
    else delete rascunho.value.value_label
  }
  fechar()
}

function fechar() {
  emit('update', rascunho.value)
  emit('close')
}

function foraDaCaixa(e) {
  if (!caixa.value || caixa.value.contains(e.target)) return
  if (props.gatilho && props.gatilho.contains(e.target)) return
  fechar()
}
function noEsc(e) {
  if (e.key === 'Escape') { e.stopPropagation(); fechar() }
}
// Popover fixo não acompanha a rolagem: em vez de recalcular, fecha (aplicando).
function onWindowChange() { fechar() }

async function posicionar() {
  await nextTick()
  pos.value = posicionaNoDom(props.anchor, caixa.value, { alinha: 'direita' })
}

onMounted(async () => {
  await posicionar()
  document.addEventListener('mousedown', foraDaCaixa)
  document.addEventListener('keydown', noEsc)
  window.addEventListener('scroll', onWindowChange, true)
  window.addEventListener('resize', onWindowChange)
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', foraDaCaixa)
  document.removeEventListener('keydown', noEsc)
  window.removeEventListener('scroll', onWindowChange, true)
  window.removeEventListener('resize', onWindowChange)
})
</script>

<template>
  <Teleport to="body">
    <div
      ref="caixa"
      class="mf-ce"
      :style="{ left: pos.left + 'px', top: pos.top + 'px', maxHeight: pos.maxHeight + 'px' }"
    >
      <div class="mf-ce__ops">
        <div class="mf-ce__titulo">{{ (titulo || '').toUpperCase() }}</div>
        <button
          v-for="op in operadores"
          :key="op.id"
          class="mf-ce__op"
          :class="{ 'is-on': rascunho.op === op.id }"
          :disabled="readonly"
          @click="selecionaOperador(op.id)"
        >{{ op.label }}</button>
      </div>

      <div class="mf-ce__valor">
        <ConditionValueEditor
          :key="rascunho.op"
          :editor="editor"
          :aridade="spec ? spec.aridade : 0"
          :model-value="rascunho.value"
          :catalogo="catalogo"
          :readonly="readonly"
          @update:model-value="setValor"
          @escolheu="escolheuNaLista"
        />
      </div>
    </div>
  </Teleport>
</template>

<!-- sem `scoped`: nó teleportado para o <body> não recebe o atributo de escopo -->
<style>
.mf-ce {
  position: fixed;
  z-index: 60;
  display: flex;
  width: 520px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, .38);
  overflow: hidden;
}
.mf-ce__ops {
  width: 200px;
  flex: 0 0 200px;
  border-right: 1px solid var(--border);
  padding: 6px 0;
  overflow-y: auto;
}
.mf-ce__titulo {
  padding: 8px 12px 6px;
  font-size: 10px;
  letter-spacing: .08em;
  color: var(--text2);
}
.mf-ce__op {
  display: block;
  width: 100%;
  padding: 7px 12px;
  border: 0;
  background: transparent;
  color: var(--text);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.mf-ce__op:hover:not(:disabled) { background: var(--surface2); }
.mf-ce__op.is-on { color: var(--accent); font-weight: 600; }
.mf-ce__valor { flex: 1; min-width: 0; display: flex; flex-direction: column; }
</style>
