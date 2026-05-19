import { supabase } from './supabase'
import {
  allocateSplitPaymentsToOrders,
  getOrderPaymentFields,
  getOrderPaymentSummary,
  getPaymentMethodSummary,
  normalizeSplitPayments,
} from './analytics'

// ── Loaders ───────────────────────────────────────────────────────────────────

function startOfYear() {
  return new Date(new Date().getFullYear(), 0, 1).toISOString()
}

function serviceRatePctFromSettings(settings) {
  const pct = Number(settings?.serviceRate)
  return Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 20
}

function normalizeOrderType(value) {
  const raw = String(value || '').toLowerCase()
  return raw.includes('take') || raw.includes('away') ? 'take_away' : 'dine_in'
}

function isMissingOptionalOrderTypeColumn(error) {
  const message = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return (
    message.includes('schema cache') &&
    (message.includes('order_type') || message.includes('order_number'))
  )
}

function makeTakeAwayOrderNumber(orderId) {
  const suffix = String(orderId || Date.now()).replace(/\D/g, '').slice(-4).padStart(4, '0')
  return `TA-${suffix}`
}

function normalizeBusinessSettings(row) {
  if (!row) return null
  return {
    restaurantName: row.restaurant_name || 'Zar Kebab',
    serviceRate: Number.isFinite(Number(row.service_rate_pct)) ? Number(row.service_rate_pct) : 20,
    receiptFooter: row.receipt_footer || 'Thank you for visiting!',
    autoPrint: !!row.auto_print,
  }
}

async function loadBusinessSettings() {
  const { data, error } = await supabase
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
  const [tablesRes, categoriesRes, menuItemsRes, unpaidRes, paidRes, settings] = await Promise.all([
    supabase.from('restaurant_tables').select('*').order('id'),
    supabase.from('menu_categories').select('*').order('sort_order'),
    supabase.from('menu_items').select('*').order('sort_order'),
    // All unpaid/active orders (no date limit)
    fetchOrdersByPaymentStatus('unpaid'),
    // Paid orders from the last 7 days (for revenue & best-sellers)
    fetchOrdersByPaymentStatus('paid', true),
    loadBusinessSettings(),
  ])

  return {
    tables:     tablesRes.data     || [],
    categories: categoriesRes.data || [],
    menuItems:  menuItemsRes.data  || [],
    orders:     [...(unpaidRes.data || []), ...(paidRes.data || [])],
    settings,
  }
}

// ── Realtime subscription ─────────────────────────────────────────────────────

