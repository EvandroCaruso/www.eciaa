<script setup>
/**
 * Painel de propriedades. O formulário é renderizado a partir de
 * `params_schema` do tipo de nó — não há form codificado por tipo aqui.
 * Um tipo novo no banco ganha formulário sem tocar neste arquivo.
 */
import { computed, ref, watch } from 'vue'
import SubBlockList from './SubBlockList.vue'
import ConditionList from './ConditionList.vue'

const props = defineProps({
  node: { type: Object, default: null }, // { name, nodeType, parameters, spec }
  readonly: { type: Boolean, default: false },
  canDelete: { type: Boolean, default: true }
})

const emit = defineEmits(['update-params', 'rename', 'delete', 'close'])

const nameDraft = ref('')
const nameError = ref('')

watch(
  () => props.node && props.node.name,
  (n) => { nameDraft.value = n || ''; nameError.value = '' },
  { immediate: true }
)

const fields = computed(() => props.node?.spec?.params_schema?.fields || [])
const helpText = computed(() => props.node?.spec?.params_schema?.help || '')
const deletable = computed(() =>
  props.canDelete && props.node?.spec?.params_schema?.deletable !== false
)

function value(key, field) {
  const v = props.node.parameters?.[key]
  if (v !== undefined) return v
  return field.default !== undefined ? field.default : (field.type === 'rule-list' ? [] : '')
}

function setValue(key, v) {
  emit('update-params', { ...props.node.parameters, [key]: v })
}

function commitName() {
  const to = nameDraft.value.trim()
  if (!to) { nameError.value = 'O nome não pode ficar vazio.'; return }
  if (to === props.node.name) { nameError.value = ''; return }
  emit('rename', { from: props.node.name, to, onError: (msg) => { nameError.value = msg } })
}

// ---- regras da Condição ----
function rules(field) {
  const v = value(field.key, field)
  return Array.isArray(v) ? v : []
}
function addRule(field) {
  const item = field.item || {}
  setValue(field.key, [
    ...rules(field),
    { attr: item.attr?.default || '', op: item.op?.default || 'contains', value: '' }
  ])
}
function updateRule(field, i, patch) {
  const next = rules(field).map((r, idx) => (idx === i ? { ...r, ...patch } : r))
  setValue(field.key, next)
}
function removeRule(field, i) {
  setValue(field.key, rules(field).filter((_, idx) => idx !== i))
}
</script>

