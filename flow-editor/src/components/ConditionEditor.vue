<script setup>
/**
 * Popover de DOIS PAINÉIS: operadores à esquerda, valor à direita, rodapé embaixo.
 *
 * ⚠️ Teleport + position:fixed, não absolute. O `.mf-props__body` tem
 * `overflow-y: auto`, e overflow vale para os dois eixos: um popover absolute
 * dentro dele seria RECORTADO — e este tem 520 px contra os 320 px do painel,
 * então não haveria como caber por dentro. A aritmética de flip/clamp está em
 * core/popover.js, testada.
 *
 * ⚠️ CONFIRMAÇÃO EXPLÍCITA (padrão de 31/07, ver `padroes-de-edicao.md` no vault).
 * Até 30/07 este popover não tinha botão: "escolher já aplica, clicar fora aplica".
 * Na homologação isso se mostrou indistinguível de não salvar — e no caso das
 * listas era perda de dado de verdade, porque o texto digitado morava na caixa de
 * busca e só virava valor com um clique em "selecionar «texto»". Agora: ✓ salva,
 * ✗ cancela (perguntando), clicar fora SALVA, e até desmontar salva.
 *
 * ⚠️ O clique-fora salvava? Não: na primeira volta ele cancelava, e na
 * homologação isso ainda perdia texto. A regra final é assimétrica de propósito —
 * SALVAR é o default de tudo, e descartar exige o ✗ vermelho mais uma pergunta.
 *
 * O rascunho local também é o que faz o Ctrl+Z contar UM passo por popover: o
 * histórico guarda o grafo inteiro a cada update, e emitir por tecla encheria o
 * undo de lixo.
 */
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { operadoresDe, operadorSpec, trocaOperador, aceitaExact } from '../core/condition.js'
import { posicionaNoDom } from '../core/popover.js'
import ConditionValueEditor from './ConditionValueEditor.vue'

const props = defineProps({
  condition: { type: Object, required: true },
  titulo: { type: String, default: '' },
  catalogo: { type: Object, default: () => ({}) },
  anchor: { type: Object, required: true },
  // o card que abriu: sem ignorá-lo, clicar nele fecha e reabre em alternância
  gatilho: { type: Object, default: null },
  readonly: { type: Boolean, default: false }
})
const emit = defineEmits(['update', 'close'])

const caixa = ref(null)
const pos = ref({ left: -9999, top: -9999, maxHeight: 380 })
const original = JSON.stringify(props.condition)
const rascunho = ref(JSON.parse(original))
const perguntandoDescarte = ref(false)

const operadores = computed(() => operadoresDe(rascunho.value))
const spec = computed(() => operadorSpec(rascunho.value))
const editor = computed(() => (spec.value ? spec.value.editor : 'none'))

/** O check "Idêntico" só aparece onde há grafia digitada para comparar. */
const mostraExact = computed(() => aceitaExact(rascunho.value))
const sujo = computed(() => JSON.stringify(rascunho.value) !== original)

function selecionaOperador(id) {
  if (props.readonly) return
  // trocaOperador preserva o valor quando a aridade não muda: trocar "É" por
  // "Contém" não pode apagar o que a pessoa já digitou
  rascunho.value = trocaOperador(rascunho.value, id)
}

function setValor(v) {
  if (v === undefined) delete rascunho.value.value
  else rascunho.value.value = v
}

/**
 * `exact` só é GRAVADO quando marcado. Desmarcado é o padrão do projeto, e um
 * `exact: false` em todo fluxo do banco seria ruído que um dia alguém lê como
 * decisão consciente.
 */
function setExact(marcado) {
  if (marcado) rascunho.value.exact = true
  else delete rascunho.value.exact
}

// Trava de mão única: depois que o popover decidiu (salvou ou descartou), o
// gancho de desmontagem não pode decidir de novo.
let finalizado = false

function confirmar() {
  finalizado = true
  emit('update', rascunho.value)
  emit('close')
}

