<script setup>
/**
 * Menu de contexto (botão direito), como no n8n.
 * Os itens vêm de fora — este componente só posiciona e renderiza.
 */
import { computed } from 'vue'

const props = defineProps({
  x: { type: Number, required: true },
  y: { type: Number, required: true },
  titulo: { type: String, default: '' },
  itens: { type: Array, required: true } // [{ rotulo, atalho?, acao, perigo?, desabilitado? }]
})

const emit = defineEmits(['fechar'])

// Não deixa o menu vazar para fora da janela quando aberto perto da borda.
const estilo = computed(() => {
  const larguraMenu = 200
  const alturaMenu = 44 + props.itens.length * 32
  return {
    left: Math.min(props.x, window.innerWidth - larguraMenu - 8) + 'px',
    top: Math.min(props.y, Math.max(8, window.innerHeight - alturaMenu - 8)) + 'px'
  }
})

function executar(item) {
  if (item.desabilitado) return
  item.acao()
  emit('fechar')
}
</script>

<template>
  <div class="mf-ctx" :style="estilo" @click.stop @contextmenu.prevent>
    <div v-if="titulo" class="mf-ctx__label">{{ titulo }}</div>
    <template v-for="(item, i) in itens" :key="i">
      <div v-if="item.separador" class="mf-ctx__sep"></div>
      <button
        v-else
        :class="{ 'is-danger': item.perigo }"
        :disabled="item.desabilitado"
        :title="item.dica || ''"
        @click="executar(item)"
      >
        <span>{{ item.rotulo }}</span>
        <kbd v-if="item.atalho">{{ item.atalho }}</kbd>
      </button>
    </template>
  </div>
</template>
