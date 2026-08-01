<script setup>
/**
 * Popover "Selecionar Condição": seções com busca.
 *
 * Estrutura irmã do `VarPicker`, mas NÃO é ele: o VarPicker é peça viva do bloco
 * Conteúdo, tem duas seções fixas, emite uma string e prende o clique-fora a um
 * atributo `data-var-btn` hardcoded. Aqui são três seções, três fontes de erro
 * independentes e uma referência estruturada. Duplicar ~40 linhas foi escolha
 * consciente para não mexer no Conteúdo — a dívida está registrada em operacao.md.
 *
 * Teleport + fixed pelo mesmo motivo do ConditionEditor: o painel recorta.
 */
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { posicionaNoDom } from '../core/popover.js'

const props = defineProps({
  // [{ titulo, itens: [{ chave, label, ref }] }]
  secoes: { type: Array, required: true },
  avisos: { type: Array, default: () => [] },
  anchor: { type: Object, required: true },
  // o elemento que abriu — precisa ser IGNORADO pelo clique-fora, senão o próprio
  // botão vira um toggle que fecha e reabre em alternância. O VarPicker resolve o
  // mesmo problema com um seletor `data-var-btn` hardcoded; aqui é por referência.
  gatilho: { type: Object, default: null }
})
const emit = defineEmits(['pick', 'close'])

const caixa = ref(null)
const entrada = ref(null)
const busca = ref('')
const pos = ref({ left: -9999, top: -9999, maxHeight: 340 })

const filtradas = computed(() => {
  const q = busca.value.trim().toLowerCase()
  return props.secoes
    .map((s) => ({
      ...s,
      itens: q ? s.itens.filter((i) => String(i.label || '').toLowerCase().includes(q)) : s.itens
    }))
    .filter((s) => s.itens.length)
})

const vazio = computed(() => filtradas.value.length === 0)

function primeiro() {
  const s = filtradas.value[0]
  return s ? s.itens[0] : null
}

function foraDaCaixa(e) {
  if (!caixa.value || caixa.value.contains(e.target)) return
  if (props.gatilho && props.gatilho.contains(e.target)) return
  emit('close')
}
function noEsc(e) {
  if (e.key === 'Escape') { e.stopPropagation(); emit('close') }
}

/**
 * ⚠️ O listener é de CAPTURA na window (scroll não borbulha), então ele enxerga
 * também o scroll da lista AQUI DENTRO. Fechar sem checar a origem fazia a lista
 * se autodestruir ao rolar o mouse ou ao arrastar a barra — o defeito relatado na
 * homologação de 31/07. Rolagem interna é navegação, não movimento da página.
 */
function onScroll(e) {
  if (caixa.value && e.target && caixa.value.contains(e.target)) return
  regruda()
}

/** A página andou: em vez de fechar, o popover volta a colar no gatilho. */
function regruda() {
  const el = props.gatilho
  if (!el || !el.getBoundingClientRect) return emit('close')
  pos.value = posicionaNoDom(el.getBoundingClientRect(), caixa.value, { alinha: 'direita' })
}

onMounted(async () => {
  await nextTick()
  pos.value = posicionaNoDom(props.anchor, caixa.value, { alinha: 'direita' })
  if (entrada.value) entrada.value.focus()
  // o clique que ABRE já terminou quando este listener entra, então não fecha na sequência
  document.addEventListener('mousedown', foraDaCaixa)
  document.addEventListener('keydown', noEsc)
  window.addEventListener('scroll', onScroll, true)
  window.addEventListener('resize', regruda)
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', foraDaCaixa)
  document.removeEventListener('keydown', noEsc)
  window.removeEventListener('scroll', onScroll, true)
  window.removeEventListener('resize', regruda)
})
</script>

<template>
  <Teleport to="body">
    <div
      ref="caixa"
      class="mf-cp"
      :style="{ left: pos.left + 'px', top: pos.top + 'px', maxHeight: pos.maxHeight + 'px' }"
    >
      <input
        ref="entrada"
        v-model="busca"
        class="mf-cp__busca"
        placeholder="Buscar condição"
        @keydown.enter.prevent="primeiro() && emit('pick', primeiro().ref)"
      />

      <div class="mf-cp__lista">
        <template v-for="s in filtradas" :key="s.titulo">
          <div class="mf-cp__titulo">{{ s.titulo }}</div>
          <button
            v-for="i in s.itens"
            :key="i.chave"
            class="mf-cp__item"
            @click="emit('pick', i.ref)"
          >{{ i.label }}</button>
        </template>

        <div v-if="vazio" class="mf-cp__vazio">Nenhuma condição com esse nome.</div>

        <!-- degradação visível: seção vazia é explicada, não some sem dizer nada -->
        <div v-for="(a, k) in avisos" :key="k" class="mf-cp__aviso">{{ a }}</div>
      </div>
    </div>
  </Teleport>
</template>

<!-- sem `scoped`: nó teleportado não recebe o atributo de escopo -->
<style>
.mf-cp {
  position: fixed;
  z-index: 60;
  width: 300px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, .38);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.mf-cp__busca {
  width: 100%;
  border: 0;
  border-bottom: 1px solid var(--border);
  background: transparent;
  color: var(--text);
  padding: 10px 12px;
  font-size: 13px;
  outline: none;
}
.mf-cp__lista { flex: 1; min-height: 0; overflow-y: auto; padding: 6px 0; }
.mf-cp__titulo {
  padding: 8px 12px 4px;
  font-size: 10px;
  letter-spacing: .08em;
  color: var(--text2);
}
.mf-cp__item {
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
.mf-cp__item:hover { background: var(--surface2); }
.mf-cp__vazio, .mf-cp__aviso { padding: 10px 12px; font-size: 12px; color: var(--text2); }
.mf-cp__aviso { border-top: 1px solid var(--border); }
</style>
