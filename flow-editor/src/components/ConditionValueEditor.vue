<script setup>
/**
 * O painel DIREITO do editor de condição: o valor.
 *
 * Um `switch` por tipo de editor, e o tipo vem do catálogo de operadores
 * (core/condition.js) — não do componente. Operador de aridade 0 declara
 * `editor: 'none'` e aqui não desenha nada.
 *
 * Listas (etiqueta, dia, membro) aceitam também VALOR LIVRE, de propósito: com o
 * cwmkt fora do ar a lista nasce vazia, e quem sabe o nome da etiqueta não pode
 * ficar travado. É o mesmo espírito da degradação do client_error.
 */
import { ref, computed, onMounted, nextTick } from 'vue'
import { DIAS_SEMANA } from '../core/condition.js'

const props = defineProps({
  editor: { type: String, required: true },
  aridade: { type: [Number, String], default: 1 },
  modelValue: { default: undefined },
  catalogo: { type: Object, default: () => ({}) },
  readonly: { type: Boolean, default: false }
})
const emit = defineEmits(['update:modelValue', 'escolheu'])

const busca = ref('')
const entrada = ref(null)

const par = computed(() => Number(props.aridade) === 2)

/** Nas listas, a busca serve tanto para filtrar quanto para digitar um valor novo. */
function filtra(lista, campo) {
  const q = busca.value.trim().toLowerCase()
  if (!q) return lista
  return lista.filter((x) => String(x[campo] || '').toLowerCase().includes(q))
}

const etiquetas = computed(() => filtra(props.catalogo.labels || [], 'title'))
const membros = computed(() => filtra(props.catalogo.agents || [], 'name'))
const dias = computed(() => filtra(DIAS_SEMANA, 'label'))

/** Mostra "selecionar «texto»" quando o que foi digitado não está na lista. */
const livre = computed(() => {
  const q = busca.value.trim()
  if (!q) return null
  const jaTem =
    (props.catalogo.labels || []).some((l) => l.title === q) ||
    (props.catalogo.agents || []).some((a) => a.name === q)
  return jaTem ? null : q
})

function escolher(v, rotulo) {
  emit('update:modelValue', v)
  emit('escolheu', rotulo)
}

/**
 * Digitar na busca de ETIQUETA já alimenta o rascunho.
 *
 * ⚠️ Era aqui a perda de dado da homologação de 31/07: o texto vivia só no
 * `busca` e virava valor exclusivamente com um clique em "selecionar «texto»";
 * quem digitava e clicava fora perdia tudo, sem aviso. Agora o ✓ do rodapé salva
 * o que está escrito, como em qualquer campo.
 *
 * ⚠️ Vale só para `label-list`, onde o valor É o texto (o `title` da etiqueta).
 * Em `agent-list` o valor é o ID NUMÉRICO do membro: ligar o texto ali gravaria
 * um nome onde o executor espera número, e a condição morreria em runtime.
 */
function digitouNaBusca() {
  if (props.editor !== 'label-list') return
  const q = busca.value.trim()
  if (q) emit('update:modelValue', q)
}

/** No par (entre), cada ponta é atualizada sem apagar a outra. */
function setPonta(i, v) {
  const atual = Array.isArray(props.modelValue) ? [...props.modelValue] : ['', '']
  atual[i] = v
  emit('update:modelValue', atual)
}
function ponta(i) {
  return Array.isArray(props.modelValue) ? (props.modelValue[i] ?? '') : ''
}

const erroLista = computed(() => {
  if (props.editor === 'label-list') return props.catalogo.labels_error
  if (props.editor === 'agent-list') return props.catalogo.agents_error
  return null
})

onMounted(async () => {
  await nextTick()
  if (entrada.value) entrada.value.focus()
})
</script>

