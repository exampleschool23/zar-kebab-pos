import { escapeTelegramHtml } from './telegram.js'

function firstText(...values) {
  return values
    .map(value => String(value || '').trim())
    .find(Boolean) || ''
}

const RUSSIAN_MONTHS = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
]

function formatRussianBusinessDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return String(value || '').trim()
  const [, year, month, day] = match
  const monthName = RUSSIAN_MONTHS[Number(month) - 1]
  return monthName ? `${Number(day)} ${monthName} ${year}` : String(value)
}

export function getRussianMenuItemName(item) {
  return firstText(
    item?.menu_item_name,
    item?.name_ru,
    item?.name_uz,
    item?.name_en,
    item?.id,
    'Без названия'
  )
}

export function getRussianMenuCategoryName(item) {
  return firstText(
    item?.category_name,
    item?.category_name_ru,
    item?.category?.name_ru,
    item?.category_name_uz,
    item?.category?.name_uz,
    item?.category_name_en,
    item?.category?.name_en,
    'Без категории'
  )
}

export function buildMenuUnavailableTeamMessage(event) {
  const itemName = getRussianMenuItemName(event)
  const actorName = firstText(event?.actor_name, 'Неизвестный сотрудник')

  return [
    '🚫 <b>Блюдо стало недоступно</b>',
    `🍽 <b>Блюдо:</b> ${escapeTelegramHtml(itemName)}`,
    `👤 <b>Изменил(а):</b> ${escapeTelegramHtml(actorName)}`,
  ].join('\n')
}

export function buildDailyUnavailableMenuTeamMessage(items, businessDate) {
  const unavailableItems = Array.isArray(items) ? items : []
  const dateLabel = formatRussianBusinessDate(businessDate)
  const header = [
    '🚫 <b>Недоступные блюда</b>',
    `📅 <b>На ${escapeTelegramHtml(dateLabel)}, 08:00</b>`,
  ]

  if (unavailableItems.length === 0) {
    return [...header, '✅ Все блюда доступны.'].join('\n')
  }

  const categoryGroups = []
  const groupsByKey = new Map()
  for (const item of unavailableItems) {
    const categoryName = getRussianMenuCategoryName(item)
    const categoryKey = firstText(item?.category_id, categoryName)
    let group = groupsByKey.get(categoryKey)
    if (!group) {
      group = { categoryName, items: [] }
      groupsByKey.set(categoryKey, group)
      categoryGroups.push(group)
    }
    group.items.push(item)
  }

  const groupedLines = []
  let itemNumber = 0
  for (const group of categoryGroups) {
    if (groupedLines.length > 0) groupedLines.push('')
    groupedLines.push(`📂 <b>${escapeTelegramHtml(group.categoryName)}</b>`)
    for (const item of group.items) {
      itemNumber += 1
      groupedLines.push(`${itemNumber}. ${escapeTelegramHtml(getRussianMenuItemName(item))}`)
    }
  }
  return [
    ...header,
    '',
    ...groupedLines,
    '',
    `📦 <b>Всего:</b> ${unavailableItems.length}`,
  ].join('\n')
}
