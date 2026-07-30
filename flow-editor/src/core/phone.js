/**
 * Telefone do cartão de contato — puro, sem Vue e sem DOM.
 *
 * Guardamos SEMPRE em E.164 (`+5515991195899`): é o formato que o WhatsApp e o
 * cwmkt entendem, e é o único que não depende de quem está olhando. A máscara
 * bonita existe só na tela.
 */

/** DDI mais longo primeiro na hora de casar — senão `+1` engole `+55`. */
export const PAISES = [
  { code: 'BR', ddi: '55', flag: '🇧🇷', nome: 'Brasil' },
  { code: 'PT', ddi: '351', flag: '🇵🇹', nome: 'Portugal' },
  { code: 'US', ddi: '1', flag: '🇺🇸', nome: 'Estados Unidos' },
  { code: 'AR', ddi: '54', flag: '🇦🇷', nome: 'Argentina' },
  { code: 'PY', ddi: '595', flag: '🇵🇾', nome: 'Paraguai' },
  { code: 'UY', ddi: '598', flag: '🇺🇾', nome: 'Uruguai' },
  { code: 'CL', ddi: '56', flag: '🇨🇱', nome: 'Chile' },
  { code: 'CO', ddi: '57', flag: '🇨🇴', nome: 'Colômbia' },
  { code: 'MX', ddi: '52', flag: '🇲🇽', nome: 'México' },
  { code: 'ES', ddi: '34', flag: '🇪🇸', nome: 'Espanha' },
  { code: 'IT', ddi: '39', flag: '🇮🇹', nome: 'Itália' },
  { code: 'FR', ddi: '33', flag: '🇫🇷', nome: 'França' },
  { code: 'GB', ddi: '44', flag: '🇬🇧', nome: 'Reino Unido' },
  { code: 'DE', ddi: '49', flag: '🇩🇪', nome: 'Alemanha' }
]

export const PAIS_PADRAO = 'BR'

export function paisPor(code) {
  return PAISES.find((p) => p.code === code) || PAISES.find((p) => p.code === PAIS_PADRAO)
}

export function soDigitos(v) {
  return String(v ?? '').replace(/\D/g, '')
}

/**
 * Máscara de exibição. No Brasil é a única que vale a pena tratar de perto:
 * 11 dígitos → (15) 99119-5899 · 10 dígitos → (15) 9119-5899.
 * Fora do Brasil, agrupa de 3 em 3 — arriscar máscara de país que não conheço
 * atrapalha mais do que ajuda.
 */
export function formatarNacional(valor, code = PAIS_PADRAO) {
  const d = soDigitos(valor)
  if (!d) return ''

  if (code === 'BR') {
    const n = d.slice(0, 11)
    if (n.length <= 2) return `(${n}`
    const ddd = n.slice(0, 2)
    const resto = n.slice(2)
    if (!resto) return `(${ddd}`
    const corte = resto.length > 8 ? 5 : 4
    return resto.length <= corte
      ? `(${ddd}) ${resto}`
      : `(${ddd}) ${resto.slice(0, corte)}-${resto.slice(corte)}`
  }

  return d.slice(0, 15).replace(/(\d{1,3})(?=(\d{3})+$)/g, '$1 ').trim()
}

/** Vira `+DDI` + dígitos nacionais. Sem número nacional, devolve string vazia. */
export function paraE164(valor, code = PAIS_PADRAO) {
  const d = soDigitos(valor)
  if (!d) return ''
  return `+${paisPor(code).ddi}${d}`
}

/**
 * Quebra um E.164 de volta em país + número nacional, para a tela reabrir o que
 * foi gravado. Casa o DDI mais longo primeiro; sem `+`, assume o país informado.
 */
export function deE164(e164, fallback = PAIS_PADRAO) {
  const bruto = String(e164 ?? '').trim()
  if (!bruto) return { code: fallback, nacional: '' }

  const d = soDigitos(bruto)
  if (!bruto.startsWith('+')) return { code: fallback, nacional: d }

  const candidatos = [...PAISES].sort((a, b) => b.ddi.length - a.ddi.length)
  const achado = candidatos.find((p) => d.startsWith(p.ddi))
  if (!achado) return { code: fallback, nacional: d }
  return { code: achado.code, nacional: d.slice(achado.ddi.length) }
}

/**
 * Confere o comprimento. Não valida operadora nem existência — só evita gravar
 * um número obviamente truncado no cartão que vai para o cliente.
 */
export function telefoneValido(valor, code = PAIS_PADRAO) {
  const d = soDigitos(valor)
  if (code === 'BR') return d.length === 10 || d.length === 11
  return d.length >= 6 && d.length <= 15
}
