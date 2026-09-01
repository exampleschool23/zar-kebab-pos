import { escapeTelegramHtml } from './telegram.js'
import { formatLongDate } from '../../../src/lib/dateFormat.js'

function firstText(...values) {
  return values
    .map(value => String(value || '').trim())
    .find(Boolean) || ''
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

export function buildMenuAvailableTeamMessage(event) {
  const itemName = getRussianMenuItemName(event)
  const actorName = firstText(event?.actor_name, 'Неизвестный сотрудник')

  return [
    '✅ <b>Блюдо снова доступно</b>',
    `🍽 <b>Блюдо:</b> ${escapeTelegramHtml(itemName)}`,
    `👤 <b>Изменил(а):</b> ${escapeTelegramHtml(actorName)}`,
  ].join('\n')
}

export function buildMenuCreatedTeamMessage(event) {
  const itemName = getRussianMenuItemName(event)
  const actorName = firstText(event?.actor_name, 'Неизвестный сотрудник')

  return [
    '🆕 <b>Добавлено новое блюдо</b>',
    `🍽 <b>Блюдо:</b> ${escapeTelegramHtml(itemName)}`,
    `👤 <b>Добавил(а):</b> ${escapeTelegramHtml(actorName)}`,
  ].join('\n')
}

export function buildMenuArchivedTeamMessage(event) {
  const itemName = getRussianMenuItemName(event)
  const actorName = firstText(event?.actor_name, 'Неизвестный сотрудник')

  return [
    '🗑 <b>Блюдо удалено из меню</b>',
    `🍽 <b>Блюдо:</b> ${escapeTelegramHtml(itemName)}`,
    `👤 <b>Удалил(а):</b> ${escapeTelegramHtml(actorName)}`,
  ].join('\n')
}

export function buildDailyUnavailableMenuTeamMessage(items, businessDate) {
  const unavailableItems = Array.isArray(items) ? items : []
  const dateLabel = formatLongDate(businessDate, 'ru', businessDate || '—')
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
