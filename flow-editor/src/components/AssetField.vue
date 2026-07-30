<script setup>
/**
 * Campo de arquivo dos sub-blocos de mídia.
 *
 * Duas formas de preencher: subir do computador, ou reusar algo que já foi
 * enviado — a segunda sai de graça por os anexos viverem numa tabela, e evita a
 * mesma imagem subir cinco vezes.
 *
 * O byte mora no pg_1 (`msgflow_assets`). Não há URL pública: a prévia vem pelo
 * próprio endpoint autenticado, e no envio quem lê o byte é o executor.
 */
import { ref, computed, watch } from 'vue'
import { uploadAsset, listAssets, getAsset, deleteAsset, MAX_ASSET_BYTES } from '../lib/api.js'

const props = defineProps({
  modelValue: { type: [Number, null], default: null },
  assetName: { type: String, default: '' },
  accept: { type: String, default: '*/*' },
  kind: { type: String, default: 'file' },
  readonly: { type: Boolean, default: false }
})
const emit = defineEmits(['update:modelValue', 'update:assetName'])

const arquivo = ref(null)
const ocupado = ref(false)
const erro = ref('')
const biblioteca = ref(null) // null = fechada
const previa = ref('')
const meta = ref(null)

const temArquivo = computed(() => props.modelValue !== null && props.modelValue !== undefined)
const ehImagem = computed(() => props.kind === 'image')

function tamanho(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

async function carregaMeta() {
  previa.value = ''
  meta.value = null
  if (!temArquivo.value) return
  try {
    const a = await getAsset(props.modelValue)
    if (!a) { erro.value = 'Este arquivo não existe mais.'; return }
    meta.value = a
    emit('update:assetName', a.filename)
    // Prévia só de imagem pequena: trazer 8 MB em base64 para desenhar um
    // thumbnail seria pagar caro por enfeite.
    if (ehImagem.value && a.size_bytes <= 1048576) {
      previa.value = `data:${a.mime};base64,${a.content_b64}`
    }
  } catch (e) {
    erro.value = e.message
  }
}

watch(() => props.modelValue, carregaMeta, { immediate: true })

async function escolherDoDisco(ev) {
  const f = ev.target.files && ev.target.files[0]
  ev.target.value = '' // permite subir o MESMO arquivo de novo depois de remover
  if (!f) return
  erro.value = ''
  ocupado.value = true
  try {
    const a = await uploadAsset(f, props.kind)
    emit('update:modelValue', a.id)
    emit('update:assetName', a.filename)
  } catch (e) {
    erro.value = e.message
  } finally {
    ocupado.value = false
  }
}

async function abrirBiblioteca() {
  erro.value = ''
  ocupado.value = true
  try {
    biblioteca.value = await listAssets()
  } catch (e) {
    erro.value = e.message
    biblioteca.value = []
  } finally {
    ocupado.value = false
  }
}

function usar(a) {
  emit('update:modelValue', a.id)
  emit('update:assetName', a.filename)
  biblioteca.value = null
}

async function excluir(a) {
  erro.value = ''
  try {
    await deleteAsset(a.id)
    biblioteca.value = biblioteca.value.filter((x) => x.id !== a.id)
    if (props.modelValue === a.id) emit('update:modelValue', null)
  } catch (e) {
    // "em uso" é recusa esperada, não falha: o backend se nega a deixar fluxo
    // publicado com anexo órfão.
    erro.value = e.message
  }
}
</script>

<template>
  <div class="mf-asset">
    <div v-if="temArquivo" class="mf-asset__atual">
      <img v-if="previa" :src="previa" class="mf-asset__previa" alt="" />
      <div class="mf-asset__info">
        <strong>{{ (meta && meta.filename) || assetName || 'arquivo' }}</strong>
        <span v-if="meta">{{ meta.mime }} · {{ tamanho(meta.size_bytes) }}</span>
      </div>
      <button
        class="mf-btn mf-btn--sm mf-btn--ghost"
        :disabled="readonly"
        @click="emit('update:modelValue', null); emit('update:assetName', '')"
      >Trocar</button>
    </div>

    <div v-else class="mf-asset__vazio">
      <label class="mf-asset__link" :class="{ 'is-off': readonly || ocupado }">
        {{ ocupado ? 'Enviando…' : 'Subir arquivo' }}
        <input ref="arquivo" type="file" :accept="accept" :disabled="readonly || ocupado" @change="escolherDoDisco" />
      </label>
      <span class="mf-asset__ou">ou</span>
      <button class="mf-asset__link" :disabled="readonly || ocupado" @click="abrirBiblioteca">já enviados</button>
    </div>

    <div class="mf-help">Até {{ tamanho(MAX_ASSET_BYTES) }} por arquivo.</div>
    <div v-if="erro" class="mf-help mf-asset__erro">{{ erro }}</div>

    <div v-if="biblioteca !== null" class="mf-asset__lista">
      <div class="mf-asset__lista-topo">
        <strong>Já enviados</strong>
        <button class="mf-btn mf-btn--sm mf-btn--ghost" @click="biblioteca = null">✕</button>
      </div>
      <div v-if="!biblioteca.length" class="mf-help" style="padding: 8px 10px">
        Nenhum arquivo enviado ainda.
      </div>
      <div v-for="a in biblioteca" :key="a.id" class="mf-asset__linha">
        <button class="mf-asset__usar" @click="usar(a)">
          <span>{{ a.filename }}</span>
          <em>{{ tamanho(a.size_bytes) }}</em>
        </button>
        <button class="mf-btn mf-btn--sm mf-btn--danger" title="Excluir" :disabled="readonly" @click="excluir(a)">✕</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mf-asset { position: relative; }
.mf-asset__atual {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
}
.mf-asset__previa { width: 40px; height: 40px; object-fit: cover; border-radius: 6px; }
.mf-asset__info { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.mf-asset__info strong { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mf-asset__info span { font-size: 11px; color: var(--text2); }
.mf-asset__vazio {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 10px;
  border: 1px dashed var(--border);
  border-radius: 8px;
}
.mf-asset__link {
  background: transparent;
  border: 0;
  padding: 0;
  color: var(--accent);
  font-size: 13px;
  cursor: pointer;
  text-decoration: underline;
}
.mf-asset__link input { display: none; }
.mf-asset__link.is-off, .mf-asset__link:disabled { opacity: .5; cursor: default; }
.mf-asset__ou { font-size: 12px; color: var(--text2); }
.mf-asset__erro { color: var(--error); }
.mf-asset__lista {
  margin-top: 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  max-height: 220px;
  overflow-y: auto;
}
.mf-asset__lista-topo {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border-bottom: 1px solid var(--border);
  font-size: 12px;
}
.mf-asset__linha { display: flex; align-items: center; gap: 4px; padding: 2px 6px 2px 10px; }
.mf-asset__usar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex: 1;
  min-width: 0;
  background: transparent;
  border: 0;
  color: var(--text);
  font-size: 12px;
  padding: 6px 0;
  cursor: pointer;
  text-align: left;
}
.mf-asset__usar span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mf-asset__usar em { font-style: normal; color: var(--text2); font-size: 11px; }
</style>
