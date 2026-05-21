import { supabase } from './supabase.js'
import {
  allocateSplitPaymentsToOrders,
  calculateLoyaltyCashback,
  getOrderPaymentFields,
  getPaymentMethodSummary,
  normalizeServiceRatePct,
  normalizeSplitPayments,
  validateLoyaltyRedeemAmount,
} from './analytics.js'
import { getCashbackTypePercent } from './loyalty.js'
import { notifyTelegramOrderStatus } from './telegramNotifications.js'

// ── Loaders ───────────────────────────────────────────────────────────────────

function startOfYear() {
  return new Date(new Date().getFullYear(), 0, 1).toISOString()
}

function serviceRatePctFromSettings(settings) {
  return normalizeServiceRatePct(settings?.serviceRate)
}

function normalizeOrderType(value) {
  const raw = String(value || '').toLowerCase()
  return raw.includes('take') || raw.includes('away') ? 'take_away' : 'dine_in'
}

function isMissingOptionalOrderTypeColumn(error) {
  const message = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return (
    message.includes('schema cache') &&
    (
      message.includes('order_type') ||
      message.includes('order_number') ||
      message.includes('item_type') ||
      message.includes('is_counter_item')
    )
  )
}

function isMissingKitchenSubmitRpc(error) {
  const message = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return (
    message.includes('submit_order_to_kitchen') ||
    message.includes('schema cache') ||
    message.includes('function') && message.includes('not found')
  )
}

function isMissingTableReservationColumn(error) {
  const message = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return (
    message.includes('schema cache') &&
    (
      message.includes('reserved_for_name') ||
      message.includes('reserved_for_phone') ||
      message.includes('reserved_at') ||
      message.includes('reserved_until') ||
      message.includes('reservation_notes')
    )
  )
}

async function updateRestaurantTableStatus(tableId, fields, fallbackFields = null) {
  let { error } = await supabase
    .from('restaurant_tables')
    .update(fields)
    .eq('id', tableId)
  if (error && fallbackFields && isMissingTableReservationColumn(error)) {
    ;({ error } = await supabase
      .from('restaurant_tables')
      .update(fallbackFields)
      .eq('id', tableId))
  }
  if (error) throw error
}

function makeTakeAwayOrderNumber(orderId) {
  const suffix = String(orderId || Date.now()).replace(/\D/g, '').slice(-4).padStart(4, '0')
  return `TA-${suffix}`
}

function normalizeBusinessSettings(row) {
  if (!row) return null
  return {
    restaurantName: row.restaurant_name || 'Zar Kebab',
    serviceRate: normalizeServiceRatePct(row.service_rate_pct),
    cashbackPercent: Number.isFinite(Number(row.cashback_percent))
      ? Math.max(0, Math.min(100, Number(row.cashback_percent)))
      : 5,
    receiptFooter: row.receipt_footer || 'Thank you for visiting!',
    autoPrint: !!row.auto_print,
  }
}

function isMissingLoyaltyColumn(error) {
  const message = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return message.includes('schema cache') && (
    message.includes('loyalty_used_amount') ||
    message.includes('loyalty_card_number') ||
    message.includes('cashback_earned') ||
    message.includes('cashback_percent')
  )
}

function isMissingSchemaColumn(error, columnName) {
  const message = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return message.includes('schema cache') && message.includes(String(columnName || '').toLowerCase())
}

