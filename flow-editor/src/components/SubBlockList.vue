<script setup>
/**
 * Controle `blocks` — a sequência de sub-blocos do bloco Conteúdo.
 *
 * É o primeiro controle do editor que não é um campo simples, e por isso ele
 * existe como componente próprio: o `PropertiesPanel` ganha UMA linha para
 * chamá-lo, e os outros tipos de bloco seguem sem saber que isto existe.
 *
 * O catálogo de sub-tipos vem do banco (`params_schema.fields[].sub_types`), como
 * manda a D2: sub-bloco novo é INSERT, não deploy — só precisa de código aqui se
 * pedir um controle que ainda não existe.
 *
 * Editar abre um formulário com Cancelar/Salvar explícitos, e não grava a cada
 * tecla como o resto do painel: com a pílula pintada e a régua, gravar por tecla
 * fica barulhento e enche o histórico de rascunho.
 */
import { ref, computed, watch } from 'vue'
import {
  addSubBlock, updateSubBlock, removeSubBlock, duplicateSubBlock, moveSubBlock,
  normalizeParameters, withBlocks, subTypesFrom
} from '../core/subblocks.js'
import { resumoSubBloco } from '../core/preview.js'
import { PAISES, PAIS_PADRAO, formatarNacional, paraE164, deE164, telefoneValido } from '../core/phone.js'
import RichTextField from './RichTextField.vue'
import AssetField from './AssetField.vue'
import ModalDialog from './ModalDialog.vue'

const props = defineProps({
  field: { type: Object, required: true },
  parameters: { type: Object, required: true },
  readonly: { type: Boolean, default: false }
})
const emit = defineEmits(['update'])

const subTypes = computed(() => subTypesFrom(props.field))

// Ler já normaliza: um bloco `typeVersion: 1` aparece como sequência sem que
// nada seja gravado. Quem persiste é o salvar do fluxo.
const blocks = computed(() => normalizeParameters(props.parameters).blocks)

const editandoId = ref(null)
const rascunho = ref(null)
const escolhendo = ref(false)
const paraExcluir = ref(null)

// Telefone vive em dois formatos: E.164 no dado (é o que o WhatsApp entende) e
// país + número nacional na tela. Estes refs são só a face visível.
const telPais = ref(PAIS_PADRAO)
const telNacional = ref('')

function specDe(kind) {
  return subTypes.value.find((s) => s.kind === kind) || { fields: [], label: kind, icon: '•' }
}

function aplicar(novos) {
  emit('update', withBlocks(props.parameters, novos))
}

function adicionar(subType) {
  escolhendo.value = false
  const { blocks: novos, id } = addSubBlock(blocks.value, subType)
  aplicar(novos)
  abrir(novos.find((b) => b.id === id))
}

function abrir(b) {
  editandoId.value = b.id
  rascunho.value = JSON.parse(JSON.stringify(b))
  if (b.kind === 'contact') {
    const { code, nacional } = deE164(b.phone || '', PAIS_PADRAO)
    telPais.value = code
    telNacional.value = formatarNacional(nacional, code)
  }
}

function salvar() {
  const r = { ...rascunho.value }

  // Usar o número conectado: os campos de telefone somem do dado. O número real
  // só existe no DISPATCH — o mesmo fluxo pode sair por vários canais, e gravar
  // um número aqui seria fixar hoje algo que só se sabe na hora do envio.
  if (r.kind === 'contact' && r.use_connected_number === true) {
    r.phone = ''
  }

  aplicar(updateSubBlock(blocks.value, editandoId.value, r))
  editandoId.value = null
  rascunho.value = null
}

function cancelar() {
  editandoId.value = null
  rascunho.value = null
}

function duplicar(id) {
  aplicar(duplicateSubBlock(blocks.value, id).blocks)
}

function mover(id, dir) {
  aplicar(moveSubBlock(blocks.value, id, dir))
}

/** Excluir NUNCA é direto: passa pelo modal, como todo destrutivo deste editor. */
function pedirExclusao(b) {
  paraExcluir.value = { id: b.id, resumo: resumoSubBloco(b, subTypes.value) }
}

function confirmarExclusao() {
  const id = paraExcluir.value.id
  paraExcluir.value = null
  if (editandoId.value === id) cancelar()
  aplicar(removeSubBlock(blocks.value, id))
}

/** Um valor herdado acima da régua é preservado; o aviso explica por que ele existe. */
function forasteiro(campo, valor) {
  return campo.type === 'range' && Number(valor) > Number(campo.max)
}

const usaNumeroConectado = computed(
  () => rascunho.value && rascunho.value.use_connected_number === true
)

function onTelefone(valor) {
  telNacional.value = formatarNacional(valor, telPais.value)
  rascunho.value.phone = paraE164(telNacional.value, telPais.value)
}

function onPais(code) {
  telPais.value = code
  telNacional.value = formatarNacional(telNacional.value, code)
  rascunho.value.phone = paraE164(telNacional.value, code)
}

