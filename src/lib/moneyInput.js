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
