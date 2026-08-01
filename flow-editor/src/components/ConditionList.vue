<script setup>
/**
 * Controle `condition-list` — a lista de condições do bloco Condição.
 *
 * O `PropertiesPanel` ganha UMA linha para chamá-lo, no mesmo molde do
 * `SubBlockList`: os outros tipos de bloco seguem sem saber que isto existe.
 *
 * O catálogo (no banco) diz QUAIS sujeitos aparecem, com que rótulo e em que
 * grupo. Os OPERADORES vivem em core/condition.js, porque o id do operador é a
 * instrução que o executor executa — não é texto de tela.
 *
 * ⚠️ Este controle NÃO escreve `mode`: ele só lê, para derivar "Lógica E/Ou". Quem
 * escreve é o campo `radio` do próprio schema. Dois escritores para o mesmo dado
 * é como o indicador 🟢/🟡 divergiu.
 */
import { ref, computed, onMounted } from 'vue'
import {
  normalizeParameters, withConditions, addCondition, updateCondition, removeCondition,
  rotuloLogica, fraseVerdadeiro, fraseFalso, tipoDeCampo
} from '../core/condition.js'
import { resumoCondicao } from '../core/preview.js'
import { fetchContactFields, fetchConditionCatalog } from '../lib/api.js'
import ConditionPicker from './ConditionPicker.vue'
import ConditionEditor from './ConditionEditor.vue'
import ModalDialog from './ModalDialog.vue'

const props = defineProps({
  field: { type: Object, required: true },
  parameters: { type: Object, required: true },
  schema: { type: Object, default: () => ({}) },
  readonly: { type: Boolean, default: false }
})
const emit = defineEmits(['update'])

// Ler já normaliza: uma regra `{attr, op, value}` aparece convertida sem que nada
// seja gravado. Quem persiste é o salvar do fluxo.
const normalizados = computed(() => normalizeParameters(props.parameters))
const conditions = computed(() => normalizados.value.conditions)
const mode = computed(() => normalizados.value.mode)

const campos = ref({ system: [], client: [], client_error: null })
const catalogo = ref({ labels: [], labels_error: null, agents: [], agents_error: null })

// Os popovers precisam do RETÂNGULO (para posicionar) e do ELEMENTO (para o
// clique-fora ignorá-lo). Sem o segundo, o próprio botão vira um toggle que
// fecha e reabre em alternância — medido no browser em 2026-07-31.
const escolhendo = ref(null) // { anchor, el }
const editando = ref(null)   // { id, anchor, el }
const paraExcluir = ref(null)

// Carregar na montagem, não no clique: a pílula do Conteúdo já ensinou que
// buscar o catálogo só ao abrir o pop-up pinta tudo de desconhecido antes disso.
// As duas chamadas são memoizadas no módulo — uma por sessão.
onMounted(async () => {
  campos.value = await fetchContactFields()
  catalogo.value = await fetchConditionCatalog()
})

/** Rótulos dos sujeitos, vindos do CATÁLOGO — nunca literais aqui. */
const sujeitos = computed(() => {
  const out = {}
  for (const g of props.field.groups || []) {
    for (const s of g.subjects || []) out[s.subject] = s.label
  }
  return out
})

const camposPorChave = computed(() => {
  const out = {}
  for (const c of [...(campos.value.system || []), ...(campos.value.client || [])]) out[c.key] = c
  return out
})

const agentesPorId = computed(() => {
  const out = {}
  for (const a of catalogo.value.agents || []) out[a.id] = a.name
  return out
})

const ctx = computed(() => ({
  sujeitos: sujeitos.value,
  campos: camposPorChave.value,
  agentes: agentesPorId.value
}))

