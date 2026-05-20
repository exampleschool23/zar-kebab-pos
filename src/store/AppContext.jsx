import React, { createContext, useContext, useReducer, useEffect, useRef } from 'react'
import { loadPOSData, writeToSupabase, subscribeToRealtime } from '../lib/db'
import {
  allocateSplitPaymentsToOrders,
  getOrderPaymentFields,
  getPaymentMethodSummary,
  normalizeServiceRatePct,
  normalizeSplitPayments,
  removeSentCartItems,
} from '../lib/analytics'

const AppContext = createContext(null)

const DEFAULT_SETTINGS = {
  restaurantName: 'Zar Kebab',
  serviceRate:    20,   // percent (0–100)
  receiptFooter:  'Thank you for visiting!',
  autoPrint:      false,
}

function loadSettings() {
  try {
    const s = localStorage.getItem('zk_settings')
    return s ? JSON.parse(s) : {}
  } catch { return {} }
}

function loadInitialLang() {
  try {
    if (!localStorage.getItem('zk_default_lang_ru_applied')) {
      localStorage.setItem('zk_lang', 'ru')
      localStorage.setItem('zk_default_lang_ru_applied', '1')
      return 'ru'
    }
    return localStorage.getItem('zk_lang') || 'ru'
  } catch {
    return 'ru'
  }
}

function normalizeOrderType(value) {
  const raw = String(value || '').toLowerCase()
  return raw.includes('take') || raw.includes('away') ? 'take_away' : 'dine_in'
}

function serviceRatePctFromSettings(settings) {
  return normalizeServiceRatePct(settings?.serviceRate)
}

