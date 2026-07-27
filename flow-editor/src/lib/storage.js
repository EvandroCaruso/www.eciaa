/**
 * Acesso a localStorage/sessionStorage à prova do iframe do Chatwoot.
 *
 * O n8n sobrescreve o CSP de toda resposta de webhook com `sandbox` SEM
 * `allow-same-origin`. Nesse contexto, tocar em localStorage lança SecurityError
 * — não devolve null, LANÇA. Isso já derrubou o Dashboard inteiro uma vez.
 * Todo acesso passa por aqui.
 */

export function lsGet(key, fallback = null) {
  try {
    const v = window.localStorage.getItem(key)
    return v === null ? fallback : v
  } catch {
    return fallback
  }
}

export function lsSet(key, value) {
  try {
    window.localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

export function lsGetJSON(key, fallback = null) {
  const raw = lsGet(key, null)
  if (raw === null) return fallback
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

export function lsSetJSON(key, value) {
  try {
    return lsSet(key, JSON.stringify(value))
  } catch {
    return false
  }
}

/**
 * Área de transferência do editor.
 *
 * A Clipboard API também é negada dentro do iframe sandboxed (origem `null`),
 * então a fonte da verdade é um buffer em memória; a Clipboard API é só uma
 * tentativa oportunista, para permitir colar entre abas quando o app roda fora
 * do iframe. Nunca dependemos dela.
 */
let memoryClip = null

export function writeClip(payload) {
  memoryClip = JSON.parse(JSON.stringify(payload))
  try {
    navigator.clipboard?.writeText(JSON.stringify(payload)).catch(() => {})
  } catch {
    /* ignorado de propósito */
  }
  return true
}

/**
 * O `readText()` da Clipboard API não apenas falha em contexto negado: ele pode
 * ficar PENDENTE para sempre esperando uma permissão que nunca vem. Sem o
 * timeout abaixo, o Ctrl+V simplesmente nunca completa dentro do iframe.
 * O buffer em memória é a fonte confiável; a Clipboard API é bônus.
 */
export async function readClip() {
  const daClipboard = await Promise.race([
    (async () => {
      try {
        const text = await navigator.clipboard?.readText()
        if (!text) return null
        const parsed = JSON.parse(text)
        return parsed && Array.isArray(parsed.nodes) ? parsed : null
      } catch {
        return null
      }
    })(),
    new Promise((resolve) => setTimeout(() => resolve(null), 200))
  ])

  return daClipboard || memoryClip
}

export function hasClip() {
  return memoryClip !== null
}
