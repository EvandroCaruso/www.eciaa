<script setup>
/**
 * Campo de texto da mensagem: marcadores do WhatsApp + variáveis do contato.
 *
 * A pílula colorida é PINTURA, não conteúdo: um `<div>` de realce fica atrás de um
 * `<textarea>` comum, com a mesma tipografia, e o texto do textarea é
 * transparente (só o cursor aparece). Assim cursor, seleção, colar e desfazer
 * continuam sendo os do navegador.
 *
 * ⚠️ Foi escolha consciente não usar `contenteditable`: a promessa é inserir no
 * ponto do cursor, e é exatamente aí que ele quebra dentro de iframe `sandbox`
 * com origem `null` — que é como este app roda no Chatwoot.
 *
 * Só o que muda em cima do textarea nativo mora aqui; a regra de string mora em
 * `core/vars.js`, testada.
 */
import { computed, ref, nextTick, onMounted } from 'vue'
import { splitByVars, insertVar, wrapSelection } from '../core/vars.js'
import { fetchContactFields } from '../lib/api.js'
import VarPicker from './VarPicker.vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  rows: { type: Number, default: 4 },
  placeholder: { type: String, default: '' },
  readonly: { type: Boolean, default: false },
  vars: { type: Boolean, default: true }
})
const emit = defineEmits(['update:modelValue'])

const area = ref(null)
const realce = ref(null)
const picker = ref(false)
const campos = ref({ system: [], client: [], client_error: null })

const conhecidas = computed(
  () => new Set([...(campos.value.system || []), ...(campos.value.client || [])].map((c) => c.key))
)
const partes = computed(() => splitByVars(props.modelValue, conhecidas.value))

function sel() {
  const el = area.value
  return el ? [el.selectionStart, el.selectionEnd] : [props.modelValue.length, props.modelValue.length]
}

async function aplicar({ text, cursor }) {
  emit('update:modelValue', text)
  await nextTick()
  const el = area.value
  if (el) { el.focus(); el.setSelectionRange(cursor, cursor) }
}

function marcar(m) {
  if (props.readonly) return
  const [a, b] = sel()
  aplicar(wrapSelection(props.modelValue, a, b, m))
}

// ⚠️ Carregar só ao abrir a paleta pintava TODA variável de vermelho até alguém
// clicar no [+]: sem catálogo, nada é "conhecido", e um texto escrito ontem
// aparecia como se estivesse quebrado. A chamada é memoizada — uma por sessão.
onMounted(async () => {
  if (props.vars) campos.value = await fetchContactFields()
})

async function abrirPaleta() {
  if (props.readonly) return
  if (!picker.value) campos.value = await fetchContactFields()
  picker.value = !picker.value
}

function escolher(key) {
  const [a, b] = sel()
  picker.value = false
  aplicar(insertVar(props.modelValue, a, b, key))
}

/** O realce não rola sozinho: ele acompanha o textarea. */
function sincronizaScroll() {
  if (realce.value && area.value) {
    realce.value.scrollTop = area.value.scrollTop
    realce.value.scrollLeft = area.value.scrollLeft
  }
}
</script>

<template>
  <div class="mf-rt">
    <div class="mf-rt__campo">
      <!-- camada de baixo: o texto que se VÊ -->
      <div ref="realce" class="mf-rt__hl" aria-hidden="true">
        <template v-for="(p, i) in partes" :key="i">
          <span v-if="p.tipo === 'texto'">{{ p.valor }}</span>
          <span v-else class="mf-rt__var" :class="{ 'is-unknown': !p.conhecida }">{{ p.valor }}</span>
        </template><span>&#8203;</span>
      </div>

      <!-- camada de cima: o textarea de verdade, com o texto invisível -->
      <textarea
        ref="area"
        class="mf-rt__ta"
        :rows="rows"
        :placeholder="placeholder"
        :disabled="readonly"
        :value="modelValue"
        spellcheck="false"
        @input="emit('update:modelValue', $event.target.value)"
        @scroll="sincronizaScroll"
      ></textarea>
    </div>

    <div class="mf-rt__barra">
      <button class="mf-rt__btn" title="Negrito" :disabled="readonly" @click="marcar('*')"><b>B</b></button>
      <button class="mf-rt__btn" title="Itálico" :disabled="readonly" @click="marcar('_')"><i>I</i></button>
      <button class="mf-rt__btn" title="Tachado" :disabled="readonly" @click="marcar('~')"><s>S</s></button>
      <span v-if="vars" class="mf-rt__sep"></span>
      <button
        v-if="vars"
        data-var-btn
        class="mf-rt__btn mf-rt__btn--var"
        title="Inserir variável do contato"
        :disabled="readonly"
        @click="abrirPaleta"
      >[+]</button>

      <VarPicker
        v-if="picker"
        :campos="campos"
        style="top: 100%; left: 0; margin-top: 6px"
        @pick="escolher"
        @close="picker = false"
      />
    </div>
  </div>
</template>

<style scoped>
.mf-rt { position: relative; }
.mf-rt__campo { position: relative; }

/* As duas camadas TÊM de ter a mesma métrica; qualquer divergência de fonte,
   padding ou line-height desalinha a pílula do texto. */
.mf-rt__hl, .mf-rt__ta {
  font-family: inherit;
  font-size: 13px;
  line-height: 1.5;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px 8px 0 0;
  white-space: pre-wrap;
  overflow-wrap: break-word;
  box-sizing: border-box;
  width: 100%;
}
.mf-rt__hl {
  position: absolute;
  inset: 0;
  overflow: hidden;
  color: var(--text);
  background: var(--bg);
  pointer-events: none;
}
.mf-rt__ta {
  position: relative;
  background: transparent;
  color: transparent;
  caret-color: var(--text);
  resize: vertical;
  outline: none;
}
.mf-rt__ta:focus { border-color: var(--accent); }
.mf-rt__ta::placeholder { color: var(--text2); }

.mf-rt__var {
  background: rgba(99, 102, 241, .22);
  color: var(--accent);
  border-radius: 4px;
  padding: 1px 2px;
}
/* variável que a paleta não oferece fica sem pintura de "ok": é o aviso de que
   ela não vai resolver no envio (o executor manda vazio) */
.mf-rt__var.is-unknown {
  background: rgba(239, 68, 68, .18);
  color: var(--error);
  text-decoration: underline dotted;
}

.mf-rt__barra {
  position: relative;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px 6px;
  border: 1px solid var(--border);
  border-top: 0;
  border-radius: 0 0 8px 8px;
  background: var(--surface);
}
.mf-rt__btn {
  min-width: 26px;
  height: 24px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--text2);
  cursor: pointer;
  font-size: 12px;
}
.mf-rt__btn:hover:not(:disabled) { background: var(--surface2); color: var(--text); }
.mf-rt__btn:disabled { opacity: .4; cursor: default; }
.mf-rt__btn--var { color: var(--accent); font-weight: 600; }
.mf-rt__sep { width: 1px; height: 14px; margin: 0 4px; background: var(--border); }
</style>
