export const MENU_ITEM_TEXT_FIELDS = [
  'name_uz',
  'name_ru',
  'name_en',
  'description_uz',
  'description_ru',
  'description_en',
]

export function trimMenuItemTextValue(value) {
  return String(value ?? '').trim()
}

export function trimMenuItemTextFields(fields = {}) {
  const normalized = { ...fields }
  for (const field of MENU_ITEM_TEXT_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(normalized, field)) {
      normalized[field] = trimMenuItemTextValue(normalized[field])
    }
  }
  return normalized
}

export function firstMenuItemText(...values) {
  for (const value of values) {
    const normalized = trimMenuItemTextValue(value)
    if (normalized) return normalized
  }
  return ''
}