function makeLocalId(prefix) {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

function recalcOrderTotals(order, settings) {
  const isTakeAway = normalizeOrderType(order?.order_type || order?.orderType) === 'take_away'
  const serviceRatePct = isTakeAway ? 0 : Number.isFinite(Number(order?.service_rate_pct))
    ? Number(order.service_rate_pct)
    : serviceRatePctFromSettings(settings)
  const paymentFields = getOrderPaymentFields(
    { ...order, order_type: isTakeAway ? 'take_away' : normalizeOrderType(order?.order_type || order?.orderType), service_rate_pct: serviceRatePct },
    order?.items || [],
    serviceRatePct
  )
  return { ...order, ...paymentFields }
}

function makeTakeAwayOrderNumber(orderId) {
  const suffix = String(orderId || Date.now()).replace(/\D/g, '').slice(-4).padStart(4, '0')
  return `TA-${suffix}`
}

function getQuickSortOrder(item) {
  const value = Number(item?.quick_item_sort_order ?? item?.quickItemSortOrder ?? item?.sort_order ?? 9999)
  return Number.isFinite(value) ? value : 9999
}

const initialState = {
  lang:           loadInitialLang(),
  settings:       { ...DEFAULT_SETTINGS, ...loadSettings() },
  user:           null,
  tables:         [],
  menuItems:      [],
  categories:     [],
  orders:         [],
  cart:           [],
  currentTableId: null,
  connectionNotice: null,
  loaded:         false,
}

function reducer(state, action) {
  switch (action.type) {
    case 'SET_LANG':
      localStorage.setItem('zk_lang', action.payload)
      return { ...state, lang: action.payload }

    case 'SET_SETTINGS': {
      const next = { ...state.settings, ...action.payload }
      localStorage.setItem('zk_settings', JSON.stringify(next))
      return { ...state, settings: next }
    }

    case 'LOGIN':
      return { ...state, user: action.payload }

    case 'LOGOUT':
      return { ...state, user: null, cart: [], currentTableId: null }

    case 'SET_TABLE':
      return { ...state, currentTableId: action.payload }

    // ── Supabase hydration ────────────────────────────────────────────────────
    case 'SET_TABLES':
      return { ...state, tables: action.payload }

    case 'SET_ORDERS':
      return { ...state, orders: action.payload }

    case 'SET_CATEGORIES':
      return { ...state, categories: action.payload }

    case 'SET_MENU_ITEMS':
      return { ...state, menuItems: action.payload }

    case 'SET_LOADED':
      return { ...state, loaded: true }

    case 'SET_CONNECTION_NOTICE':
      return { ...state, connectionNotice: action.payload || null }

    // ── Cart ──────────────────────────────────────────────────────────────────
    case 'ADD_TO_CART': {
      const existing = state.cart.find(i => i.menu_item_id === action.payload.menu_item_id)
      if (existing) {
        return {
          ...state,
          cart: state.cart.map(i =>
            i.menu_item_id === action.payload.menu_item_id
              ? { ...i, quantity: i.quantity + 1 }
              : i
          ),
        }
      }
      return { ...state, cart: [...state.cart, { ...action.payload, quantity: 1, notes: '' }] }
    }

    case 'REMOVE_FROM_CART':
      return { ...state, cart: state.cart.filter(i => i.menu_item_id !== action.payload) }

    case 'UPDATE_CART_QTY': {
      const { menu_item_id, qty } = action.payload
      if (qty <= 0) return { ...state, cart: state.cart.filter(i => i.menu_item_id !== menu_item_id) }
      return {
        ...state,
        cart: state.cart.map(i => i.menu_item_id === menu_item_id ? { ...i, quantity: qty } : i),
      }
    }

    case 'UPDATE_CART_NOTES': {
      const { menu_item_id, notes } = action.payload
      return {
        ...state,
        cart: state.cart.map(i => i.menu_item_id === menu_item_id ? { ...i, notes } : i),
      }
    }

    case 'CLEAR_CART':
      return { ...state, cart: [] }

    // ── Orders ────────────────────────────────────────────────────────────────
    case 'SEND_TO_KITCHEN': {
      const orderType = normalizeOrderType(action.payload?.orderType)
      const isTakeAway = orderType === 'take_away'
      const table = isTakeAway ? null : state.tables.find(t => t.id === state.currentTableId)
      if ((!isTakeAway && !table) || state.cart.length === 0) return state
      const orderId     = action._orderId || ('o' + Date.now())
      const cartItems   = action._items || state.cart.map(i => ({ ...i, id: makeLocalId('oi'), status: 'new', order_type: orderType }))
      const addedSubtotal = cartItems.reduce((s, i) => s + i.price * i.quantity, 0)
      const activeOrder = state.orders.find(o =>
        o.id === orderId ||
        (!isTakeAway && o.table_id === state.currentTableId && o.payment_status !== 'paid')
      )
      const subtotal    = (Number(activeOrder?.subtotal) || 0) + addedSubtotal
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
              id: action._itemId || makeLocalId('oi'),
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
      const tableId        = typeof action.payload === 'string' ? action.payload : action.payload.tableId
      const orderId        = typeof action.payload === 'object' ? action.payload.orderId : null
      const loyalty        = typeof action.payload === 'object' ? action.payload.loyalty : null
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

    // ── Tables management ─────────────────────────────────────────────────────
    case 'ADD_TABLE':
      return { ...state, tables: [...state.tables, action.payload] }

    case 'UPDATE_TABLE':
      return { ...state, tables: state.tables.map(t => t.id === action.payload.id ? action.payload : t) }

    case 'DELETE_TABLE':
      return { ...state, tables: state.tables.filter(t => t.id !== action.payload) }

    // ── Menu items management ─────────────────────────────────────────────────
    case 'ADD_MENU_ITEM': {
      const maxItemOrder = state.menuItems.length > 0
        ? Math.max(...state.menuItems.map(i => i.sort_order ?? 0))
        : 0
      return { ...state, menuItems: [...state.menuItems, { sort_order: maxItemOrder + 1, ...action.payload }] }
    }

    case 'UPDATE_MENU_ITEM':
      return { ...state, menuItems: state.menuItems.map(i => i.id === action.payload.id ? action.payload : i) }

    case 'DELETE_MENU_ITEM':
      return { ...state, menuItems: state.menuItems.filter(i => i.id !== action.payload) }

    case 'REORDER_MENU_ITEM': {
      const { idA, idB } = action.payload
      const itemA = state.menuItems.find(i => i.id === idA)
      const itemB = state.menuItems.find(i => i.id === idB)
      if (!itemA || !itemB) return state
      const orderA = itemA.sort_order ?? 0
      const orderB = itemB.sort_order ?? 0
      return {
        ...state,
        menuItems: state.menuItems.map(i => {
          if (i.id === idA) return { ...i, sort_order: orderB }
          if (i.id === idB) return { ...i, sort_order: orderA }
          return i
        }),
      }
    }

    case 'REORDER_QUICK_ITEM': {
      const { idA, idB } = action.payload
      const itemA = state.menuItems.find(i => i.id === idA)
      const itemB = state.menuItems.find(i => i.id === idB)
      if (!itemA || !itemB) return state
      const orderA = getQuickSortOrder(itemA)
      const orderB = getQuickSortOrder(itemB)
      return {
        ...state,
        menuItems: state.menuItems.map(i => {
          if (i.id === idA) return { ...i, quick_item_sort_order: orderB }
          if (i.id === idB) return { ...i, quick_item_sort_order: orderA }
          return i
        }),
      }
    }

    // ── Categories management ─────────────────────────────────────────────────
    case 'ADD_CATEGORY': {
      const realCats = state.categories.filter(c => c.id !== 'all')
      const maxCatOrder = realCats.length > 0
        ? Math.max(...realCats.map(c => c.sort_order ?? 0))
        : 0
      return { ...state, categories: [...state.categories, { sort_order: maxCatOrder + 1, ...action.payload }] }
    }

    case 'UPDATE_CATEGORY':
      return { ...state, categories: state.categories.map(c => c.id === action.payload.id ? action.payload : c) }

    case 'DELETE_CATEGORY':
      return { ...state, categories: state.categories.filter(c => c.id !== action.payload) }

    case 'REORDER_CATEGORY': {
      const { idA, idB } = action.payload
      const catA = state.categories.find(c => c.id === idA)
      const catB = state.categories.find(c => c.id === idB)
      if (!catA || !catB) return state
      const orderA = catA.sort_order ?? 0
      const orderB = catB.sort_order ?? 0
      return {
        ...state,
        categories: state.categories.map(c => {
          if (c.id === idA) return { ...c, sort_order: orderB }
          if (c.id === idB) return { ...c, sort_order: orderA }
          return c
        }),
      }
    }

    default:
      return state
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState)

  // Always-current state reference for async callbacks (avoids stale closures)
  const stateRef = useRef(state)
  useEffect(() => { stateRef.current = state }, [state])

  // dbDispatch: optimistic local update + async Supabase write
  function dbDispatch(action) {
    // Pre-inject a stable orderId so reducer and Supabase writer share it
      const enriched = action.type === 'SEND_TO_KITCHEN'
      ? {
          ...action,
          _orderId: normalizeOrderType(action.payload?.orderType) === 'take_away'
            ? `ta-${Date.now()}`
            : stateRef.current.orders.find(o =>
              o.table_id === stateRef.current.currentTableId && o.payment_status !== 'paid'
            )?.id || 'o' + Date.now(),
          _orderNumber: normalizeOrderType(action.payload?.orderType) === 'take_away'
            ? makeTakeAwayOrderNumber(Date.now())
            : undefined,
          _items: stateRef.current.cart.map(i => ({
            ...i,
            id: makeLocalId('oi'),
            status: 'new',
            order_type: normalizeOrderType(action.payload?.orderType),
          })),
        }
      : action.type === 'ADD_QUICK_ITEM_TO_ORDER'
        ? {
            ...action,
            _itemId: makeLocalId('oi'),
          }
      : action

    if (enriched.type === 'UPDATE_ORDER_ITEM_STATUS' || enriched.type === 'SEND_TO_KITCHEN') {
      return writeToSupabase(enriched, stateRef.current)
        .then(() => {
          dispatch(enriched)
          dispatch({ type: 'SET_CONNECTION_NOTICE', payload: null })
          return { error: null }
        })
        .catch(err => {
          console.error('[db] write failed:', action.type, err)
          dispatch({
            type: 'SET_CONNECTION_NOTICE',
            payload: {
              tone: 'error',
              message: stateRef.current.lang === 'ru'
                ? 'Не удалось сохранить изменения. Проверьте подключение.'
                : stateRef.current.lang === 'uz'
                  ? 'O‘zgarishlarni saqlab bo‘lmadi. Internet ulanishini tekshiring.'
                  : 'Could not save changes. Check the connection.',
            },
          })
          return { error: err }
        })
    }

    dispatch(enriched)
    return writeToSupabase(enriched, stateRef.current)
      .then(() => {
        dispatch({ type: 'SET_CONNECTION_NOTICE', payload: null })
        return { error: null }
      })
      .catch(err => {
        console.error('[db] write failed:', action.type, err)
        dispatch({
          type: 'SET_CONNECTION_NOTICE',
          payload: {
            tone: 'error',
            message: stateRef.current.lang === 'ru'
              ? 'Не удалось сохранить изменения. Проверьте подключение.'
              : stateRef.current.lang === 'uz'
                ? 'O‘zgarishlarni saqlab bo‘lmadi. Internet ulanishini tekshiring.'
                : 'Could not save changes. Check the connection.',
          },
        })
        return { error: err }
      })
  }

  // Load from Supabase on mount + subscribe to realtime
  useEffect(() => {
    let unsubscribe = () => {}

    loadPOSData()
      .then(({ tables, categories, menuItems, orders, settings }) => {
        dispatch({ type: 'SET_TABLES',     payload: tables })
        dispatch({ type: 'SET_CATEGORIES', payload: categories })
        dispatch({ type: 'SET_MENU_ITEMS', payload: menuItems })
        dispatch({ type: 'SET_ORDERS',     payload: orders })
        if (settings) dispatch({ type: 'SET_SETTINGS', payload: settings })
        dispatch({ type: 'SET_LOADED' })
        unsubscribe = subscribeToRealtime(dispatch)
      })
      .catch(err => console.error('[db] initial load failed:', err))

    return () => unsubscribe()
  }, [])

  return (
    <AppContext.Provider value={{ state, dispatch: dbDispatch }}>
      {state.connectionNotice && (
        <div className={`fixed top-3 left-1/2 z-[9999] -translate-x-1/2 rounded-xl px-4 py-2 text-sm font-semibold shadow-lg ${
          state.connectionNotice.tone === 'error'
            ? 'bg-red-600 text-white'
            : 'bg-[#1F2937] text-white'
        }`}>
          {state.connectionNotice.message}
        </div>
      )}
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  return useContext(AppContext)
}
