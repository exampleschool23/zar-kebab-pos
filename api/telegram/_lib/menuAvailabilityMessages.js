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

  const itemLines = unavailableItems.map((item, index) => (
    `${index + 1}. ${escapeTelegramHtml(getRussianMenuItemName(item))}`
  ))
  return [
    ...header,
    '',
    ...itemLines,
    '',
    `📦 <b>Всего:</b> ${unavailableItems.length}`,
  ].join('\n')
}