const telefoneIncompleto = computed(() => {
  if (!rascunho.value || rascunho.value.kind !== 'contact') return false
  if (usaNumeroConectado.value || !telNacional.value) return false
  return !telefoneValido(telNacional.value, telPais.value)
})

// Marcar "usar o número conectado" limpa o que estava digitado na hora, para a
// tela não mostrar um número que não vai ser usado.
watch(usaNumeroConectado, (usa) => {
  if (usa) { telNacional.value = ''; if (rascunho.value) rascunho.value.phone = '' }
})
</script>

<template>
  <div class="mf-sb">
    <div v-if="!blocks.length" class="mf-help mf-sb__vazio">
      A mensagem está vazia. Adicione uma parte abaixo.
    </div>

    <div v-for="(b, i) in blocks" :key="b.id" class="mf-sb__item" :class="{ 'is-open': editandoId === b.id }">
      <div class="mf-sb__cab">
        <!-- ordem primeiro, e visível: as setas ficavam apagadas e ninguém as achava -->
        <div class="mf-sb__ordem nodrag">
          <button class="mf-sb__seta" title="Mover para cima" :disabled="readonly || i === 0" @click="mover(b.id, -1)">↑</button>
          <button class="mf-sb__seta" title="Mover para baixo" :disabled="readonly || i === blocks.length - 1" @click="mover(b.id, 1)">↓</button>
        </div>

        <span class="mf-sb__resumo" :title="resumoSubBloco(b, subTypes)">{{ resumoSubBloco(b, subTypes) }}</span>

        <div class="mf-sb__acoes nodrag">
          <button class="mf-sb__ac" title="Duplicar" :disabled="readonly" @click="duplicar(b.id)">⧉</button>
          <button class="mf-sb__ac mf-sb__ac--danger" title="Excluir" :disabled="readonly" @click="pedirExclusao(b)">✕</button>
          <button v-if="editandoId !== b.id" class="mf-sb__editar" :disabled="readonly" @click="abrir(b)">Editar</button>
        </div>
      </div>

      <div v-if="editandoId === b.id && rascunho" class="mf-sb__form">
        <div v-for="campo in specDe(b.kind).fields" :key="campo.key" class="mf-field">
          <label v-if="campo.type !== 'switch'" class="mf-label">
            {{ campo.label }}<span v-if="campo.required" style="color: var(--error)"> *</span>
          </label>

          <RichTextField
            v-if="campo.type === 'rich-text'"
            v-model="rascunho[campo.key]"
            :rows="campo.rows || 4"
            :placeholder="campo.placeholder || ''"
            :readonly="readonly"
            :vars="campo.vars !== false"
          />

          <AssetField
            v-else-if="campo.type === 'asset'"
            v-model="rascunho[campo.key]"
            :asset-name="rascunho.asset_name || ''"
            :accept="campo.accept || '*/*'"
            :kind="b.kind"
            :readonly="readonly"
            @update:asset-name="(n) => (rascunho.asset_name = n)"
          />

          <div v-else-if="campo.type === 'range'" class="mf-sb__range">
            <input
              type="range"
              :min="campo.min" :max="campo.max" :step="campo.step || 1"
              :disabled="readonly"
              :value="Math.min(Number(rascunho[campo.key]) || 0, Number(campo.max))"
              @input="rascunho[campo.key] = Number($event.target.value)"
            />
            <output>{{ String(rascunho[campo.key] ?? 0).replace('.', ',') }}{{ campo.unit || '' }}</output>
          </div>

          <label v-else-if="campo.type === 'switch'" class="mf-sb__switch">
            <input
              type="checkbox"
              :disabled="readonly"
              :checked="rascunho[campo.key] === true"
              @change="rascunho[campo.key] = $event.target.checked"
            />
            <span>{{ campo.label }}</span>
          </label>

          <div v-else-if="campo.type === 'phone'" class="mf-sb__phone">
            <select
              class="mf-select mf-sb__ddi"
              :disabled="readonly || usaNumeroConectado"
              :value="telPais"
              @change="onPais($event.target.value)"
            >
              <option v-for="p in PAISES" :key="p.code" :value="p.code">
                {{ p.flag }} +{{ p.ddi }}
              </option>
            </select>
            <input
              class="mf-input"
              inputmode="tel"
              :disabled="readonly || usaNumeroConectado"
              :placeholder="usaNumeroConectado ? 'usa o número conectado' : '(15) 99119-5899'"
              :value="telNacional"
              @input="onTelefone($event.target.value)"
            />
          </div>

          <input
            v-else
            class="mf-input"
            :disabled="readonly"
            :value="rascunho[campo.key]"
            @input="rascunho[campo.key] = $event.target.value"
          />

          <div v-if="forasteiro(campo, rascunho[campo.key])" class="mf-help mf-sb__herdado">
            Valor herdado: {{ rascunho[campo.key] }}{{ campo.unit || '' }} — acima do limite de
            {{ campo.max }}{{ campo.unit || '' }}. Ele é mantido até você mexer no controle.
          </div>
          <div v-else-if="campo.type === 'phone' && usaNumeroConectado" class="mf-help">
            O número sai do canal por onde a mensagem for enviada, e isso só se sabe no disparo.
          </div>
          <div v-else-if="campo.type === 'phone' && telefoneIncompleto" class="mf-help mf-sb__herdado">
            Número incompleto para este país.
          </div>
          <div v-else-if="campo.help" class="mf-help">{{ campo.help }}</div>
        </div>

        <!-- MESMO par ✗/✓ do bloco Condição, mesmas cores e mesma ordem: o gesto
             de confirmar se aprende uma vez e vale em todo o construtor
             (ver `padroes-de-edicao.md` no vault) -->
        <div class="mf-sb__botoes">
          <button class="mf-confirm__btn mf-confirm__btn--x" title="Cancelar a edição (Esc)" @click="cancelar">✕</button>
          <button
            class="mf-confirm__btn mf-confirm__btn--ok"
            title="Salvar"
            :disabled="readonly"
            @click="salvar"
          >✓</button>
        </div>
      </div>
    </div>

    <button v-if="!escolhendo" class="mf-sb__add" :disabled="readonly" @click="escolhendo = true">
      + Adicionar parte
    </button>

    <div v-else class="mf-sb__grade">
      <button
        v-for="st in subTypes"
        :key="st.kind"
        class="mf-sb__tipo"
        @click="adicionar(st)"
      >
        <span class="mf-sb__tipo-ic">{{ st.icon }}</span>
        <span>{{ st.label }}</span>
      </button>
      <button class="mf-sb__tipo mf-sb__tipo--cancel" @click="escolhendo = false">Cancelar</button>
    </div>

    <ModalDialog
      :open="!!paraExcluir"
      title="Excluir esta parte?"
      :message="paraExcluir ? `“${paraExcluir.resumo}” será removida da mensagem.` : ''"
      confirm-label="Excluir"
      danger
      @confirm="confirmarExclusao"
      @cancel="paraExcluir = null"
    />
  </div>