async function applyLoyaltyWalletSettlement({ loyalty, orderSummaries, state, paidAt }) {
  const cardNumber = String(loyalty?.loyalty_card_number || loyalty?.cardNumber || '').trim()
  const requestedRedeemAmount = Math.max(0, Math.round(Number(loyalty?.loyalty_used_amount ?? loyalty?.loyalty_redeem_amount ?? 0) || 0))
  const cardTypePercent = loyalty?.cashback_type
    ? getCashbackTypePercent(loyalty.cashback_type)
    : null
  const cashbackPercent = Number.isFinite(Number(cardTypePercent))
    ? cardTypePercent
    : Number.isFinite(Number(loyalty?.cashback_percent))
    ? Math.max(0, Math.min(100, Number(loyalty.cashback_percent)))
    : Math.max(0, Math.min(100, Number(state.settings?.cashbackPercent ?? 5)))

  if (!cardNumber && requestedRedeemAmount <= 0) {
    return orderSummaries.map(row => ({ ...row, loyaltyUsedAmount: 0, cashbackEarned: 0 }))
  }

  const { data: card, error: cardError } = await supabase
    .from('loyalty_cards')
    .select('*')
    .eq('card_number', cardNumber)
    .maybeSingle()
  if (cardError) throw cardError
  if (!card || card.is_active === false) throw new Error('Loyalty card is not active')

  const balance = Math.max(0, Math.round(Number(card.balance ?? card.balance_amount ?? 0) || 0))
  const totalBeforeLoyalty = orderSummaries.reduce((sum, row) => sum + row.grossTotal, 0)
  const validation = validateLoyaltyRedeemAmount(requestedRedeemAmount, balance, totalBeforeLoyalty)
  if (!validation.ok) {
    throw new Error(validation.reason === 'balance'
      ? 'Loyalty redeem amount exceeds available balance'
      : 'Loyalty redeem amount exceeds remaining bill')
  }

  let remainingRedeem = validation.amount
  const settled = orderSummaries.map(row => {
    const loyaltyUsedAmount = Math.min(remainingRedeem, row.grossTotal)
    remainingRedeem -= loyaltyUsedAmount
    const cashbackEarned = calculateLoyaltyCashback(
      { ...row.sourceOrder, loyalty_used_amount: loyaltyUsedAmount, status: 'paid', payment_status: 'paid' },
      row.sourceOrder.items || [],
      cashbackPercent
    )
    return { ...row, loyaltyUsedAmount, cashbackEarned }
  })

  const totalRedeemed = settled.reduce((sum, row) => sum + row.loyaltyUsedAmount, 0)
  const totalCashback = settled.reduce((sum, row) => sum + row.cashbackEarned, 0)
  const afterRedeem = balance - totalRedeemed
  const finalBalance = afterRedeem + totalCashback

  if (totalRedeemed > 0 || totalCashback > 0) {
    const { error: updateError } = await supabase
      .from('loyalty_cards')
      .update({
        balance: finalBalance,
        total_earned: Math.max(0, Math.round(Number(card.total_earned ?? 0) || 0)) + totalCashback,
        total_redeemed: Math.max(0, Math.round(Number(card.total_redeemed ?? 0) || 0)) + totalRedeemed,
        updated_at: paidAt,
      })
      .eq('id', card.id)
    if (updateError) throw updateError

    const transactions = []
    let runningBalance = balance
    for (const row of settled) {
      if (row.loyaltyUsedAmount > 0) {
        transactions.push({
          loyalty_card_id: card.id,
          order_id: row.id,
          type: 'redeemed',
          amount: row.loyaltyUsedAmount,
          balance_before: runningBalance,
          balance_after: runningBalance - row.loyaltyUsedAmount,
          reason: 'Order payment',
        })
        runningBalance -= row.loyaltyUsedAmount
      }
    }
    for (const row of settled) {
      if (row.cashbackEarned > 0) {
        transactions.push({
          loyalty_card_id: card.id,
          order_id: row.id,
          type: 'cashback_earned',
          amount: row.cashbackEarned,
          balance_before: runningBalance,
          balance_after: runningBalance + row.cashbackEarned,
          reason: `Cashback ${cashbackPercent}%`,
          cashback_percent_used: cashbackPercent,
          card_type_at_transaction: card.cashback_type || null,
        })
        runningBalance += row.cashbackEarned
      }
    }
    if (transactions.length > 0) {
      let { error: transactionError } = await supabase
        .from('loyalty_transactions')
        .insert(transactions)
      if (
        transactionError &&
        (isMissingSchemaColumn(transactionError, 'cashback_percent_used') ||
          isMissingSchemaColumn(transactionError, 'card_type_at_transaction'))
      ) {
        const legacyTransactions = transactions.map(({
          cashback_percent_used,
          card_type_at_transaction,
          ...row
        }) => row)
        ;({ error: transactionError } = await supabase
          .from('loyalty_transactions')
          .insert(legacyTransactions))
      }
      if (transactionError) throw transactionError
    }
  }

  return settled.map(row => ({
    ...row,
    loyaltyCardNumber: cardNumber,
    cashbackPercent,
  }))
}

async function submitOrderToKitchenRpc({ orderId, table, tableId, orderType, isTakeAway, items, paymentFields, state, action }) {
  const payload = {
    order: {
      id: orderId,
      table_id: isTakeAway ? null : tableId,
      table_name: isTakeAway ? 'Take Away' : table.name,
      waiter_name: state.user?.name || 'Waiter',
      status: 'sent_to_kitchen',
      payment_status: 'unpaid',
      order_type: orderType,
      order_number: isTakeAway ? (action._orderNumber || makeTakeAwayOrderNumber(orderId)) : null,
      ...paymentFields,
    },
    items: items.map(i => ({
      id: i.id,
      menu_item_id: i.menu_item_id,
      name: i.name,
      price: Number(i.price) || 0,
      quantity: Number(i.quantity) || 1,
      notes: i.notes || '',
      status: 'new',
      order_type: normalizeOrderType(i.order_type || orderType),
      item_type: i.item_type || i.itemType || 'menu',
      is_counter_item: !!(i.is_counter_item ?? i.isCounterItem),
    })),
    table_status: isTakeAway ? null : 'occupied',
  }

  const { error } = await supabase.rpc('submit_order_to_kitchen', { payload })
  return { error }
}

