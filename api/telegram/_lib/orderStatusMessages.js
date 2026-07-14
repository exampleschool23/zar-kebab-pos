import { orderTypeLabel } from '../../../src/lib/orderTypes.js'
import { formatDateTime } from '../../../src/lib/dateFormat.js'
import { escapeTelegramHtml, TELEGRAM_STATUS_MESSAGES } from './telegram.js'

const COMPLETED_ORDER_GROUP_CHAT_ID_ENV_KEYS = [
  'TELEGRAM_COMPLETED_ORDERS_CHAT_ID',
  'TELEGRAM_COMPLETED_ORDERS_CHAT_IDS',
]

const PAYMENT_METHOD_LABELS_RU = {
  cash: 'Наличные',
  card: 'Карта',
  terminal: 'Терминал',
  qr: 'QR-код',
  qr_code: 'QR-код',
  loyalty: 'Карта лояльности',
  loyalty_card: 'Карта лояльности',
  mixed: 'Смешанная оплата',
  pay_at_cashier: 'Оплата на кассе',
}

const PRICE_MODE_TOURIST = 'tourist'

function formatMoney(amount) {
  const rounded = Math.round(Number(amount) || 0)
  return `${new Intl.NumberFormat('ru-RU').format(rounded).replace(/\s/g, ' ')} UZS`
}

function formatRowMoney(amount) {
  const rounded = Math.round(Number(amount) || 0)
  return new Intl.NumberFormat('ru-RU').format(rounded).replace(/\s/g, ' ')
}

function paymentMethodLabel(value) {
  const key = String(value || '').toLowerCase()
  if (PAYMENT_METHOD_LABELS_RU[key]) return PAYMENT_METHOD_LABELS_RU[key]
  return String(value || '-')
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function getOrderPayments(order) {
  const rows = Array.isArray(order?.payments)
    ? order.payments
    : Array.isArray(order?.order_payments)
      ? order.order_payments
      : []
  return rows
    .map(row => ({
      method: row?.method || row?.payment_method,
      amount: Math.round(Number(row?.amount) || 0),
    }))
    .filter(row => row.method && row.amount > 0)
}

export function mergeCompletedOrders(orders = []) {
  const rows = orders.filter(Boolean)
  if (rows.length <= 1) return rows[0] || null

  const first = rows[0]
  const unique = values => [...new Set(values.filter(Boolean))]
  const waiterNames = unique(rows.map(order => order.waiter_name))
  const completedByNames = unique(rows.map(order => order.completed_by_name))
  const priceModes = unique(rows.map(order => normalizePriceMode(order.price_mode)))
  const paymentsByMethod = new Map()

  for (const order of rows) {
    for (const payment of getOrderPayments(order)) {
      paymentsByMethod.set(payment.method, (paymentsByMethod.get(payment.method) || 0) + payment.amount)
    }
  }

  return {
    ...first,
    id: rows.map(order => order.id).join(','),
    waiter_name: waiterNames.join(', '),
    completed_by_name: completedByNames.join(', '),
    price_mode: priceModes.length === 1 ? priceModes[0] : first.price_mode,
    subtotal: rows.reduce((sum, order) => sum + (Number(order.subtotal) || 0), 0),
    service_fee: rows.reduce((sum, order) => sum + (Number(order.service_fee) || 0), 0),
    total: rows.reduce((sum, order) => sum + (Number(order.total) || 0), 0),
    items: rows.flatMap(order => getOrderItems(order)),
    payments: paymentsByMethod.size > 0
      ? [...paymentsByMethod].map(([method, amount]) => ({ method, amount }))
      : [],
    payment_method: unique(rows.map(order => order.payment_method)).join(', '),
    paid_at: rows.map(order => order.paid_at).filter(Boolean).sort().at(-1) || first.paid_at,
    updated_at: rows.map(order => order.updated_at).filter(Boolean).sort().at(-1) || first.updated_at,
  }
}

function formatPaymentLine(order) {
  const payments = getOrderPayments(order)
  if (payments.length > 0) {
    return payments
      .map(row => `${paymentMethodLabel(row.method)} ${formatMoney(row.amount)}`)
      .join(', ')
  }
  return paymentMethodLabel(order?.payment_method)
}

function normalizePriceMode(value) {
  return value === PRICE_MODE_TOURIST ? PRICE_MODE_TOURIST : 'regular'
}

function formatPriceModeLine(order) {
  const mode = normalizePriceMode(order?.price_mode)
  return mode === PRICE_MODE_TOURIST ? 'Тип меню: 🧳 Турист' : 'Тип меню: Обычное'
}

function isPaidOrder(order) {
  return order?.payment_status === 'paid' || order?.status === 'paid' || order?.status === 'completed'
}

function isOffPremiseOrder(order) {
  const type = String(order?.order_type || '').toLowerCase()
  return type === 'take_away' || type === 'delivery'
}

function getOrderItems(order) {
  return (order?.items || order?.order_items || [])
    .filter(item => String(item?.status || '').toLowerCase() !== 'cancelled')
    .filter(item => Math.max(0, Number(item?.quantity) || 0) > 0)
}

function getItemAmount(item) {
  const quantity = Math.max(0, Number(item?.quantity) || 0)
  const unitPrice = Number.isFinite(Number(item?.unit_price))
    ? Number(item.unit_price)
    : Number(item?.price) || 0
  return unitPrice * quantity
}

function parseJsonObject(value, fallback) {
  if (value && typeof value === 'object') return value
  if (typeof value !== 'string') return fallback
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? parsed : fallback
  } catch {
    return fallback
  }
}

function normalizeItemName(value) {
  return String(value || '').trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
}