/**
 * ✗ é o ÚNICO jeito de perder o que foi digitado, e ainda assim ele pergunta.
 *
 * ⚠️ Clicar fora NÃO cai mais aqui (mudança do Evandro, 31/07). O par ✓/✗ deixa
 * o gesto explícito disponível, mas quem clica fora está mudando de assunto, não
 * pedindo para apagar — e perder texto por isso é o defeito que originou esta
 * rodada inteira. Agora clicar fora SALVA.
 */
function cancelar() {
  if (sujo.value) { perguntandoDescarte.value = true; return }
  finalizado = true
  emit('close')
}

function descartar() {
  finalizado = true
  perguntandoDescarte.value = false
  emit('close')
}

/**
 * Escolher numa lista JÁ É uma confirmação — é um gesto só, e é o que a pessoa
 * espera de um menu. O par ✓/✗ existe para o que é DIGITADO.
 */
function escolheuNaLista(rotulo) {
  if (rascunho.value.subject === 'assignee') {
    if ('value' in rascunho.value) rascunho.value.value_label = rotulo
    else delete rascunho.value.value_label
  }
  confirmar()
}

function foraDaCaixa(e) {
  if (!caixa.value || caixa.value.contains(e.target)) return
  if (props.gatilho && props.gatilho.contains(e.target)) return
  // clicar fora SALVA — ver o comentário de `cancelar()`
  confirmar()
}

function noTeclado(e) {
  if (e.key === 'Escape') { e.stopPropagation(); cancelar(); return }
  // Enter confirma em campo de uma linha; num par (entre) ele também serve, porque
  // as duas pontas já estão no rascunho
  if (e.key === 'Enter' && caixa.value && caixa.value.contains(e.target)) {
    e.preventDefault()
    e.stopPropagation()
    confirmar()
  }
}

/**
 * ⚠️ Captura na window enxerga o scroll das listas AQUI DENTRO — scroll não
 * borbulha. Fechar sem checar a origem fazia o popover se autodestruir ao rolar
 * o mouse ou arrastar a barra (defeito da homologação de 31/07). E com rascunho
 * na mão, fechar por rolagem seria perda de dado: a página andar só regruda.
 */
function onScroll(e) {
  if (caixa.value && e.target && caixa.value.contains(e.target)) return
  regruda()
}

function regruda() {
  const el = props.gatilho
  if (!el || !el.getBoundingClientRect) return
  pos.value = posicionaNoDom(el.getBoundingClientRect(), caixa.value, { alinha: 'direita' })
}

async function posicionar() {
  await nextTick()
  pos.value = posicionaNoDom(props.anchor, caixa.value, { alinha: 'direita' })
}

onMounted(async () => {
  await posicionar()
  document.addEventListener('mousedown', foraDaCaixa)
  document.addEventListener('keydown', noTeclado)
  window.addEventListener('scroll', onScroll, true)
  window.addEventListener('resize', regruda)
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', foraDaCaixa)
  document.removeEventListener('keydown', noTeclado)
  window.removeEventListener('scroll', onScroll, true)
  window.removeEventListener('resize', regruda)

  // ⚠️ Rede de segurança. Clicar no CANVAS deseleciona o bloco, o painel de
  // propriedades some e leva este popover junto — sem passar por ✓, ✗ nem pelo
  // clique-fora, porque o componente é destruído antes. Era por aqui que o texto
  // digitado sumia mesmo depois de o clique-fora passar a salvar. Se ninguém
  // decidiu e há alteração, ela vai para o grafo: perder é sempre pior.
  if (!finalizado && sujo.value) emit('update', rascunho.value)
})
</script>