async function loadBusinessSettings(dbClient = supabase) {
  const { data, error } = await dbClient
    .from('business_settings')
    .select('*')
    .eq('id', 'default')
    .maybeSingle()

  if (error) {
    console.warn('[db] business settings unavailable, using local fallback:', error.message)
    return null
  }

  return normalizeBusinessSettings(data)
}

async function loadRestaurantTables(dbClient = supabase) {
  const sorted = await dbClient
    .from('restaurant_tables')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (!sorted.error) return sorted.data || []

  console.warn('[db] table management columns unavailable, loading tables by id:', sorted.error.message)
  const fallback = await dbClient.from('restaurant_tables').select('*').order('id')
  if (fallback.error) throw fallback.error
  return fallback.data || []
}

async function loadTableZones(dbClient = supabase) {
  const { data, error } = await dbClient
    .from('table_zones')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) {
    console.warn('[db] table_zones unavailable, using table zone names only:', error.message)
    return []
  }

  return data || []
}

async function fetchOrdersByPaymentStatus(paymentStatus, includeRecentPaidFilter = false) {
  const buildQuery = (select) => {
    let query = supabase.from('orders').select(select)
    query = paymentStatus === 'paid'
      ? query.eq('payment_status', 'paid')
      : query.neq('payment_status', 'paid')
    if (includeRecentPaidFilter) query = query.gte('created_at', startOfYear())
    return query.order('created_at', { ascending: false })
  }

  const withPayments = await buildQuery('*, items:order_items(*), payments:order_payments(*)')
  if (!withPayments.error) return withPayments

  console.warn('[db] order_payments relation unavailable, loading orders without split payments:', withPayments.error.message)
  return buildQuery('*, items:order_items(*)')
}

export async function loadOrders() {
  const [unpaidRes, paidRes] = await Promise.all([
    fetchOrdersByPaymentStatus('unpaid'),
    fetchOrdersByPaymentStatus('paid', true),
  ])

  if (unpaidRes.error) throw unpaidRes.error
  if (paidRes.error) throw paidRes.error

  return [...(unpaidRes.data || []), ...(paidRes.data || [])]
}

export async function loadPOSData() {
  const [tables, tableZones, categoriesRes, menuItemsRes, unpaidRes, paidRes, settings] = await Promise.all([
    loadRestaurantTables(),
    loadTableZones(),
    supabase.from('menu_categories').select('*').order('sort_order'),
    supabase.from('menu_items').select('*').order('sort_order'),
    // All unpaid/active orders (no date limit)
    fetchOrdersByPaymentStatus('unpaid'),
    // Paid orders from the last 7 days (for revenue & best-sellers)
    fetchOrdersByPaymentStatus('paid', true),
    loadBusinessSettings(),
  ])

  return {
    tables,
    tableZones,
    categories: categoriesRes.data || [],
    menuItems:  menuItemsRes.data  || [],
    orders:     [...(unpaidRes.data || []), ...(paidRes.data || [])],
    settings,
  }
}

// ── Realtime subscription ─────────────────────────────────────────────────────

