<script setup>
/**
 * Modal genérico — o ecossistema proíbe alert/confirm/prompt nativos
 * (bloqueados ou feios dentro do iframe do Chatwoot).
 * Modo "prompt" quando recebe `label`; modo "confirm" quando não recebe.
 */
import { ref, watch, nextTick } from 'vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' },
  message: { type: String, default: '' },
  label: { type: String, default: '' },
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  confirmLabel: { type: String, default: 'Confirmar' },
  danger: { type: Boolean, default: false }
})

const emit = defineEmits(['confirm', 'cancel'])

const draft = ref('')
const input = ref(null)

watch(
  () => props.open,
  async (isOpen) => {
    if (!isOpen) return
    draft.value = props.modelValue
    await nextTick()
    input.value?.focus()
    input.value?.select()
  },
  { immediate: true }
)

function confirm() {
  if (props.label && !draft.value.trim()) return
  emit('confirm', draft.value.trim())
}
</script>

<template>
  <div v-if="open" class="mf-modal-backdrop" @click.self="emit('cancel')" @keydown.esc="emit('cancel')">
    <div class="mf-modal" role="dialog" aria-modal="true">
      <h3>{{ title }}</h3>
      <p v-if="message" style="color: var(--text2); line-height:1.5; margin:0 0 14px">{{ message }}</p>

      <div v-if="label" class="mf-field">
        <label class="mf-label">{{ label }}</label>
        <input
          ref="input"
          v-model="draft"
          class="mf-input"
          :placeholder="placeholder"
          @keydown.enter.prevent="confirm"
        />
      </div>

      <div class="mf-modal__actions">
        <button class="mf-btn" @click="emit('cancel')">Cancelar</button>
        <button
          class="mf-btn"
          :class="danger ? 'mf-btn--danger' : 'mf-btn--primary'"
          :disabled="!!label && !draft.trim()"
          @click="confirm"
        >{{ confirmLabel }}</button>
      </div>
    </div>
  </div>
</template>