<template>
  <div class="mf-cv">
    <!-- operador sem argumento: o painel direito existe, mas não pergunta nada -->
    <div v-if="editor === 'none'" class="mf-cv__nada">
      Esta condição não precisa de valor.
    </div>

    <!-- listas: etiqueta, dia da semana, membro -->
    <template v-else-if="editor === 'label-list' || editor === 'agent-list' || editor === 'weekday'">
      <input
        v-if="editor !== 'weekday'"
        ref="entrada"
        v-model="busca"
        class="mf-cv__busca"
        placeholder="Pesquisar ou inserir valor"
        :disabled="readonly"
        @input="digitouNaBusca"
      />

      <div class="mf-cv__lista">
        <button
          v-if="editor === 'agent-list'"
          class="mf-cv__item mf-cv__item--solto"
          :class="{ 'is-on': modelValue === undefined }"
          @click="escolher(undefined, 'qualquer membro')"
        >
          Qualquer membro (só precisa ter alguém)
        </button>

        <button
          v-if="livre"
          class="mf-cv__item mf-cv__item--livre"
          @click="escolher(livre, livre)"
        >
          selecionar “{{ livre }}”
        </button>

        <template v-if="editor === 'label-list'">
          <div class="mf-cv__titulo">TODOS</div>
          <button
            v-for="l in etiquetas"
            :key="l.id"
            class="mf-cv__item"
            :class="{ 'is-on': modelValue === l.title }"
            @click="escolher(l.title, l.title)"
          >{{ l.title }}</button>
          <div v-if="!etiquetas.length && !livre" class="mf-cv__vazio">
            Nenhuma etiqueta com esse nome.
          </div>
        </template>

        <template v-if="editor === 'agent-list'">
          <button
            v-for="a in membros"
            :key="a.id"
            class="mf-cv__item"
            :class="{ 'is-on': modelValue === a.id }"
            @click="escolher(a.id, a.name)"
          >{{ a.name }}</button>
          <div v-if="!membros.length && !livre" class="mf-cv__vazio">
            Nenhum membro com esse nome.
          </div>
        </template>

        <template v-if="editor === 'weekday'">
          <button
            v-for="d in dias"
            :key="d.key"
            class="mf-cv__item"
            :class="{ 'is-on': modelValue === d.key }"
            @click="escolher(d.key, d.label)"
          >{{ d.label }}</button>
        </template>

        <!-- degradação visível: a lista vazia é EXPLICADA, não só menor -->
        <div v-if="erroLista" class="mf-cv__aviso">{{ erroLista }}</div>
      </div>
    </template>

    <!-- relógio, calendário, texto e número: uma ponta ou duas -->
    <div v-else class="mf-cv__campos">
      <template v-if="par">
        <label class="mf-label">De</label>
        <input
          ref="entrada"
          class="mf-input"
          :type="editor === 'clock' ? 'time' : editor === 'calendar' ? 'date' : editor === 'number' ? 'number' : 'text'"
          :disabled="readonly"
          :value="ponta(0)"
          @input="setPonta(0, editor === 'number' ? Number($event.target.value) : $event.target.value)"
        />
        <label class="mf-label" style="margin-top:8px">Até</label>
        <input
          class="mf-input"
          :type="editor === 'clock' ? 'time' : editor === 'calendar' ? 'date' : editor === 'number' ? 'number' : 'text'"
          :disabled="readonly"
          :value="ponta(1)"
          @input="setPonta(1, editor === 'number' ? Number($event.target.value) : $event.target.value)"
        />
        <p v-if="editor === 'clock'" class="mf-help" style="margin-top:8px">
          Para uma faixa que cruza a meia-noite, use duas condições em “QUALQUER”:
          entre 18:00 e 23:59, ou antes de 06:00.
        </p>
      </template>

      <template v-else>
        <input
          ref="entrada"
          class="mf-input"
          :type="editor === 'clock' ? 'time' : editor === 'calendar' ? 'date' : editor === 'number' ? 'number' : 'text'"
          :placeholder="editor === 'text' ? 'Digite o valor' : ''"
          :disabled="readonly"
          :value="modelValue ?? ''"
          @input="emit('update:modelValue', editor === 'number' ? Number($event.target.value) : $event.target.value)"
        />
      </template>
    </div>
  </div>
</template>

<style scoped>
.mf-cv { display: flex; flex-direction: column; min-height: 0; height: 100%; }
.mf-cv__busca {
  width: 100%;
  border: 0;
  border-bottom: 1px solid var(--border);
  background: transparent;
  color: var(--text);
  padding: 10px 12px;
  font-size: 13px;
  outline: none;
}
.mf-cv__lista { flex: 1; min-height: 0; overflow-y: auto; padding: 6px 0; }
.mf-cv__titulo {
  padding: 8px 12px 4px;
  font-size: 10px;
  letter-spacing: .08em;
  color: var(--text2);
}
.mf-cv__item {
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
.mf-cv__item:hover { background: var(--surface2); }
.mf-cv__item.is-on { color: var(--accent); }
.mf-cv__item--livre { color: var(--accent); }
.mf-cv__item--solto { border-bottom: 1px solid var(--border); font-size: 12px; color: var(--text2); }
.mf-cv__campos { padding: 12px; }
.mf-cv__nada, .mf-cv__vazio, .mf-cv__aviso {
  padding: 12px;
  font-size: 12px;
  color: var(--text2);
}
.mf-cv__aviso { border-top: 1px solid var(--border); }
</style>
