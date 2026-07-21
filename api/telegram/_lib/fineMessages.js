import { formatDateOnly } from '../../../src/lib/dateFormat.js'
import { getCompletedOrdersChatIds } from './orderStatusMessages.js'
import { escapeTelegramHtml } from './telegram.js'

const TEAM_CHAT_ID_ENV_KEYS = [
  'TELEGRAM_TEAM_CHAT_ID',
  'TELEGRAM_TEAM_CHAT_IDS',
]

function parseChatIds(keys, env) {
  const seen = new Set()
  return keys
    .flatMap(key => String(env?.[key] || '').split(','))
    .map(value => value.trim())
    .filter(Boolean)
    .filter(value => {
      if (seen.has(value)) return false
      seen.add(value)
      return true
    })
}

export function getEmployeeFineChatIds(env = process.env) {
  const teamChatIds = parseChatIds(TEAM_CHAT_ID_ENV_KEYS, env)
  return teamChatIds.length > 0 ? teamChatIds : getCompletedOrdersChatIds(env)
}

export function buildEmployeeFineMessage(fine) {
  const amount = new Intl.NumberFormat('ru-RU')
    .format(Math.round(Number(fine?.amount) || 0))
    .replace(/\s/g, ' ')

  return [
    '🚨 <b>Штраф сотруднику</b>',
    '',
    `<b>Сотрудник:</b> ${escapeTelegramHtml(fine?.employee_name || '-')}`,
    `<b>Сумма:</b> ${escapeTelegramHtml(amount)} UZS`,
    `<b>Дата:</b> ${escapeTelegramHtml(formatDateOnly(fine?.fine_date, '-'))}`,
    `<b>Причина:</b> ${escapeTelegramHtml(fine?.reason || '-')}`,
    `<b>Добавил:</b> ${escapeTelegramHtml(fine?.created_by_name || '-')}`,
  ].join('\n')
}
