import {
  allocateSplitPaymentsToOrders,
  getOrderPaymentFields,
  getPaymentMethodSummary,
  normalizeSplitPayments,
  removeSentCartItems,
} from '../lib/analytics'
import {
  makeLocalId,
  makeTakeAwayOrderNumber,
  normalizeOrderType,
  recalcOrderTotals,
  serviceRatePctFromSettings,
} from './reducerHelpers'

export function ordersReducer(state, action) {
  switch (action.type) {
    case 'SET_ORDERS':
      return { ...state, orders: action.payload }

    case 'SEND_TO_KITCHEN': {
      const orderType = normalizeOrderType(action.payload?.orderType)
      const isTakeAway = orderType === 'take_away'
      const table = isTakeAway ? null : state.tables.find(t => t.id === state.currentTableId)
      if ((!isTakeAway && !table) || state.cart.length === 0) return state
      const orderId = action._orderId || ('o' + Date.now())
      const cartItems = action._items || state.cart.map(i => ({ ...i, id: makeLocalId(), status: 'new', order_type: orderType }))
      const addedSubtotal = cartItems.reduce((s, i) => s + i.price * i.quantity, 0)
      const activeOrder = state.orders.find(o =>
        o.id === orderId ||
        (!isTakeAway && o.table_id === state.currentTableId && o.payment_status !== 'paid')
      )
      const subtotal = (Number(activeOrder?.subtotal) || 0) + addedSubtotal
      const serviceRatePct = isTakeAway ? 0 : Number.isFinite(Number(activeOrder?.service_rate_pct))
        ? Number(activeOrder.service_rate_pct)
        : serviceRatePctFromSettings(state.settings)
      const paymentFields = getOrderPaymentFields(
        { subtotal, order_type: orderType, service_rate_pct: serviceRatePct },
        [],
        serviceRatePct
      )
      const nextOrders = activeOrder
        ? state.orders.map(o => o.id === activeOrder.id
            ? {
                ...o,
                status: 'sent_to_kitchen',
                items: [...(o.items || []), ...cartItems],
                ...paymentFields,
              }
            : o
          )
        : [...state.orders, {
            id: orderId,
            order_number: isTakeAway ? (action._orderNumber || makeTakeAwayOrderNumber(orderId)) : undefined,
            order_type: orderType,
            table_id: isTakeAway ? null : state.currentTableId,
            table_name: isTakeAway ? 'Take Away' : table.name,
            waiter_name: state.user?.name || 'Waiter',
            status: 'sent_to_kitchen',
            payment_status: 'unpaid',
            items: cartItems,
            ...paymentFields,
            created_at: new Date().toISOString(),
          }]
      const updatedTables = isTakeAway ? state.tables : state.tables.map(t =>
        t.id === state.currentTableId ? { ...t, status: 'occupied' } : t
      )
      return { ...state, orders: nextOrders, cart: removeSentCartItems(state.cart, cartItems), tables: updatedTables }
    }

    case 'UPDATE_ORDER_ITEM_STATUS': {
      const { orderId, orderItemId, menuItemId, status } = action.payload
      return {
        ...state,
        orders: state.orders.map(o =>
          o.id === orderId
            ? {
                ...o,
                items: o.items.map(i =>
                  (orderItemId ? i.id === orderItemId : i.menu_item_id === menuItemId)
                    ? { ...i, status }
                    : i
                ),
              }
            : o
        ),
      }
    }

    case 'CONFIRM_ORDER_DELIVERED': {
      const tableId = action.payload
      return {
        ...state,
        orders: state.orders.map(o =>
          o.table_id === tableId && o.payment_status !== 'paid'
            ? { ...o, status: 'delivered', items: o.items.map(i => ({ ...i, status: 'served' })) }
            : o
        ),
      }
    }

    case 'MARK_TABLE_NEEDS_BILL':
      return {
        ...state,
        tables: state.tables.map(t => t.id === action.payload ? { ...t, status: 'needs_bill' } : t),
        orders: state.orders.map(o => o.table_id === action.payload ? { ...o, status: 'needs_bill' } : o),
      }

    case 'ADD_QUICK_ITEM_TO_ORDER': {
      const { tableId, orderId, item } = action.payload
      const activeOrder = state.orders.find(o =>
        orderId ? o.id === orderId : o.table_id === tableId && o.payment_status !== 'paid'
      )
      if (!activeOrder || !item) return state

      const existing = (activeOrder.items || []).find(i =>
        i.menu_item_id === item.id &&
        !i.notes &&
        (i.status === 'served' || i.status === 'new' || i.status === 'ready' || i.status === 'preparing')
      )
      const nextItems = existing
        ? activeOrder.items.map(i => i.id === existing.id
            ? {
                ...i,
                quantity: (Number(i.quantity) || 1) + 1,
                item_type: i.item_type || i.itemType || 'counter',
                is_counter_item: true,
              }
            : i
          )
        : [
            ...(activeOrder.items || []),
            {
              id: action._itemId || makeLocalId(),
              menu_item_id: item.id,
              name: item.name,
              price: Number(item.price) || 0,
              quantity: 1,
              notes: '',
              status: item.sendToKitchen || item.send_to_kitchen ? 'new' : 'served',
              order_type: item.order_type || activeOrder.order_type || 'dine_in',
              item_type: item.item_type || item.itemType || 'counter',
              is_counter_item: item.is_counter_item ?? item.isCounterItem ?? true,
            },
          ]

      return {
        ...state,
        orders: state.orders.map(o => o.id === activeOrder.id
          ? recalcOrderTotals({ ...o, items: nextItems }, state.settings)
          : o
        ),
      }
    }

    case 'UPDATE_BILL_ITEM_QTY': {
      const { tableId, orderId, orderItemId, menuItemId, qty } = action.payload
      const sourceItemIds = new Set(action.payload.sourceItemIds || [])
      const nextQty = Math.max(0, Number(qty) || 0)

      return {
        ...state,
        orders: state.orders.map(o => {
          if ((orderId ? o.id !== orderId : o.table_id !== tableId) || o.payment_status === 'paid') return o
          const matchesItem = i => orderItemId
            ? i.id === orderItemId || sourceItemIds.has(i.id)
            : i.menu_item_id === menuItemId
          const target = (o.items || []).find(matchesItem)
          const hasItem = !!target
          if (!hasItem) return o
          const nextItems = nextQty <= 0
            ? (o.items || []).filter(i => !matchesItem(i))
            : (o.items || []).flatMap(i => {
                if (!matchesItem(i)) return [i]
                if (i.id !== target.id) return []
                return [{ ...i, quantity: nextQty }]
              })
          return recalcOrderTotals({ ...o, items: nextItems }, state.settings)
        }),
      }
    }

    case 'MARK_ORDER_PAID': {
      const tableId = typeof action.payload === 'string' ? action.payload : action.payload.tableId
      const orderId = typeof action.payload === 'object' ? action.payload.orderId : null
      const loyalty = typeof action.payload === 'object' ? action.payload.loyalty : null
      const payment_method = typeof action.payload === 'object' ? action.payload.payment_method : null
      const requestedPayments = typeof action.payload === 'object' ? action.payload.payments : null
      const paidAt = new Date().toISOString()
      const activeOrderSummaries = state.orders
        .filter(o => (orderId ? o.id === orderId : o.table_id === tableId) && o.payment_status !== 'paid')
        .map(o => {
          const isTakeAway = normalizeOrderType(o.order_type) === 'take_away'
          const serviceRatePct = isTakeAway ? 0 : Number.isFinite(Number(loyalty?.service_rate_pct))
            ? Number(loyalty.service_rate_pct)
            : Number.isFinite(Number(o.service_rate_pct))
              ? Number(o.service_rate_pct)
              : serviceRatePctFromSettings(state.settings)
          const fields = getOrderPaymentFields(
            { ...o, ...(loyalty || {}), service_rate_pct: serviceRatePct },
            o.items || [],
            serviceRatePct
          )
          return { id: o.id, fields, total: fields.total }
        })
      const totalDue = activeOrderSummaries.reduce((sum, row) => sum + row.total, 0)
      const payments = normalizeSplitPayments(
        requestedPayments || [{ method: payment_method || 'cash', amount: totalDue }],
        totalDue
      )
      const finalPaymentMethod = getPaymentMethodSummary(payments, payment_method)
      const paymentAllocations = new Map(activeOrderSummaries.map(row => [row.id, []]))
      allocateSplitPaymentsToOrders(activeOrderSummaries, payments).forEach(row => {
        paymentAllocations.get(row.order_id)?.push({ method: row.method, amount: row.amount })
      })
      return {
        ...state,
        tables: orderId ? state.tables : state.tables.map(t => t.id === tableId ? { ...t, status: 'available' } : t),
        orders: state.orders.map(o => {
          if ((orderId ? o.id !== orderId : o.table_id !== tableId) || o.payment_status === 'paid') return o
          const isTakeAway = normalizeOrderType(o.order_type) === 'take_away'
          const serviceRatePct = isTakeAway ? 0 : Number.isFinite(Number(loyalty?.service_rate_pct))
            ? Number(loyalty.service_rate_pct)
            : Number.isFinite(Number(o.service_rate_pct))
              ? Number(o.service_rate_pct)
              : serviceRatePctFromSettings(state.settings)
          const paymentFields = activeOrderSummaries.find(row => row.id === o.id)?.fields || getOrderPaymentFields(
            { ...o, ...(loyalty || {}), service_rate_pct: serviceRatePct },
            o.items || [],
            serviceRatePct
          )
          return {
            ...o,
            status: 'paid',
            payment_status: 'paid',
            paid_at: paidAt,
            payment_method: finalPaymentMethod,
            payments: paymentAllocations.get(o.id) || [],
            ...paymentFields,
          }
        }),
      }
    }

    default:
      return state
  }
}