export function subscribeToRealtime(dispatch) {
  let ordersReloadTimer = null
  let ordersReloadInFlight = false
  let ordersReloadQueued = false

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

  function scheduleReloadOrders() {
    if (ordersReloadTimer) clearTimeout(ordersReloadTimer)
    ordersReloadTimer = setTimeout(() => {
      ordersReloadTimer = null
      reloadOrders().catch(err => {
        ordersReloadInFlight = false
        console.error('[db] realtime orders reload failed:', err)
      })
    }, 250)
  }

  async function reloadTables() {
    const { data } = await supabase.from('restaurant_tables').select('*').order('id')
    if (data) dispatch({ type: 'SET_TABLES', payload: data })
  }

  const channel = supabase
    .channel('pos-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, scheduleReloadOrders)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, scheduleReloadOrders)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'order_payments' }, scheduleReloadOrders)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_tables' }, reloadTables)
    .subscribe(status => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('[db] realtime channel status:', status)
      }
    })

  return () => {
    if (ordersReloadTimer) clearTimeout(ordersReloadTimer)
    supabase.removeChannel(channel)
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
      console.log('Send to kitchen payload', { orderId, tableId, orderType, items })
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

      if (existingOrder) {
        const { data: updatedOrder, error: orderUpdateError } = await supabase.from('orders').update({
          status: 'sent_to_kitchen',
          ...paymentFields,
        }).eq('id', orderId).select('*').maybeSingle()
        if (orderUpdateError) throw orderUpdateError
        console.log('Created order', updatedOrder || { id: orderId, status: 'sent_to_kitchen' })
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
        console.log('Created order', createdOrder)
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
      console.log('Created kitchen items', insertedItems || rows)

      if (!isTakeAway) {
        await supabase
          .from('restaurant_tables')
          .update({ status: 'occupied' })
          .eq('id', tableId)
      }
      break
    }

    case 'UPDATE_ORDER_ITEM_STATUS': {
      const { orderId, orderItemId, menuItemId, status } = action.payload
      let query = supabase.from('order_items').update({ status }).eq('order_id', orderId)
      query = orderItemId ? query.eq('id', orderItemId) : query.eq('menu_item_id', menuItemId)
      const { error } = await query
      if (error) throw error
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
        const { error } = await supabase
          .from('order_items')
          .update({ quantity: nextQty })
          .eq('id', existing.id)
        if (error) throw error
        nextItems = (order.items || []).map(row => row.id === existing.id ? { ...row, quantity: nextQty } : row)
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
        }
        let { error } = await supabase.from('order_items').insert(row)
        if (error && isMissingOptionalOrderTypeColumn(error)) {
          const { order_type, ...fallbackRow } = row
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
        (o.items || []).some(row => orderItemId ? row.id === orderItemId : row.menu_item_id === menuItemId)
      )
      if (!order) return

      const target = (order.items || []).find(row => orderItemId ? row.id === orderItemId : row.menu_item_id === menuItemId)
      if (!target) return

      if (nextQty <= 0) {
        const { error } = await supabase.from('order_items').delete().eq('id', target.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('order_items').update({ quantity: nextQty }).eq('id', target.id)
        if (error) throw error
      }

      const nextItems = nextQty <= 0
        ? (order.items || []).filter(row => row.id !== target.id)
        : (order.items || []).map(row => row.id === target.id ? { ...row, quantity: nextQty } : row)
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
      const discPct = loyalty?.loyalty_discount_pct || 0

      // Fetch each unpaid order so we can write correct proportional values per round.
      // Writing the combined total to every row then summing in Reports caused double-counting.
      let unpaidQuery = supabase
        .from('orders')
        .select('*')
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
          const paymentFields = getOrderPaymentFields(
            { order_type: o.order_type, subtotal: Number(o.subtotal) || 0, service_rate_pct: serviceRatePct, loyalty_discount_pct: discPct },
            [],
            serviceRatePct
          )
          return {
            id: o.id,
            paymentFields,
            total: getOrderPaymentSummary(paymentFields, [], serviceRatePct).total,
          }
        })
        const totalDue = orderSummaries.reduce((sum, row) => sum + row.total, 0)
        const normalizedPayments = normalizeSplitPayments(
          requestedPayments || [{ method: payment_method || 'cash', amount: totalDue }],
          totalDue
        )
        const finalPaymentMethod = getPaymentMethodSummary(normalizedPayments, payment_method)
        const paymentRows = allocateSplitPaymentsToOrders(orderSummaries, normalizedPayments)

        if (paymentRows.length > 0) {
          const { error: deletePaymentsError } = await supabase
            .from('order_payments')
            .delete()
            .in('order_id', orderSummaries.map(row => row.id))
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

        for (const o of orderSummaries) {
          await supabase.from('orders').update({
            status:         'paid',
            payment_status: 'paid',
            paid_at:        paidAt,
            ...o.paymentFields,
            payment_method: finalPaymentMethod,
          }).eq('id', o.id)
        }
      }

      if (!orderId) {
        await supabase
          .from('restaurant_tables')
          .update({ status: 'available' })
          .eq('id', tableId)
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
          receipt_footer: settings.receiptFooter || '',
          auto_print: !!settings.autoPrint,
          updated_at: new Date().toISOString(),
        })
      if (error) throw error
      break
    }

    case 'ADD_TABLE': {
      await supabase.from('restaurant_tables').insert(action.payload)
      break
    }

    case 'UPDATE_TABLE': {
      const { id, ...fields } = action.payload
      await supabase.from('restaurant_tables').update(fields).eq('id', id)
      break
    }

    case 'DELETE_TABLE': {
      await supabase.from('restaurant_tables').delete().eq('id', action.payload)
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
