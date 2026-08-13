import { formatLongDate } from '../../../src/lib/dateFormat.js'
import { escapeTelegramHtml } from './telegram.js'

export function buildEmployeeFineMessage(fine) {
  const amount = new Intl.NumberFormat('ru-RU')
    .format(Math.round(Number(fine?.amount) || 0))
    .replace(/\s/g, ' ')

  return [
    '⚠️ <b>Уведомление о штрафе</b>',
    '',
    `<b>Здравствуйте, ${escapeTelegramHtml(fine?.employee_name || 'сотрудник')}!</b>`,
    'К сожалению, вам был назначен штраф.',
    '',
    `<b>Сумма:</b> ${escapeTelegramHtml(amount)} UZS`,
    `<b>Дата:</b> ${escapeTelegramHtml(formatLongDate(fine?.fine_date, 'ru', '-'))}`,
    `<b>Причина:</b> ${escapeTelegramHtml(fine?.reason || '-')}`,
    `<b>Оформил:</b> ${escapeTelegramHtml(fine?.created_by_name || '-')}`,
  ].join('\n')
}