/** As três seções do seletor, montadas a partir do que o catálogo declarou. */
const secoes = computed(() =>
  (props.field.groups || [])
    .map((g) => {
      if (Array.isArray(g.subjects)) {
        return {
          titulo: g.titulo || g.title,
          itens: g.subjects.map((s) => ({
            chave: 's-' + s.subject,
            label: s.label,
            ref: { subject: s.subject }
          }))
        }
      }
      const fonte = g.from === 'contact_fields.client' ? 'client' : 'system'
      return {
        titulo: g.titulo || g.title,
        itens: (campos.value[fonte] || []).map((c) => ({
          chave: fonte + '-' + c.key,
          label: c.label,
          ref: {
            subject: 'field',
            field: c.key,
            field_source: fonte,
            field_type: tipoDeCampo(c.type),
            field_label: c.label
          }
        }))
      }
    })
    .filter((s) => s.itens.length)
)

/** Os erros das três fontes, cada um dizendo o que faltou. */
const avisos = computed(() =>
  [campos.value.client_error, catalogo.value.labels_error, catalogo.value.agents_error].filter(Boolean)
)

// ⚠️ Sem aviso de runtime aqui. Ele dizia que o bloco "sempre segue pela saída
// Verdadeiro porque o runtime ainda não avalia" — vocabulário de execução numa
// tela de construção. O que se monta aqui é uma máscara, e máscara não é
// verdadeira nem falsa (ver `principio-mascara.md` no vault). A lacuna do
// executor está registrada no `dicionario-executor.md`, que é onde ela é de
// alguém. Removido em 2026-07-31, a pedido do Evandro.

function aplicar(novas) {
  emit('update', withConditions(props.parameters, novas))
}

function abrirSeletor(ev) {
  const el = ev.currentTarget
  escolhendo.value = { anchor: el.getBoundingClientRect(), el }
}

function escolher(ref_) {
  escolhendo.value = null
  const { conditions: novas, id } = addCondition(conditions.value, ref_)
  aplicar(novas)
  // abre o editor já no card recém-criado, para a pessoa não ter de clicar de novo
  setTimeout(() => {
    const el = document.querySelector(`[data-cond="${id}"]`)
    if (el) editando.value = { id, anchor: el.getBoundingClientRect(), el }
  }, 0)
}

function abrirEditor(c, ev) {
  if (c.subject === 'legacy') return
  const el = ev.currentTarget
  editando.value = { id: c.id, anchor: el.getBoundingClientRect(), el }
}

function salvarCondicao(nova) {
  aplicar(updateCondition(conditions.value, nova.id, nova))
}

function pedirExclusao(c) {
  paraExcluir.value = { id: c.id, resumo: resumoCondicao(c, ctx.value) }
}

function confirmarExclusao() {
  const id = paraExcluir.value.id
  paraExcluir.value = null
  if (editando.value && editando.value.id === id) editando.value = null
  aplicar(removeCondition(conditions.value, id))
}

const emEdicao = computed(() =>
  editando.value ? conditions.value.find((c) => c.id === editando.value.id) : null
)
</script>

