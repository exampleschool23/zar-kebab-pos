import { supabase } from './supabase'

// ── Loaders ───────────────────────────────────────────────────────────────────

function startOfYear() {
  return new Date(new Date().getFullYear(), 0, 1).toISOString()
}

function serviceRateFromSettings(settings) {
  const pct = Number(settings?.serviceRate)
  return Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) / 100 : 0.2
}

function serviceRatePctFromSettings(settings) {
  return Math.round(serviceRateFromSettings(settings) * 100)
}

export async function loadPOSData() {
  const [tablesRes, categoriesRes, menuItemsRes, unpaidRes, paidRes] = await Promise.all([
    supabase.from('restaurant_tables').select('*').order('id'),
    supabase.from('menu_categories').select('*').order('sort_order'),
    supabase.from('menu_items').select('*').order('sort_order'),
    // All unpaid/active orders (no date limit)
    supabase
      .from('orders')
      .select('*, items:order_items(*)')
      .neq('payment_status', 'paid')
      .order('created_at', { ascending: false }),
    // Paid orders from the last 7 days (for revenue & best-sellers)
    supabase
      .from('orders')
      .select('*, items:order_items(*)')
      .eq('payment_status', 'paid')
      .gte('created_at', startOfYear())
      .order('created_at', { ascending: false }),
  ])

  return {
    tables:     tablesRes.data     || [],
    categories: categoriesRes.data || [],
    menuItems:  menuItemsRes.data  || [],
    orders:     [...(unpaidRes.data || []), ...(paidRes.data || [])],
  }
}

// ── Realtime subscription ─────────────────────────────────────────────────────

export function subscribeToRealtime(dispatch) {
  async function reloadOrders() {
    const [unpaid, paid] = await Promise.all([
      supabase
        .from('orders')
        .select('*, items:order_items(*)')
        .neq('payment_status', 'paid')
        .order('created_at', { ascending: false }),
      supabase
        .from('orders')
        .select('*, items:order_items(*)')
        .eq('payment_status', 'paid')
        .gte('created_at', startOfYear())
        .order('created_at', { ascending: false }),
    ])
    const combined = [...(unpaid.data || []), ...(paid.data || [])]
    dispatch({ type: 'SET_ORDERS', payload: combined })
  }

  async function reloadTables() {
    const { data } = await supabase.from('restaurant_tables').select('*').order('id')
    if (data) dispatch({ type: 'SET_TABLES', payload: data })
  }

  const channel = supabase
    .channel('pos-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, reloadOrders)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, reloadOrders)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_tables' }, reloadTables)
    .subscribe()

  return () => supabase.removeChannel(channel)
}

// ── Writers ───────────────────────────────────────────────────────────────────

export async function writeToSupabase(action, state) {
  switch (action.type) {

    case 'SEND_TO_KITCHEN': {
      const orderId  = action._orderId
      const tableId  = state.currentTableId
      const table    = state.tables.find(t => t.id === tableId)
      if (!table || state.cart.length === 0) return

      const items = action._items || state.cart.map(i => ({ ...i, status: 'new' }))
      const addedSubtotal = items.reduce((s, i) => s + i.price * i.quantity, 0)
      const { data: existingOrder } = await supabase
        .from('orders')
        .select('id, subtotal')
        .eq('id', orderId)
        .eq('payment_status', 'unpaid')
        .maybeSingle()

      const subtotal    = (Number(existingOrder?.subtotal) || 0) + addedSubtotal
      const serviceRatePct = serviceRatePctFromSettings(state.settings)
      const service_fee = Math.round(subtotal * serviceRatePct / 100)

      if (existingOrder) {
        await supabase.from('orders').update({
          status: 'sent_to_kitchen',
          subtotal,
          service_fee,
          service_rate_pct: serviceRatePct,
          total: subtotal + service_fee,
        }).eq('id', orderId)
      } else {
        await supabase.from('orders').insert({
          id:             orderId,
          table_id:       tableId,
          table_name:     table.name,
          waiter_name:    state.user?.name || 'Waiter',
          status:         'sent_to_kitchen',
          payment_status: 'unpaid',
          subtotal,
          service_fee,
          service_rate_pct: serviceRatePct,
          total:          subtotal + service_fee,
        })
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
      }))
      await supabase.from('order_items').insert(rows)

      await supabase
        .from('restaurant_tables')
        .update({ status: 'occupied' })
        .eq('id', tableId)
      break
    }

    case 'UPDATE_ORDER_ITEM_STATUS': {
      const { orderId, orderItemId, menuItemId, status } = action.payload
      let query = supabase.from('order_items').update({ status }).eq('order_id', orderId)
      query = orderItemId ? query.eq('id', orderItemId) : query.eq('menu_item_id', menuItemId)
      await query
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

    case 'MARK_ORDER_PAID': {
      const tableId        = typeof action.payload === 'string' ? action.payload : action.payload.tableId
      const loyalty        = typeof action.payload === 'object' ? action.payload.loyalty : null
      const payment_method = typeof action.payload === 'object' ? action.payload.payment_method : null

      const paidAt  = new Date().toISOString()
      const discPct = loyalty?.loyalty_discount_pct || 0

      // Fetch each unpaid order so we can write correct proportional values per round.
      // Writing the combined total to every row then summing in Reports caused double-counting.
      const { data: unpaidOrders } = await supabase
        .from('orders')
        .select('id, subtotal')
        .eq('table_id', tableId)
        .eq('payment_status', 'unpaid')

      if (unpaidOrders?.length) {
        const combinedSubtotal   = unpaidOrders.reduce((s, o) => s + (Number(o.subtotal) || 0), 0)
        const combinedAfterDisc  = combinedSubtotal * (1 - discPct / 100)
        // Derive service rate from what CashierBill computed; fall back to settings.
        const serviceRate = combinedAfterDisc > 0 && loyalty?.service_fee
          ? loyalty.service_fee / combinedAfterDisc
          : serviceRateFromSettings(state.settings)

        for (const o of unpaidOrders) {
          const sub     = Number(o.subtotal) || 0
          const discAmt = Math.round(sub * discPct / 100)
          const afterDisc = sub - discAmt
          const svcFee  = Math.round(afterDisc * serviceRate)
          await supabase.from('orders').update({
            status:         'paid',
            payment_status: 'paid',
            paid_at:        paidAt,
            total:          afterDisc + svcFee,
            service_fee:    svcFee,
            service_rate_pct: Math.round(serviceRate * 100),
            ...(payment_method ? { payment_method }                              : {}),
            ...(discPct        ? { loyalty_discount_pct:    discPct }            : {}),
            ...(discAmt        ? { loyalty_discount_amount: discAmt }            : {}),
          }).eq('id', o.id)
        }
      }

      await supabase
        .from('restaurant_tables')
        .update({ status: 'available' })
        .eq('id', tableId)
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
