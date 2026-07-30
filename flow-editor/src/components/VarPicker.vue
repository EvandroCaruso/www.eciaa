<script setup>
/**
 * Paleta de variáveis do contato. Duas seções, como a referência: CAMPOS DO
 * SISTEMA (fixos, sempre disponíveis) e os do cliente (vivos, do cwmkt).
 *
 * Não guarda cópia da lista: pergunta ao backend, que é a definição única.
 */
import { computed, ref, onMounted, onBeforeUnmount, nextTick } from 'vue'

const props = defineProps({
  campos: { type: Object, required: true } // { system, client, client_error }
})
const emit = defineEmits(['pick', 'close'])

const busca = ref('')
const caixa = ref(null)
const entrada = ref(null)

function filtra(lista) {
  const q = busca.value.trim().toLowerCase()
  if (!q) return lista || []
  return (lista || []).filter(
    (c) => c.key.toLowerCase().includes(q) || String(c.label || '').toLowerCase().includes(q)
  )
}

const system = computed(() => filtra(props.campos.system))
const client = computed(() => filtra(props.campos.client))
const vazio = computed(() => system.value.length === 0 && client.value.length === 0)

// Fechar ao clicar fora com listener no document e closest(): overlay invisível
// engole o primeiro clique e obriga o usuário a clicar duas vezes.
function foraDaCaixa(e) {
  if (caixa.value && !caixa.value.contains(e.target) && !e.target.closest('[data-var-btn]')) {
    emit('close')
  }
}
function noEsc(e) {
  if (e.key === 'Escape') { e.stopPropagation(); emit('close') }
}

onMounted(async () => {
  document.addEventListener('mousedown', foraDaCaixa)
  document.addEventListener('keydown', noEsc)
  await nextTick()
  if (entrada.value) entrada.value.focus()
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', foraDaCaixa)
  document.removeEventListener('keydown', noEsc)
})
</script>

<template>
  <div ref="caixa" class="mf-vp">
    <input
      ref="entrada"
      v-model="busca"
      class="mf-vp__busca"
      placeholder="Buscar campo"
      @keydown.enter.prevent="(system[0] || client[0]) && emit('pick', (system[0] || client[0]).key)"
    />

    <div class="mf-vp__lista">
      <template v-if="system.length">
        <div class="mf-vp__titulo">CAMPOS DO SISTEMA</div>
        <button
          v-for="c in system"
          :key="'s-' + c.key"
          class="mf-vp__item"
          @click="emit('pick', c.key)"
        >
          <span>{{ c.label }}</span>
          <code>[{{ c.key }}]</code>
        </button>
      </template>

      <template v-if="client.length">
        <div class="mf-vp__titulo">CAMPOS DESTE CLIENTE</div>
        <button
          v-for="c in client"
          :key="'c-' + c.key"
          class="mf-vp__item"
          @click="emit('pick', c.key)"
        >
          <span>{{ c.label }}</span>
          <code>[{{ c.key }}]</code>
        </button>
      </template>

      <div v-if="vazio" class="mf-vp__vazio">Nenhum campo com esse nome.</div>

      <!-- degradação visível: sem cwmkt configurado a seção do cliente não existe,
           e isso é dito em vez de a lista simplesmente aparecer menor -->
      <div v-if="campos.client_error && !busca" class="mf-vp__aviso">
        {{ campos.client_error }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.mf-vp {
  position: absolute;
  z-index: 40;
  width: 280px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, .38);
  overflow: hidden;
}
.mf-vp__busca {
  width: 100%;
  border: 0;
  border-bottom: 1px solid var(--border);
  background: transparent;
  color: var(--text);
  padding: 10px 12px;
  font-size: 13px;
  outline: none;
}
.mf-vp__lista { max-height: 260px; overflow-y: auto; padding: 6px 0; }
.mf-vp__titulo {
  padding: 8px 12px 4px;
  font-size: 10px;
  letter-spacing: .08em;
  color: var(--text2);
}
.mf-vp__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 7px 12px;
  border: 0;
  background: transparent;
  color: var(--text);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.mf-vp__item:hover { background: var(--surface2); }
.mf-vp__item code { font-size: 11px; color: var(--accent); opacity: .85; }
.mf-vp__vazio, .mf-vp__aviso {
  padding: 10px 12px;
  font-size: 12px;
  color: var(--text2);
}
.mf-vp__aviso { border-top: 1px solid var(--border); }
</style>
