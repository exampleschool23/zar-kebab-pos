import { randomUUID } from 'crypto'
import { getOrderPaymentFields } from '../../src/lib/analytics.js'
import { normalizeOrderType, orderTypeLabel } from '../../src/lib/orderTypes.js'
import { getBearerToken, json, methodNotAllowed, readJson } from './_lib/http.js'
import { getSupabaseAdmin } from './_lib/supabaseAdmin.js'
import { sendTelegramMessage, verifyTelegramSession } from './_lib/telegram.js'

function makeOrderNumber(orderId) {
  const suffix = String(orderId).replace(/\D/g, '').slice(-4).padStart(4, '0')
  return `TG-${suffix}`
}

function getItemDisplayName(item) {
  return item.name_ru || item.name_uz || item.name_en || item.id
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res)

  try {
    const session = verifyTelegramSession(getBearerToken(req))
    const body = await readJson(req)
    const requestedItems = Array.isArray(body.items) ? body.items : []
    if (requestedItems.length === 0) return json(res, 400, { error: 'Order items are required' })

    const supabase = getSupabaseAdmin()
    const ids = [...new Set(requestedItems.map(item => String(item.menuItemId || item.menu_item_id || item.id || '')).filter(Boolean))]
    const { data: menuItems, error: menuError } = await supabase
      .from('menu_items')
      .select('id, name_uz, name_ru, name_en, price, available')
      .in('id', ids)
      .eq('available', true)
    if (menuError) throw menuError

    const byId = new Map((menuItems || []).map(item => [item.id, item]))
    const rows = requestedItems.map(item => {
      const menuItemId = String(item.menuItemId || item.menu_item_id || item.id || '')
      const menuItem = byId.get(menuItemId)
      if (!menuItem) throw new Error(`Menu item is not available: ${menuItemId}`)
      const quantity = Math.max(1, Math.min(99, Math.round(Number(item.quantity) || 1)))
      return {
        id: randomUUID(),
        menu_item_id: menuItem.id,
        name: getItemDisplayName(menuItem),
        price: Math.round(Number(menuItem.price) || 0),
        quantity,
        notes: String(item.notes || '').slice(0, 500),
        status: 'new',
        order_type: normalizeOrderType(body.orderType),
      }
    })

    const orderId = `tg-${Date.now()}-${randomUUID().slice(0, 8)}`
    const orderType = normalizeOrderType(body.orderType)
    const { data: settings } = await supabase
      .from('business_settings')
      .select('service_rate_pct')
      .eq('id', 'default')
      .maybeSingle()
    const configuredServiceRatePct = Number.isFinite(Number(settings?.service_rate_pct))
      ? Math.max(0, Math.min(100, Number(settings.service_rate_pct)))
      : 20
    const serviceRatePct = orderType === 'dine_in' ? configuredServiceRatePct : 0
    const subtotalBeforeDiscount = rows.reduce((sum, row) => sum + row.price * row.quantity, 0)
    const maxRedeemAmount = subtotalBeforeDiscount + Math.round(subtotalBeforeDiscount * serviceRatePct / 100)
    const requestedRedeemAmount = Math.max(0, Math.round(Number(body.loyaltyRedeemAmount) || 0))
    const loyaltyCardNumber = body.loyaltyCardNumber ? String(body.loyaltyCardNumber).trim() : ''
    let loyaltyRedeemAmount = 0

    if (requestedRedeemAmount > 0 || loyaltyCardNumber) {
      if (!/^\d{8}$/.test(loyaltyCardNumber)) {
        return json(res, 400, { error: 'A valid 8-digit loyalty card is required to redeem balance' })
      }

      const { data: loyaltyCard, error: loyaltyError } = await supabase
        .from('loyalty_cards')
        .select('*')
        .eq('card_number', loyaltyCardNumber)
        .maybeSingle()

      if (loyaltyError) throw loyaltyError
      const balance = Math.max(0, Math.round(Number(loyaltyCard?.balance || loyaltyCard?.balance_amount || 0)))
      if (!loyaltyCard || balance <= 0) {
        return json(res, 400, { error: 'Loyalty card is not valid' })
      }
      if (requestedRedeemAmount > balance) {
        return json(res, 400, { error: 'Loyalty redeem amount exceeds available balance' })
      }
      if (requestedRedeemAmount > maxRedeemAmount) {
        return json(res, 400, { error: 'Loyalty redeem amount exceeds order total' })
      }
      loyaltyRedeemAmount = requestedRedeemAmount
    }

    const paymentFields = getOrderPaymentFields(
      {
        order_type: orderType,
        service_rate_pct: serviceRatePct,
        loyalty_redeem_amount: loyaltyRedeemAmount,
        loyalty_used_amount: loyaltyRedeemAmount,
      },
      rows,
      serviceRatePct
    )
    const tableName = `Telegram ${orderTypeLabel(orderType, 'en')}`

    const orderInsert = {
      id: orderId,
      order_number: makeOrderNumber(orderId),
      table_id: null,
      table_name: tableName,
      waiter_name: 'Telegram',
      status: 'sent_to_kitchen',
      payment_status: 'unpaid',
      payment_method: 'pay_at_cashier',
      order_type: orderType,
      source: 'telegram',
      telegram_user_id: session.telegramUserId,
      customer_id: session.customerId,
      notes: String(body.notes || '').slice(0, 1000),
      loyalty_card_number: loyaltyCardNumber || null,
      loyalty_redeem_amount: loyaltyRedeemAmount,
      ...paymentFields,
    }

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert(orderInsert)
      .select('*')
      .single()
    if (orderError) throw orderError

    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(rows.map(row => ({ ...row, order_id: orderId })))
    if (itemsError) throw itemsError

    sendTelegramMessage(session.chatId || session.telegramUserId, `✅ Order accepted\nOrder ${order.order_number || order.id}`)
      .catch(error => console.warn('[telegram/order] notification failed:', error.message))

    return json(res, 201, { order: { ...order, items: rows } })
  } catch (error) {
    console.error('[telegram/order]', error)
    return json(res, 400, { error: error.message || 'Could not create Telegram order' })
  }
}