export function subscribeToRealtime(dispatch, options = {}) {
  const dbClient = options.dbClient || supabase
  const settingsLoader = options.settingsLoader || (() => loadBusinessSettings(dbClient))
  const debounceMs = options.debounceMs ?? 250

  let ordersReloadTimer = null
  let ordersReloadInFlight = false
  let ordersReloadQueued = false
  let settingsReloadTimer = null

  function notifyRemoteChange(payload) {
    if (!payload || payload.eventType !== 'UPDATE') return
    dispatch({
      type: 'SET_CONNECTION_NOTICE',
      payload: {
        tone: 'info',
        message: 'Changed by another device. Refreshed the latest data.',
      },
    })
  }

  async function reloadOrders() {
    if (ordersReloadInFlight) {
      ordersReloadQueued = true
      return
    }

    ordersReloadInFlight = true
    dispatch({ type: 'SET_ORDERS', payload: await loadOrders() })
    ordersReloadInFlight = false

    if (ordersReloadQueued) {
      ordersReloadQueued = false
      scheduleReloadOrders()
    }
  }

  function scheduleReloadOrders(payload) {
    notifyRemoteChange(payload)
    if (ordersReloadTimer) clearTimeout(ordersReloadTimer)
    ordersReloadTimer = setTimeout(() => {
      ordersReloadTimer = null
      reloadOrders().catch(err => {
        ordersReloadInFlight = false
        console.error('[db] realtime orders reload failed:', err)
      })
    }, debounceMs)
  }

  async function reloadTables(payload) {
    notifyRemoteChange(payload)
    dispatch({ type: 'SET_TABLES', payload: await loadRestaurantTables(dbClient) })
  }

  async function reloadTableZones() {
    dispatch({ type: 'SET_TABLE_ZONES', payload: await loadTableZones(dbClient) })
  }

  function scheduleReloadSettings() {
    if (settingsReloadTimer) clearTimeout(settingsReloadTimer)
    settingsReloadTimer = setTimeout(() => {
      settingsReloadTimer = null
      settingsLoader()
        .then(settings => {
          if (settings) dispatch({ type: 'SET_SETTINGS', payload: settings })
        })
        .catch(err => console.error('[db] realtime settings reload failed:', err))
    }, debounceMs)
  }

  const channel = dbClient
    .channel(`pos-realtime-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, scheduleReloadOrders)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, scheduleReloadOrders)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'order_payments' }, scheduleReloadOrders)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_tables' }, reloadTables)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'table_zones' }, reloadTableZones)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'business_settings' }, scheduleReloadSettings)
    .subscribe(status => {
      if (status === 'SUBSCRIBED') {
        dispatch({ type: 'SET_CONNECTION_NOTICE', payload: null })
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('[db] realtime channel status:', status)
        dispatch({
          type: 'SET_CONNECTION_NOTICE',
          payload: {
            tone: 'error',
            message: 'Realtime connection is unstable. Data may be delayed.',
          },
        })
      }
    })

  return () => {
    if (ordersReloadTimer) clearTimeout(ordersReloadTimer)
    if (settingsReloadTimer) clearTimeout(settingsReloadTimer)
    dbClient.removeChannel(channel)
  }
}

// ── Writers ───────────────────────────────────────────────────────────────────

export async function writeToSupabase(action, state) {
  switch (action.type) {

    case 'SEND_TO_KITCHEN': {
      const orderId  = action._orderId
      const tableId  = state.currentTableId
      const orderType = normalizeOrderType(action.payload?.orderType)
      const isTakeAway = orderType === 'take_away'
      const table    = isTakeAway ? null : state.tables.find(t => t.id === tableId)
      if ((!isTakeAway && !table) || state.cart.length === 0) return

      const items = action._items || state.cart.map(i => ({ ...i, status: 'new', order_type: orderType }))
      const addedSubtotal = items.reduce((s, i) => s + i.price * i.quantity, 0)
      const { data: existingOrder } = await supabase
        .from('orders')
        .select('id, subtotal, service_rate_pct')
        .eq('id', orderId)
        .eq('payment_status', 'unpaid')
        .maybeSingle()

      const subtotal    = (Number(existingOrder?.subtotal) || 0) + addedSubtotal
      const serviceRatePct = isTakeAway ? 0 : Number.isFinite(Number(existingOrder?.service_rate_pct))
        ? Number(existingOrder.service_rate_pct)
        : serviceRatePctFromSettings(state.settings)
      const paymentFields = getOrderPaymentFields(
        { subtotal, order_type: orderType, service_rate_pct: serviceRatePct },
        [],
        serviceRatePct
      )

      const rpcResult = await submitOrderToKitchenRpc({
        orderId,
        table,
        tableId,
        orderType,
        isTakeAway,
        items,
        paymentFields,
        state,
        action,
      })
      if (!rpcResult.error) break
      if (!isMissingKitchenSubmitRpc(rpcResult.error)) throw rpcResult.error

      if (existingOrder) {
        const { data: updatedOrder, error: orderUpdateError } = await supabase.from('orders').update({
          status: 'sent_to_kitchen',
          ...paymentFields,
        }).eq('id', orderId).select('*').maybeSingle()
        if (orderUpdateError) throw orderUpdateError
      } else {
        const orderInsert = {
          id:             orderId,
          table_id:       isTakeAway ? null : tableId,
          table_name:     isTakeAway ? 'Take Away' : table.name,
          waiter_name:    state.user?.name || 'Waiter',
          status:         'sent_to_kitchen',
          payment_status: 'unpaid',
          ...paymentFields,
        }
        if (isTakeAway) {
          orderInsert.order_number = action._orderNumber || makeTakeAwayOrderNumber(orderId)
          orderInsert.order_type = orderType
        }
        let { data: createdOrder, error: orderInsertError } = await supabase.from('orders').insert(orderInsert).select('*').maybeSingle()
        if (orderInsertError && isTakeAway && isMissingOptionalOrderTypeColumn(orderInsertError)) {
          // Backward-compatible fallback while the take-away migration is being applied.
          // table_id=null + service_fee=0 still lets the order reach kitchen/cashier.
          const { order_type, order_number, ...fallbackOrderInsert } = orderInsert
          ;({ data: createdOrder, error: orderInsertError } = await supabase.from('orders').insert(fallbackOrderInsert).select('*').maybeSingle())
        }
        if (orderInsertError) throw orderInsertError
      }

      const rows = items.map(i => ({
        id:           i.id,
        order_id:     orderId,
        menu_item_id: i.menu_item_id,
        name:         i.name,
        price:        i.price,
        quantity:     i.quantity,
        notes:        i.notes || '',
        status:       'new',
        order_type:   normalizeOrderType(i.order_type || orderType),
      }))
      let { data: insertedItems, error: itemInsertError } = await supabase
        .from('order_items')
        .insert(rows)
        .select('*')
      if (itemInsertError && isMissingOptionalOrderTypeColumn(itemInsertError)) {
        const fallbackRows = rows.map(({ order_type, ...row }) => row)
        ;({ data: insertedItems, error: itemInsertError } = await supabase
          .from('order_items')
          .insert(fallbackRows)
          .select('*'))
      }
      if (itemInsertError) throw itemInsertError

      if (!isTakeAway) {
        await updateRestaurantTableStatus(
          tableId,
          {
            status: 'occupied',
            reserved_for_name: '',
            reserved_for_phone: '',
            reserved_at: null,
            reserved_until: null,
            reservation_notes: '',
          },
          { status: 'occupied' }
        )
      }
      break
    }

    case 'UPDATE_ORDER_ITEM_STATUS': {
      const { orderId, orderItemId, menuItemId, status } = action.payload
      let query = supabase.from('order_items').update({ status }).eq('order_id', orderId)
      query = orderItemId ? query.eq('id', orderItemId) : query.eq('menu_item_id', menuItemId)
      const { error } = await query
      if (error) throw error
      await notifyTelegramOrderStatus(orderId, status)
      break
    }

    case 'CONFIRM_ORDER_DELIVERED': {
      const tableId = action.payload
      // Mark all active orders for this table as delivered
      const { data: tableOrders } = await supabase
        .from('orders')
        .select('id')
        .eq('table_id', tableId)
        .eq('payment_status', 'unpaid')
      if (tableOrders?.length) {
        const ids = tableOrders.map(o => o.id)
        await supabase.from('orders').update({ status: 'delivered' }).in('id', ids)
        await supabase.from('order_items').update({ status: 'served' }).in('order_id', ids)
        await Promise.all(ids.map(id => notifyTelegramOrderStatus(id, 'completed')))
      }
      break
    }

    case 'MARK_TABLE_NEEDS_BILL': {
      const tableId = action.payload
      await supabase
        .from('restaurant_tables')
        .update({ status: 'needs_bill' })
        .eq('id', tableId)
      await supabase
        .from('orders')
        .update({ status: 'needs_bill' })
        .eq('table_id', tableId)
        .eq('payment_status', 'unpaid')
      break
    }

    case 'ADD_QUICK_ITEM_TO_ORDER': {
      const { tableId, orderId, item } = action.payload
      if ((!tableId && !orderId) || !item) return

      let query = supabase
        .from('orders')
        .select('*, items:order_items(*)')
        .eq('payment_status', 'unpaid')
      query = orderId ? query.eq('id', orderId) : query.eq('table_id', tableId)
      const { data: orders, error: ordersError } = await query
        .order('created_at', { ascending: true })
      if (ordersError) throw ordersError

      const order = orders?.[0]
      if (!order) return

      const existing = (order.items || []).find(row =>
        row.menu_item_id === item.id &&
        !row.notes &&
        ['served', 'new', 'ready', 'preparing'].includes(row.status)
      )

      let nextItems
      if (existing) {
        const nextQty = (Number(existing.quantity) || 1) + 1
        const updateRow = {
          quantity: nextQty,
          item_type: existing.item_type || existing.itemType || 'counter',
          is_counter_item: true,
        }
        let { error } = await supabase
          .from('order_items')
          .update(updateRow)
          .eq('id', existing.id)
        if (error && isMissingOptionalOrderTypeColumn(error)) {
          ;({ error } = await supabase
            .from('order_items')
            .update({ quantity: nextQty })
            .eq('id', existing.id))
        }
        if (error) throw error
        nextItems = (order.items || []).map(row => row.id === existing.id
          ? {
              ...row,
              quantity: nextQty,
              item_type: row.item_type || row.itemType || 'counter',
              is_counter_item: true,
            }
          : row
        )
      } else {
        const row = {
          id: action._itemId,
          order_id: order.id,
          menu_item_id: item.id,
          name: item.name,
          price: Number(item.price) || 0,
          quantity: 1,
          notes: '',
          status: item.sendToKitchen || item.send_to_kitchen ? 'new' : 'served',
          order_type: item.order_type || order.order_type || 'dine_in',
          item_type: item.item_type || item.itemType || 'counter',
          is_counter_item: item.is_counter_item ?? item.isCounterItem ?? true,
        }
        let { error } = await supabase.from('order_items').insert(row)
        if (error && isMissingOptionalOrderTypeColumn(error)) {
          const { order_type, item_type, is_counter_item, ...fallbackRow } = row
          ;({ error } = await supabase.from('order_items').insert(fallbackRow))
        }
        if (error) throw error
        nextItems = [...(order.items || []), row]
      }

      const serviceRatePct = normalizeOrderType(order.order_type) === 'take_away' ? 0 : Number.isFinite(Number(order.service_rate_pct))
        ? Number(order.service_rate_pct)
        : serviceRatePctFromSettings(state.settings)
      const paymentFields = getOrderPaymentFields(
        { order_type: order.order_type, service_rate_pct: serviceRatePct },
        nextItems,
        serviceRatePct
      )
      const { error: orderUpdateError } = await supabase
        .from('orders')
        .update(paymentFields)
        .eq('id', order.id)
      if (orderUpdateError) throw orderUpdateError
      break
    }

    case 'UPDATE_BILL_ITEM_QTY': {
      const { tableId, orderId, orderItemId, menuItemId, qty } = action.payload
      const sourceItemIds = new Set(action.payload.sourceItemIds || [])
      const nextQty = Math.max(0, Number(qty) || 0)
      if ((!tableId && !orderId) || (!orderItemId && !menuItemId)) return

      let query = supabase
        .from('orders')
        .select('*, items:order_items(*)')
        .eq('payment_status', 'unpaid')
      query = orderId ? query.eq('id', orderId) : query.eq('table_id', tableId)
      const { data: orders, error: ordersError } = await query
      if (ordersError) throw ordersError

      const order = (orders || []).find(o =>
        (o.items || []).some(row => orderItemId ? row.id === orderItemId || sourceItemIds.has(row.id) : row.menu_item_id === menuItemId)
      )
      if (!order) return

      const matchesItem = row => orderItemId
        ? row.id === orderItemId || sourceItemIds.has(row.id)
        : row.menu_item_id === menuItemId
      const target = (order.items || []).find(matchesItem)
      if (!target) return
      const duplicateIds = (order.items || [])
        .filter(row => matchesItem(row) && row.id !== target.id)
        .map(row => row.id)

      if (nextQty <= 0) {
        const idsToDelete = [target.id, ...duplicateIds]
        const { error } = await supabase.from('order_items').delete().in('id', idsToDelete)
        if (error) throw error
      } else {
        const { error } = await supabase.from('order_items').update({ quantity: nextQty }).eq('id', target.id)
        if (error) throw error
        if (duplicateIds.length > 0) {
          const { error: deleteDuplicatesError } = await supabase.from('order_items').delete().in('id', duplicateIds)
          if (deleteDuplicatesError) throw deleteDuplicatesError
        }
      }

      const nextItems = nextQty <= 0
        ? (order.items || []).filter(row => !matchesItem(row))
        : (order.items || []).flatMap(row => {
            if (!matchesItem(row)) return [row]
            if (row.id !== target.id) return []
            return [{ ...row, quantity: nextQty }]
          })
      const serviceRatePct = normalizeOrderType(order.order_type) === 'take_away' ? 0 : Number.isFinite(Number(order.service_rate_pct))
        ? Number(order.service_rate_pct)
        : serviceRatePctFromSettings(state.settings)
      const paymentFields = getOrderPaymentFields(
        { order_type: order.order_type, service_rate_pct: serviceRatePct },
        nextItems,
        serviceRatePct
      )
      const { error: orderUpdateError } = await supabase
        .from('orders')
        .update(paymentFields)
        .eq('id', order.id)
      if (orderUpdateError) throw orderUpdateError
      break
    }

    case 'MARK_ORDER_PAID': {
      const tableId        = typeof action.payload === 'string' ? action.payload : action.payload.tableId
      const orderId        = typeof action.payload === 'object' ? action.payload.orderId : null
      const loyalty        = typeof action.payload === 'object' ? action.payload.loyalty : null
      const payment_method = typeof action.payload === 'object' ? action.payload.payment_method : null
      const requestedPayments = typeof action.payload === 'object' ? action.payload.payments : null

      const paidAt  = new Date().toISOString()

      // Fetch each unpaid order so we can write correct proportional values per round.
      // Writing the combined total to every row then summing in Reports caused double-counting.
      let unpaidQuery = supabase
        .from('orders')
        .select('*, items:order_items(*)')
        .eq('payment_status', 'unpaid')
      unpaidQuery = orderId ? unpaidQuery.eq('id', orderId) : unpaidQuery.eq('table_id', tableId)
      const { data: unpaidOrders } = await unpaidQuery

      if (unpaidOrders?.length) {
        const orderSummaries = unpaidOrders.map(o => {
          const serviceRatePct = normalizeOrderType(o.order_type) === 'take_away' ? 0 : Number.isFinite(Number(loyalty?.service_rate_pct))
            ? Math.max(0, Math.min(100, Number(loyalty.service_rate_pct)))
            : Number.isFinite(Number(o.service_rate_pct))
              ? Math.max(0, Math.min(100, Number(o.service_rate_pct)))
              : serviceRatePctFromSettings(state.settings)
          const grossPaymentFields = getOrderPaymentFields(
            { order_type: o.order_type, service_rate_pct: serviceRatePct },
            o.items || [],
            serviceRatePct
          )
          return {
            id: o.id,
            sourceOrder: { ...o, service_rate_pct: serviceRatePct },
            serviceRatePct,
            grossTotal: grossPaymentFields.total,
          }
        })
        const settledSummaries = await applyLoyaltyWalletSettlement({ loyalty, orderSummaries, state, paidAt })
        const finalSummaries = settledSummaries.map(row => {
          const paymentFields = getOrderPaymentFields(
            {
              order_type: row.sourceOrder.order_type,
              service_rate_pct: row.serviceRatePct,
              loyalty_used_amount: row.loyaltyUsedAmount,
              loyalty_redeem_amount: row.loyaltyUsedAmount,
              cashback_earned: row.cashbackEarned,
            },
            row.sourceOrder.items || [],
            row.serviceRatePct
          )
          return {
            id: row.id,
            paymentFields,
            loyaltyCardNumber: row.loyaltyCardNumber || null,
            cashbackEarned: row.cashbackEarned || 0,
            cashbackPercent: row.cashbackPercent || 0,
            total: paymentFields.total,
          }
        })
        const totalDue = finalSummaries.reduce((sum, row) => sum + row.total, 0)
        const normalizedPayments = normalizeSplitPayments(
          requestedPayments || [{ method: payment_method || 'cash', amount: totalDue }],
          totalDue
        )
        const finalPaymentMethod = getPaymentMethodSummary(normalizedPayments, payment_method)
        const paymentRows = allocateSplitPaymentsToOrders(finalSummaries, normalizedPayments)

        if (paymentRows.length > 0) {
          const { error: deletePaymentsError } = await supabase
            .from('order_payments')
            .delete()
            .in('order_id', finalSummaries.map(row => row.id))
          const paymentsTableMissing = deletePaymentsError && /order_payments|schema cache|relation/i.test(deletePaymentsError.message || '')
          if (deletePaymentsError && !paymentsTableMissing) throw deletePaymentsError

          if (!paymentsTableMissing) {
            const { error: insertPaymentsError } = await supabase
              .from('order_payments')
              .insert(paymentRows)
            if (insertPaymentsError) throw insertPaymentsError
          } else {
            console.warn('[db] order_payments table is missing; paid order will keep only summary payment_method')
          }
        }

        for (const o of finalSummaries) {
          const updateFields = {
            status:         'paid',
            payment_status: 'paid',
            paid_at:        paidAt,
            ...o.paymentFields,
            loyalty_card_number: o.loyaltyCardNumber,
            cashback_earned: o.cashbackEarned,
            cashback_percent: o.cashbackPercent,
            payment_method: finalPaymentMethod,
          }
          let { error: updateError } = await supabase.from('orders').update(updateFields).eq('id', o.id)
          if (updateError && isMissingLoyaltyColumn(updateError)) {
            const {
              loyalty_used_amount,
              loyalty_redeem_amount,
              loyalty_card_number,
              cashback_earned,
              cashback_percent,
              ...fallbackFields
            } = updateFields
            ;({ error: updateError } = await supabase.from('orders').update(fallbackFields).eq('id', o.id))
          }
          if (updateError) throw updateError
          await notifyTelegramOrderStatus(o.id, 'completed')
        }
      }

      if (!orderId) {
        await updateRestaurantTableStatus(
          tableId,
          {
            status: 'available',
            reserved_for_name: '',
            reserved_for_phone: '',
            reserved_at: null,
            reserved_until: null,
            reservation_notes: '',
          },
          { status: 'available' }
        )
      }
      break
    }

    case 'SET_SETTINGS': {
      const settings = action.payload || {}
      const serviceRatePct = serviceRatePctFromSettings({ serviceRate: settings.serviceRate })
      const { error } = await supabase
        .from('business_settings')
        .upsert({
          id: 'default',
          restaurant_name: settings.restaurantName || 'Zar Kebab',
          service_rate_pct: serviceRatePct,
          cashback_percent: Number.isFinite(Number(settings.cashbackPercent))
            ? Math.max(0, Math.min(100, Number(settings.cashbackPercent)))
            : 5,
          receipt_footer: settings.receiptFooter || '',
          auto_print: !!settings.autoPrint,
          updated_at: new Date().toISOString(),
        })
      if (error) throw error
      break
    }

    case 'ADD_TABLE': {
      const { error } = await supabase.from('restaurant_tables').insert(action.payload)
      if (error) throw error
      break
    }

    case 'UPDATE_TABLE': {
      const { id, ...fields } = action.payload
      const { error } = await supabase.from('restaurant_tables').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', id)
      if (error) throw error
      break
    }

    case 'DELETE_TABLE': {
      const { error } = await supabase.from('restaurant_tables').delete().eq('id', action.payload)
      if (error) throw error
      break
    }

    case 'ADD_TABLE_ZONE': {
      const { error } = await supabase.from('table_zones').insert(action.payload)
      if (error) throw error
      break
    }

    case 'UPDATE_TABLE_ZONE': {
      const { id, ...fields } = action.payload
      const { error } = await supabase.from('table_zones').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', id)
      if (error) throw error
      break
    }

    case 'ADD_MENU_ITEM': {
      await supabase.from('menu_items').insert(action.payload)
      break
    }

    case 'UPDATE_MENU_ITEM': {
      const { id, ...fields } = action.payload
      await supabase.from('menu_items').update(fields).eq('id', id)
      break
    }

    case 'DELETE_MENU_ITEM': {
      await supabase.from('menu_items').delete().eq('id', action.payload)
      break
    }

    case 'REORDER_MENU_ITEM': {
      const { idA, idB } = action.payload
      const itemA = state.menuItems.find(i => i.id === idA)
      const itemB = state.menuItems.find(i => i.id === idB)
      if (!itemA || !itemB) return

      await Promise.all([
        supabase.from('menu_items').update({ sort_order: itemB.sort_order ?? 0 }).eq('id', idA),
        supabase.from('menu_items').update({ sort_order: itemA.sort_order ?? 0 }).eq('id', idB),
      ])
      break
    }

    case 'REORDER_QUICK_ITEM': {
      const { idA, idB } = action.payload
      const itemA = state.menuItems.find(i => i.id === idA)
      const itemB = state.menuItems.find(i => i.id === idB)
      if (!itemA || !itemB) return

      const orderA = Number(itemA.quick_item_sort_order ?? itemA.sort_order ?? 0)
      const orderB = Number(itemB.quick_item_sort_order ?? itemB.sort_order ?? 0)
      await Promise.all([
        supabase.from('menu_items').update({ quick_item_sort_order: orderB }).eq('id', idA),
        supabase.from('menu_items').update({ quick_item_sort_order: orderA }).eq('id', idB),
      ])
      break
    }

    case 'ADD_CATEGORY': {
      await supabase.from('menu_categories').insert(action.payload)
      break
    }

    case 'UPDATE_CATEGORY': {
      const { id, ...fields } = action.payload
      await supabase.from('menu_categories').update(fields).eq('id', id)
      break
    }

    case 'DELETE_CATEGORY': {
      await supabase.from('menu_categories').delete().eq('id', action.payload)
      break
    }

    case 'REORDER_CATEGORY': {
      const { idA, idB } = action.payload
      const catA = state.categories.find(c => c.id === idA)
      const catB = state.categories.find(c => c.id === idB)
      if (!catA || !catB) return

      await Promise.all([
        supabase.from('menu_categories').update({ sort_order: catB.sort_order ?? 0 }).eq('id', idA),
        supabase.from('menu_categories').update({ sort_order: catA.sort_order ?? 0 }).eq('id', idB),
      ])
      break
    }

    default:
      break
  }
}
