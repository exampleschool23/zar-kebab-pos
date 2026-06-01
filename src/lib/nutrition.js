export function getItemKcal(item) {
  const value = Number(item?.kcal ?? item?.calories ?? item?.kkcal)
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 0
}

export function kcalLabel(item, lang = 'en') {
  const kcal = getItemKcal(item)
  if (!kcal) return ''
  const unit = lang === 'ru' ? 'ккал' : 'kcal'
  return `${kcal} ${unit}`
}
