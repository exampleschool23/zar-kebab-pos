import { json, methodNotAllowed, readJson } from './_lib/http.js'
import { getSupabaseAdmin } from './_lib/supabaseAdmin.js'
import { sendTelegramMessage, TELEGRAM_STATUS_MESSAGES } from './_lib/telegram.js'
import { getOrderNetProfit, getOrdersCostTotal } from '../../src/lib/profit.js'
import {
  buildCompletedOrderGroupMessage,
  buildCustomerStatusMessage,
  getCompletedOrdersChatIds,
  getRussianOrderItemDisplayName,
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

function isMissingProfitSchema(error) {
  const message = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return message.includes('cost_price') || message.includes('menu_item_costs') || message.includes('schema cache')
}

async function loadCurrentMenuItemCosts(supabase, items = []) {
  const menuItemIds = [...new Set(items
    .filter(item => item?.cost_price == null)
    .map(item => item?.menu_item_id)
    .filter(Boolean))]
  if (menuItemIds.length === 0) return { available: true, menuItemMap: new Map() }

  let { data, error } = await supabase
    .from('menu_item_costs')
    .select('menu_item_id, cost_price, variant_costs')
    .in('menu_item_id', menuItemIds)
  if (error && isMissingProfitSchema(error)) {
    ;({ data, error } = await supabase
      .from('menu_item_costs')
      .select('menu_item_id, cost_price')
      .in('menu_item_id', menuItemIds))
  }
  if (error) {
    if (isMissingProfitSchema(error)) return { available: false, menuItemMap: new Map() }
    throw error
  }

  return {
    available: true,
    menuItemMap: new Map((data || []).map(row => [row.menu_item_id, row])),
  }
}

async function loadCompletedOrderNetProfit(supabase, order) {
  const { available, menuItemMap } = await loadCurrentMenuItemCosts(supabase, order?.items || [])
  return available ? getOrderNetProfit(order, menuItemMap) : null
}

async function loadPaidTotalsForRestaurantDay(supabase, paidAt) {
  const { start, end } = getRestaurantDayUtcRange(paidAt)
  let { data, error } = await supabase
    .from('orders')
    .select('total, items:order_items(menu_item_id, quantity, cost_price, selected_options, status)')
    .eq('payment_status', 'paid')
    .gte('paid_at', start)
    .lt('paid_at', end)
  if (error && isMissingProfitSchema(error)) {
    ;({ data, error } = await supabase
      .from('orders')
      .select('total, items:order_items(menu_item_id, quantity, selected_options, status)')
      .eq('payment_status', 'paid')
      .gte('paid_at', start)
      .lt('paid_at', end))
  }
  if (error) throw error

  const orders = data || []
  const revenueTotal = orders.reduce((sum, row) => sum + (Number(row.total) || 0), 0)
  const { available, menuItemMap } = await loadCurrentMenuItemCosts(
    supabase,
    orders.flatMap(order => order.items || [])
  )
  if (!available) return { revenueTotal, netProfitTotal: null }

  return {
    revenueTotal,
    netProfitTotal: Math.round(revenueTotal - getOrdersCostTotal(orders, menuItemMap)),
  }
}

async function loadRussianMenuItems(supabase, items = []) {
  const ids = [...new Set(items.map(item => item?.menu_item_id).filter(Boolean))]
  if (ids.length === 0) return new Map()

  const { data, error } = await supabase
    .from('menu_items')
    .select('id, name_ru, option_groups')
    .in('id', ids)
  if (error) throw error

  return new Map((data || []).map(item => [item.id, item]))
}

async function withRussianMenuItemNames(supabase, order) {
  const menuItems = await loadRussianMenuItems(supabase, order?.items || [])
  return {
    ...order,
    items: (order?.items || []).map(item => {
      const menuItem = menuItems.get(item.menu_item_id)
      return {
        ...item,
        menu_name_ru: menuItem?.name_ru || '',
        telegram_display_name: getRussianOrderItemDisplayName(item, menuItem),
      }
    }),
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
    let { data: orders, error } = await supabase
      .from('orders')
      .select('id, source, telegram_user_id, customer_id, order_number, table_name, waiter_name, order_type, price_mode, status, payment_status, payment_method, subtotal, service_fee, service_rate_pct, total, loyalty_card_number, loyalty_used_amount, loyalty_redeem_amount, loyalty_discount_amount, completed_by_name, paid_at, created_at, updated_at, items:order_items(name, menu_item_id, quantity, price, unit_price, cost_price, price_mode, selected_options, notes, status), payments:order_payments(method, amount), loyalty_transactions(type, customer_name_at_transaction, card_number_at_transaction)')
      .in('id', orderIds)
    if (error && isMissingProfitSchema(error)) {
      ;({ data: orders, error } = await supabase
        .from('orders')
        .select('id, source, telegram_user_id, customer_id, order_number, table_name, waiter_name, order_type, price_mode, status, payment_status, payment_method, subtotal, service_fee, service_rate_pct, total, loyalty_card_number, loyalty_used_amount, loyalty_redeem_amount, loyalty_discount_amount, completed_by_name, paid_at, created_at, updated_at, items:order_items(name, menu_item_id, quantity, price, unit_price, price_mode, selected_options, notes, status), payments:order_payments(method, amount), loyalty_transactions(type, customer_name_at_transaction, card_number_at_transaction)')
        .in('id', orderIds))
    }
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
      const orderNetProfit = await loadCompletedOrderNetProfit(supabase, localizedOrder)
      const { revenueTotal: dailyRevenueTotal, netProfitTotal: dailyNetProfitTotal } = await loadPaidTotalsForRestaurantDay(
        supabase,
        combinedOrder.paid_at || combinedOrder.updated_at || new Date()
      )
      const text = buildCompletedOrderGroupMessage({
        ...localizedOrder,
        orderNetProfit,
        dailyRevenueTotal,
        dailyNetProfitTotal,
      })
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
