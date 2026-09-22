export function normalizeMoneyInput(value) {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits.replace(/^0+(?=\d)/, '')
}

export function formatMoneyInput(value) {
  const normalized = normalizeMoneyInput(value)
  if (!normalized) return ''
  return normalized.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

export function numberFromMoneyInput(value) {
  const normalized = normalizeMoneyInput(value)
  return normalized ? Number(normalized) : 0
}

// Balance corrections allow a leading sign, including while the amount is being typed.
export function normalizeSignedMoneyInput(value) {
  const text = String(value ?? '').trimStart()
  const sign = /^[+-]/.test(text) ? text[0] : ''
  return sign + normalizeMoneyInput(text)
}

export function formatSignedMoneyInput(value) {
  const normalized = normalizeSignedMoneyInput(value)
  const sign = /^[+-]/.test(normalized) ? normalized[0] : ''
  return sign + formatMoneyInput(normalized)
}
