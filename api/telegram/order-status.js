import { json, methodNotAllowed, readJson } from './_lib/http.js'
import { getSupabaseAdmin } from './_lib/supabaseAdmin.js'
import { sendTelegramMessage, TELEGRAM_STATUS_MESSAGES } from './_lib/telegram.js'
import {
  buildCompletedOrderGroupMessage,
  buildCustomerStatusMessage,
  getCompletedOrdersChatIds,
  mergeCompletedOrders,
  shouldNotifyCompletedOrderGroup,
} from './_lib/orderStatusMessages.js'

const ITEM_STATUS_TO_TELEGRAM_STATUS = {
  preparing: 'preparing',
  ready: 'ready',
  served: 'completed',
}

const RESTAURANT_UTC_OFFSET_MS = 5 * 60 * 60 * 1000

function getRestaurantDayUtcRange(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value)
  const shifted = new Date(date.getTime() + RESTAURANT_UTC_OFFSET_MS)
  const startShifted = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
    0,
    0,
    0,
    0
  )
  return {
    start: new Date(startShifted - RESTAURANT_UTC_OFFSET_MS).toISOString(),
    end: new Date(startShifted + 24 * 60 * 60 * 1000 - RESTAURANT_UTC_OFFSET_MS).toISOString(),
  }
}

async function loadPaidRevenueForRestaurantDay(supabase, paidAt) {
  const { start, end } = getRestaurantDayUtcRange(paidAt)
  const { data, error } = await supabase
    .from('orders')
    .select('total')
    .eq('payment_status', 'paid')
    .gte('paid_at', start)
    .lt('paid_at', end)
  if (error) throw error
  return (data || []).reduce((sum, row) => sum + (Number(row.total) || 0), 0)
}

async function loadRussianMenuItemNames(supabase, items = []) {
  const ids = [...new Set(items.map(item => item?.menu_item_id).filter(Boolean))]
  if (ids.length === 0) return new Map()

  const { data, error } = await supabase
    .from('menu_items')
    .select('id, name_ru')
    .in('id', ids)
  if (error) throw error

  return new Map((data || []).map(item => [item.id, item.name_ru || '']))
}

async function withRussianMenuItemNames(supabase, order) {
  const itemNames = await loadRussianMenuItemNames(supabase, order?.items || [])
  return {
    ...order,
    items: (order?.items || []).map(item => ({
      ...item,
      menu_name_ru: itemNames.get(item.menu_item_id) || '',
    })),
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res)

  try {
    const { orderId, orderIds: requestedOrderIds, status } = await readJson(req)
    const orderIds = [...new Set((Array.isArray(requestedOrderIds) ? requestedOrderIds : [orderId]).filter(Boolean))]
    const telegramStatus = TELEGRAM_STATUS_MESSAGES[status]
      ? status
      : ITEM_STATUS_TO_TELEGRAM_STATUS[status]
    if (orderIds.length === 0 || !telegramStatus || !TELEGRAM_STATUS_MESSAGES[telegramStatus]) {
      return json(res, 400, { error: 'Valid orderId/orderIds and status are required' })
    }

    const supabase = getSupabaseAdmin()
    const { data: orders, error } = await supabase
      .from('orders')
      .select('id, source, telegram_user_id, customer_id, order_number, table_name, waiter_name, order_type, price_mode, status, payment_status, payment_method, subtotal, service_fee, service_rate_pct, total, completed_by_name, paid_at, created_at, updated_at, items:order_items(name, menu_item_id, quantity, price, unit_price, price_mode, status), payments:order_payments(method, amount)')
      .in('id', orderIds)
    if (error) throw error
    if (!orders?.length) {
      return json(res, 200, { skipped: true })
    }

    const sends = []
    let customerSent = false
    let completedGroupSentCount = 0

    for (const order of orders) if (order.source === 'telegram' && order.telegram_user_id) {
      const { data: telegramUser } = await supabase
        .from('telegram_users')
        .select('chat_id')
        .eq('telegram_user_id', order.telegram_user_id)
        .maybeSingle()

      const chatId = telegramUser?.chat_id || order.telegram_user_id
      sends.push(
        sendTelegramMessage(chatId, buildCustomerStatusMessage(telegramStatus, order))
          .then(() => { customerSent = true })
      )
    }

    const completedOrders = orders.filter(order => shouldNotifyCompletedOrderGroup(telegramStatus, order))
    if (completedOrders.length > 0) {
      const combinedOrder = mergeCompletedOrders(completedOrders)
      const localizedOrder = await withRussianMenuItemNames(supabase, combinedOrder)
      const dailyRevenueTotal = await loadPaidRevenueForRestaurantDay(supabase, combinedOrder.paid_at || combinedOrder.updated_at || new Date())
      const text = buildCompletedOrderGroupMessage({ ...localizedOrder, dailyRevenueTotal })
      for (const chatId of getCompletedOrdersChatIds()) {
        sends.push(
          sendTelegramMessage(chatId, text)
            .then(() => { completedGroupSentCount += 1 })
        )
      }
    }

    if (sends.length === 0) {
      return json(res, 200, { skipped: true })
    }

    const results = await Promise.allSettled(sends)
    const failedCount = results.filter(result => result.status === 'rejected').length
    if (failedCount > 0) {
      for (const result of results) {
        if (result.status === 'rejected') console.error('[telegram/order-status] send failed:', result.reason)
      }
      return json(res, 502, { error: 'Could not notify every Telegram chat', failedCount })
    }

    return json(res, 200, { ok: true, customerSent, completedGroupSentCount })
  } catch (error) {
    console.error('[telegram/order-status]', error)
    return json(res, 400, { error: error.message || 'Could not notify Telegram' })
  }
}
