const WRITE_FAILURE_LABELS = {
  en: { payment: 'Payment failed', save: 'Could not save changes', details: 'Details', hint: 'Hint', code: 'code' },
  ru: { payment: 'Не удалось провести оплату', save: 'Не удалось сохранить изменения', details: 'Подробности', hint: 'Подсказка', code: 'код' },
  uz: { payment: 'To‘lovni amalga oshirib bo‘lmadi', save: 'O‘zgarishlarni saqlab bo‘lmadi', details: 'Tafsilotlar', hint: 'Tavsiya', code: 'kod' },
}

function cleanErrorText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ')
}

export function formatWriteError(error, lang = 'en', actionType = '') {
  const labels = WRITE_FAILURE_LABELS[lang] || WRITE_FAILURE_LABELS.en
  const prefix = actionType === 'MARK_ORDER_PAID' ? labels.payment : labels.save
  const message = cleanErrorText(error?.message)
  const code = cleanErrorText(error?.code)
  const details = cleanErrorText(error?.details)
  const hint = cleanErrorText(error?.hint)
  const exactMessage = message || cleanErrorText(error) || 'Unknown error'
  const parts = [`${prefix}: ${exactMessage}`]

  if (code) parts.push(`[${labels.code}: ${code}]`)
  if (details && details !== message) parts.push(`${labels.details}: ${details}`)
  if (hint && hint !== message && hint !== details) parts.push(`${labels.hint}: ${hint}`)

  return parts.join(' · ')
}

