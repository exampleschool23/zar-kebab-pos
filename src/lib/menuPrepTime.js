export const DEFAULT_MENU_PREP_MINUTES = 15
export const MAX_MENU_PREP_MINUTES = 180

export function normalizeMenuPrepMinutes(value, fallback = DEFAULT_MENU_PREP_MINUTES) {
  const minutes = Math.round(Number(value))
  if (!Number.isFinite(minutes) || minutes <= 0) return fallback
  return Math.min(MAX_MENU_PREP_MINUTES, minutes)
}

export function menuPrepTimeLabel(item, lang = 'en') {
  const minutes = normalizeMenuPrepMinutes(
    item?.estimated_prep_minutes ?? item?.estimatedPrepMinutes
  )
  const unit = lang === 'uz' ? 'daq' : lang === 'ru' ? 'мин' : 'min'
  return `~${minutes} ${unit}`
}