<template>
  <aside v-if="node" class="mf-props">
    <header class="mf-props__head">
      <span class="mf-props__icon">{{ node.spec?.icon }}</span>
      <strong>{{ node.spec?.label || node.nodeType }}</strong>
      <span style="flex:1"></span>
      <button class="mf-btn mf-btn--ghost mf-btn--sm" title="Fechar" @click="emit('close')">✕</button>
    </header>

    <div class="mf-props__body">
      <div class="mf-field">
        <label class="mf-label">Nome do bloco</label>
        <input
          v-model="nameDraft"
          class="mf-input"
          :disabled="readonly"
          @blur="commitName"
          @keydown.enter.prevent="$event.target.blur()"
        />
        <div v-if="nameError" class="mf-help" style="color: var(--error)">{{ nameError }}</div>
        <div v-else class="mf-help">É por este nome que as conexões apontam para o bloco.</div>
      </div>

      <p v-if="helpText" class="mf-help" style="margin-bottom:16px">{{ helpText }}</p>

      <div v-for="field in fields" :key="field.key" class="mf-field">
        <label class="mf-label">
          {{ field.label }}<span v-if="field.required" style="color: var(--error)"> *</span>
        </label>

        <textarea
          v-if="field.type === 'textarea'"
          class="mf-textarea"
          :rows="field.rows || 4"
          :placeholder="field.placeholder"
          :disabled="readonly"
          :value="value(field.key, field)"
          @input="setValue(field.key, $event.target.value)"
        ></textarea>

        <input
          v-else-if="field.type === 'number'"
          type="number"
          class="mf-input"
          :min="field.min" :max="field.max"
          :disabled="readonly"
          :value="value(field.key, field)"
          @input="setValue(field.key, Number($event.target.value))"
        />

        <div v-else-if="field.type === 'radio'">
          <label v-for="opt in field.options" :key="opt.value" class="mf-radio">
            <input
              type="radio"
              :name="field.key"
              :value="opt.value"
              :disabled="readonly"
              :checked="value(field.key, field) === opt.value"
              @change="setValue(field.key, opt.value)"
            />
            <span>{{ opt.label }}</span>
          </label>
        </div>

        <select
          v-else-if="field.type === 'select'"
          class="mf-select"
          :disabled="readonly"
          :value="value(field.key, field)"
          @change="setValue(field.key, $event.target.value)"
        >
          <option v-for="opt in field.options" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>

        <!-- sequência de sub-blocos do Conteúdo: o único controle que escreve o
             objeto de parâmetros inteiro (precisa manter os espelhos coerentes) -->
        <SubBlockList
          v-else-if="field.type === 'blocks'"
          :field="field"
          :parameters="node.parameters || {}"
          :readonly="readonly"
          @update="(p) => emit('update-params', p)"
        />

        <!-- lista de condições do bloco Condição (v2) -->
        <ConditionList
          v-else-if="field.type === 'condition-list'"
          :field="field"
          :parameters="node.parameters || {}"
          :schema="node.spec?.params_schema || {}"
          :readonly="readonly"
          @update="(p) => emit('update-params', p)"
        />

        <!-- lista de regras da Condição — formato ANTIGO (type_version 1).
             Sai numa segunda publicação, depois que o v2 estiver homologado: o
             bundle novo tem de entender os DOIS esquemas enquanto a linha do
             catálogo ainda não virou, senão a tela quebra no intervalo. -->
        <div v-else-if="field.type === 'rule-list'">
          <div v-for="(rule, i) in rules(field)" :key="i" class="mf-rule">
            <input
              class="mf-input"
              :list="`attrs-${field.key}`"
              :disabled="readonly"
              :value="rule.attr"
              placeholder="Atributo"
              @input="updateRule(field, i, { attr: $event.target.value })"
            />
            <select
              class="mf-select"
              :disabled="readonly"
              :value="rule.op"
              @change="updateRule(field, i, { op: $event.target.value })"
            >
              <option v-for="opt in field.item.op.options" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
            <input
              v-if="rule.op !== 'exists'"
              class="mf-input"
              :disabled="readonly"
              :value="rule.value"
              placeholder="Valor"
              @input="updateRule(field, i, { value: $event.target.value })"
            />
            <button
              class="mf-btn mf-btn--sm mf-btn--danger"
              :disabled="readonly"
              title="Remover regra"
              @click="removeRule(field, i)"
            >✕</button>
          </div>

          <datalist :id="`attrs-${field.key}`">
            <option v-for="o in field.item.attr.options" :key="o" :value="o" />
          </datalist>

          <button class="mf-btn mf-btn--sm" :disabled="readonly" @click="addRule(field)">+ regra</button>
          <div v-if="!rules(field).length" class="mf-help">Sem regras, a condição sempre segue por “Falso”.</div>
        </div>

        <input
          v-else
          class="mf-input"
          :disabled="readonly"
          :value="value(field.key, field)"
          @input="setValue(field.key, $event.target.value)"
        />

        <div v-if="field.help" class="mf-help">{{ field.help }}</div>
      </div>
    </div>

    <footer v-if="deletable && !readonly" class="mf-props__foot">
      <button class="mf-btn mf-btn--danger" @click="emit('delete', node.name)">Excluir bloco</button>
    </footer>
  </aside>
</template>

<style scoped>
.mf-props {
  width: 320px;
  flex: 0 0 320px;
  background: var(--surface);
  border-left: 1px solid var(--border);
  display: flex;
  flex-direction: column;
}
.mf-props__head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
}
.mf-props__icon { font-size: 16px; }
.mf-props__body { flex: 1; overflow-y: auto; padding: 16px 14px; }
.mf-props__foot { padding: 12px 14px; border-top: 1px solid var(--border); }
.mf-radio { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; cursor: pointer; }
.mf-rule {
  display: grid;
  grid-template-columns: 1fr 110px 1fr auto;
  gap: 6px;
  margin-bottom: 8px;
  align-items: center;
}
.mf-rule .mf-input, .mf-rule .mf-select { padding: 6px 8px; font-size: 12px; }
</style>