</template>

<style scoped>
.mf-sb__vazio { margin-bottom: 8px; }
.mf-sb__item {
  border: 1px solid var(--border);
  border-radius: 8px;
  margin-bottom: 6px;
  background: var(--surface);
}
.mf-sb__item.is-open { border-color: var(--accent); }
.mf-sb__cab { display: flex; align-items: center; gap: 6px; padding: 6px 6px 6px 4px; }
.mf-sb__resumo {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mf-sb__ordem { display: flex; flex-direction: column; gap: 1px; }
.mf-sb__seta {
  width: 20px;
  height: 15px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 3px;
  background: var(--surface2);
  color: var(--text);
  cursor: pointer;
  font-size: 10px;
  line-height: 1;
}
.mf-sb__seta:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
.mf-sb__seta:disabled { opacity: .3; cursor: default; }
.mf-sb__acoes { display: flex; align-items: center; gap: 2px; }
.mf-sb__ac {
  width: 22px;
  height: 22px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--text2);
  cursor: pointer;
  font-size: 11px;
}
.mf-sb__ac:hover:not(:disabled) { background: var(--surface2); color: var(--text); }
.mf-sb__ac:disabled { opacity: .3; cursor: default; }
.mf-sb__ac--danger:hover:not(:disabled) { color: var(--error); }
.mf-sb__editar {
  border: 0;
  background: transparent;
  color: var(--accent);
  font-size: 12px;
  cursor: pointer;
  padding: 2px 4px;
}
.mf-sb__form { padding: 4px 10px 10px; border-top: 1px solid var(--border); }
.mf-sb__botoes { display: flex; justify-content: flex-end; gap: 6px; margin-top: 8px; }
.mf-sb__range { display: flex; align-items: center; gap: 8px; }
.mf-sb__range input { flex: 1; }
.mf-sb__range output { font-size: 12px; color: var(--text2); min-width: 34px; text-align: right; }
.mf-sb__switch { display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 12px; }
.mf-sb__phone { display: flex; align-items: center; gap: 6px; }
.mf-sb__ddi { width: 104px; flex: 0 0 auto; padding: 8px 4px; font-size: 12px; }
.mf-sb__herdado { color: var(--warn); }
.mf-sb__add {
  width: 100%;
  padding: 8px;
  border: 1px dashed var(--border);
  border-radius: 8px;
  background: transparent;
  color: var(--text2);
  font-size: 12px;
  cursor: pointer;
}
.mf-sb__add:hover:not(:disabled) { color: var(--accent); border-color: var(--accent); }
.mf-sb__grade { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.mf-sb__tipo {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 10px 4px;
  border: 1px dashed var(--border);
  border-radius: 8px;
  background: transparent;
  color: var(--text2);
  font-size: 11px;
  cursor: pointer;
}
.mf-sb__tipo:hover { color: var(--accent); border-color: var(--accent); }
.mf-sb__tipo-ic { font-size: 16px; }
.mf-sb__tipo--cancel { grid-column: 1 / -1; border-style: solid; }
</style>