<template>
  <div class="mf-cl">
    <p class="mf-cl__logica">Lógica <strong>{{ rotuloLogica(mode) }}</strong></p>

    <div v-if="conditions.length" class="mf-cl__saida">{{ fraseVerdadeiro(mode) }}</div>

    <div
      v-for="c in conditions"
      :key="c.id"
      :data-cond="c.id"
      class="mf-cl__card"
      :class="{ 'is-incompleta': resumoCondicao(c, ctx).incompleta, 'is-legacy': c.subject === 'legacy' }"
    >
      <button class="mf-cl__corpo" :disabled="readonly" @click="abrirEditor(c, $event)">
        <span class="mf-cl__titulo">{{ resumoCondicao(c, ctx).titulo }}</span>
        <span class="mf-cl__op">{{ resumoCondicao(c, ctx).operador }}</span>
        <span v-if="resumoCondicao(c, ctx).valor" class="mf-cl__valor">
          {{ resumoCondicao(c, ctx).valor }}
        </span>
      </button>

      <button class="mf-cl__x" title="Remover condição" :disabled="readonly" @click="pedirExclusao(c)">✕</button>

      <div v-if="c.subject === 'legacy'" class="mf-help mf-cl__legado">
        Regra do formato antigo, preservada como está. Clique em ✕ e refaça pelo seletor
        quando quiser — ela não é editável aqui.
      </div>
    </div>

    <div v-if="conditions.length" class="mf-cl__saida mf-cl__saida--falso">{{ fraseFalso(mode) }}</div>

    <button class="mf-cl__add" :disabled="readonly" @click="abrirSeletor">
      {{ field.add_label || 'Selecionar Condição' }}
      <span class="mf-cl__chevron">⌄</span>
    </button>

    <div v-if="!conditions.length && field.empty_help" class="mf-help">{{ field.empty_help }}</div>

    <ConditionPicker
      v-if="escolhendo"
      :secoes="secoes"
      :avisos="avisos"
      :anchor="escolhendo.anchor"
      :gatilho="escolhendo.el"
      @pick="escolher"
      @close="escolhendo = null"
    />

    <ConditionEditor
      v-if="emEdicao"
      :key="emEdicao.id"
      :condition="emEdicao"
      :titulo="resumoCondicao(emEdicao, ctx).titulo"
      :catalogo="catalogo"
      :anchor="editando.anchor"
      :gatilho="editando.el"
      :readonly="readonly"
      @update="salvarCondicao"
      @close="editando = null"
    />

    <ModalDialog
      :open="!!paraExcluir"
      title="Remover esta condição?"
      :message="paraExcluir ? `“${paraExcluir.resumo.titulo} ${paraExcluir.resumo.operador} ${paraExcluir.resumo.valor}” sairá do bloco.` : ''"
      confirm-label="Remover"
      danger
      @confirm="confirmarExclusao"
      @cancel="paraExcluir = null"
    />
  </div>
</template>

<style scoped>
.mf-cl__aviso {
  border: 1px solid var(--warn);
  border-radius: 8px;
  padding: 8px 10px;
  margin-bottom: 10px;
  font-size: 11px;
  line-height: 1.45;
  color: var(--warn);
}
.mf-cl__logica { font-size: 13px; margin: 0 0 10px; }
.mf-cl__saida {
  font-size: 11px;
  color: var(--text2);
  margin-bottom: 6px;
}
.mf-cl__saida--falso { margin-top: 8px; }
.mf-cl__card {
  position: relative;
  border: 1px solid var(--border);
  border-radius: 8px;
  margin-bottom: 6px;
  background: var(--surface);
}
.mf-cl__card.is-incompleta { border-color: var(--warn); }
.mf-cl__card.is-legacy { opacity: .75; }
.mf-cl__corpo {
  display: block;
  width: 100%;
  padding: 8px 28px 8px 10px;
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
}
.mf-cl__card.is-legacy .mf-cl__corpo { cursor: default; }
.mf-cl__titulo { display: block; font-size: 13px; color: var(--text); }
.mf-cl__op { display: block; font-size: 12px; color: var(--text2); }
.mf-cl__valor { display: block; font-size: 13px; color: var(--text); }
.mf-cl__x {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 20px;
  height: 20px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--text2);
  font-size: 11px;
  cursor: pointer;
}
.mf-cl__x:hover:not(:disabled) { background: var(--surface2); color: var(--error); }
.mf-cl__x:disabled { opacity: .3; cursor: default; }
.mf-cl__legado { padding: 0 10px 8px; }
.mf-cl__add {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  margin-top: 8px;
  padding: 9px 10px;
  border: 1px solid var(--accent);
  border-radius: 8px;
  background: transparent;
  color: var(--accent);
  font-size: 13px;
  cursor: pointer;
}
.mf-cl__add:disabled { opacity: .4; cursor: default; }
.mf-cl__chevron { font-size: 14px; line-height: 1; }
</style>