<template>
  <Teleport to="body">
    <div
      ref="caixa"
      class="mf-ce"
      :style="{ left: pos.left + 'px', top: pos.top + 'px', maxHeight: pos.maxHeight + 'px' }"
    >
      <div class="mf-ce__corpo">
        <div class="mf-ce__ops">
          <div class="mf-ce__titulo">{{ (titulo || '').toUpperCase() }}</div>
          <button
            v-for="op in operadores"
            :key="op.id"
            class="mf-ce__op"
            :class="{ 'is-on': rascunho.op === op.id }"
            :disabled="readonly"
            @click="selecionaOperador(op.id)"
          >{{ op.label }}</button>
        </div>

        <div class="mf-ce__valor">
          <ConditionValueEditor
            :key="rascunho.op"
            :editor="editor"
            :aridade="spec ? spec.aridade : 0"
            :model-value="rascunho.value"
            :catalogo="catalogo"
            :readonly="readonly"
            @update:model-value="setValor"
            @escolheu="escolheuNaLista"
          />
        </div>
      </div>

      <!-- pergunta de descarte ocupa o rodapé: não some da vista nem exige rolar -->
      <div v-if="perguntandoDescarte" class="mf-ce__rodape mf-ce__rodape--perigo">
        <span class="mf-ce__pergunta">Descartar o que você alterou?</span>
        <div class="mf-confirm">
          <button class="mf-confirm__btn mf-confirm__btn--x" @click="descartar">Descartar</button>
          <button class="mf-confirm__btn mf-confirm__btn--ok" @click="perguntandoDescarte = false">Voltar</button>
        </div>
      </div>

      <div v-else class="mf-ce__rodape">
        <label v-if="mostraExact" class="mf-ce__exact">
          <input
            type="checkbox"
            :checked="!!rascunho.exact"
            :disabled="readonly"
            @change="setExact($event.target.checked)"
          />
          <span>Idêntico</span>
        </label>
        <span v-if="mostraExact" class="mf-ce__dica">
          {{ rascunho.exact ? 'acento importa: anúncio ≠ anuncio' : 'anúncio = anuncio = anùncio' }}
        </span>
        <span v-else class="mf-ce__dica"></span>

        <div class="mf-confirm">
          <button
            class="mf-confirm__btn mf-confirm__btn--x"
            title="Cancelar a edição (Esc)"
            @click="cancelar"
          >✕</button>
          <button
            class="mf-confirm__btn mf-confirm__btn--ok"
            title="Salvar (Enter)"
            :disabled="readonly"
            @click="confirmar"
          >✓</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<!-- sem `scoped`: nó teleportado para o <body> não recebe o atributo de escopo -->
<style>
.mf-ce {
  position: fixed;
  z-index: 60;
  display: flex;
  flex-direction: column;
  width: 520px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, .38);
  overflow: hidden;
}
.mf-ce__corpo { display: flex; min-height: 0; flex: 1; }
.mf-ce__ops {
  width: 200px;
  flex: 0 0 200px;
  border-right: 1px solid var(--border);
  padding: 6px 0;
  overflow-y: auto;
}
.mf-ce__titulo {
  padding: 8px 12px 6px;
  font-size: 10px;
  letter-spacing: .08em;
  color: var(--text2);
}
.mf-ce__op {
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
.mf-ce__op:hover:not(:disabled) { background: var(--surface2); }
.mf-ce__op.is-on { color: var(--accent); font-weight: 600; }
.mf-ce__valor { flex: 1; min-width: 0; display: flex; flex-direction: column; }

.mf-ce__rodape {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-top: 1px solid var(--border);
  background: var(--surface2);
}
.mf-ce__rodape--perigo { background: rgba(220, 68, 68, .12); }
.mf-ce__pergunta { flex: 1; font-size: 12px; color: var(--text); }
.mf-ce__exact {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text);
  cursor: pointer;
  user-select: none;
}
.mf-ce__dica { flex: 1; min-width: 0; font-size: 11px; color: var(--text2); }
/* `.mf-confirm` e `.mf-confirm__btn` NÃO moram aqui: são o padrão ✓/✗ de todo o
   construtor e vivem em src/styles.css, para o próximo bloco herdá-lo sem importar
   este componente. Ver `padroes-de-edicao.md` no vault. */
</style>