function optionLabelIsFullItemName(label, parentName) {
  const normalizedLabel = normalizeItemName(label)
  const normalizedParent = normalizeItemName(parentName)
  const sharedPrefixLength = Math.min(5, normalizedParent.length)
  return sharedPrefixLength >= 4 && normalizedLabel.startsWith(normalizedParent.slice(0, sharedPrefixLength))
}

export function getRussianOrderItemDisplayName(item, menuItem = null) {
  const parentName = menuItem?.name_ru || item?.menu_name_ru || item?.name_ru || item?.name || item?.menu_item_id || '-'
  const selectedOptions = parseJsonObject(item?.selected_options || item?.selectedOptions, {})
  const optionGroups = parseJsonObject(menuItem?.option_groups || menuItem?.optionGroups, [])
  const selectedLabels = Array.isArray(optionGroups)
    ? optionGroups.map(group => {
        const selectedId = selectedOptions?.[String(group?.id || '')]
        const option = Array.isArray(group?.options)
          ? group.options.find(row => String(row?.id || '') === String(selectedId || ''))
          : null
        return String(option?.label_ru || option?.label || option?.name || '').trim()
      }).filter(Boolean)
    : []

  if (selectedLabels.length === 1 && optionLabelIsFullItemName(selectedLabels[0], parentName)) {
    return selectedLabels[0]
  }
  if (selectedLabels.length > 0) return `${parentName} · ${selectedLabels.join(', ')}`

  const noteMatch = String(item?.notes || '').match(/(?:Variants|Варианты|Variantlar)\s*:\s*([^\n]+)/i)
  if (noteMatch?.[1]) {
    const label = noteMatch[1].trim()
    return optionLabelIsFullItemName(label, parentName) ? label : `${parentName} · ${label}`
  }

  return parentName
}

function truncateText(value, maxLength) {
  const text = String(value || '-')
  return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 1))}.` : text
}

function buildItemRows(items) {
  const rows = [
    `${'Позиция'.padEnd(22)} ${'Кол'.padStart(3)} ${'Сумма'.padStart(10)}`,
  ]

  for (const item of items) {
    const name = truncateText(item?.telegram_display_name || getRussianOrderItemDisplayName(item), 22)
    const quantity = Math.max(0, Number(item?.quantity) || 0)
    const amount = formatRowMoney(getItemAmount(item))
    rows.push(`${name.padEnd(22)} ${String(quantity).padStart(3)} ${amount.padStart(10)}`)
  }

  return rows.join('\n')
}

function formatTelegramDateTime(value) {
  return formatDateTime(value, '-').replace(' ', ', ')
}

export function getCompletedOrdersChatIds(env = process.env) {
  const seen = new Set()
  return COMPLETED_ORDER_GROUP_CHAT_ID_ENV_KEYS
    .flatMap(key => String(env?.[key] || '').split(','))
    .map(value => value.trim())
    .filter(Boolean)
    .filter(value => {
      if (seen.has(value)) return false
      seen.add(value)
      return true
    })
}

export function shouldNotifyCompletedOrderGroup(status, order, env = process.env) {
  return status === 'completed' && isPaidOrder(order) && getCompletedOrdersChatIds(env).length > 0
}

export function buildCustomerStatusMessage(status, order) {
  const statusMessage = TELEGRAM_STATUS_MESSAGES[status]
  if (!statusMessage) return ''
  const orderLabel = order?.order_number || order?.id || '-'
  return `${statusMessage}\nOrder ${escapeTelegramHtml(orderLabel)}`
}

export function buildCompletedOrderGroupMessage(order) {
  const items = getOrderItems(order)
  const itemSubtotal = items.reduce((sum, item) => sum + getItemAmount(item), 0)
  const subtotal = Number.isFinite(Number(order?.subtotal)) ? Number(order.subtotal) : itemSubtotal
  const serviceFee = Number.isFinite(Number(order?.service_fee)) ? Number(order.service_fee) : 0
  const total = Number.isFinite(Number(order?.total)) ? Number(order.total) : subtotal + serviceFee
  const serviceRate = Number.isFinite(Number(order?.service_rate_pct))
    ? Number(order.service_rate_pct)
    : 0
  const closedAt = formatTelegramDateTime(order?.paid_at || order?.updated_at || order?.created_at)
  const lines = [
    isOffPremiseOrder(order)
      ? `Тип: ${escapeTelegramHtml(orderTypeLabel(order?.order_type, 'ru'))}`
      : `Стол: ${escapeTelegramHtml(order?.table_name || '-')}`,
    `Официант: ${escapeTelegramHtml(order?.waiter_name || '-')}`,
    `Закрыл: ${escapeTelegramHtml(order?.completed_by_name || '-')}`,
    `Дата: ${escapeTelegramHtml(closedAt)}`,
    escapeTelegramHtml(formatPriceModeLine(order)),
  ]

  if (items.length > 0) lines.push('', `<pre>${escapeTelegramHtml(buildItemRows(items))}</pre>`)
  lines.push('')
  lines.push(`Сумма заказа: ${escapeTelegramHtml(formatMoney(subtotal))}`)
  if (serviceFee > 0) lines.push(`Сервис ${escapeTelegramHtml(serviceRate)}%: ${escapeTelegramHtml(formatMoney(serviceFee))}`)
  lines.push(`Оплата: ${escapeTelegramHtml(formatPaymentLine(order))}`)
  if (Number.isFinite(Number(order?.dailyRevenueTotal))) {
    lines.push(`Доход · Сегодня: ${escapeTelegramHtml(formatMoney(order.dailyRevenueTotal))}`)
  }

  return lines.join('\n')
}
