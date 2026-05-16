import React, { createContext, useContext, useReducer, useEffect, useRef } from 'react'
import { loadPOSData, writeToSupabase, subscribeToRealtime } from '../lib/db'

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

const initialState = {
  lang:           localStorage.getItem('zk_lang') || 'uz',
  settings:       { ...DEFAULT_SETTINGS, ...loadSettings() },
  user:           null,
  tables:         [],
  menuItems:      [],
  categories:     [],
  orders:         [],
  cart:           [],
  currentTableId: null,
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
      const table = state.tables.find(t => t.id === state.currentTableId)
      if (!table || state.cart.length === 0) return state
      const orderId     = action._orderId || ('o' + Date.now())
      const subtotal    = state.cart.reduce((s, i) => s + i.price * i.quantity, 0)
      const svcRate     = (state.settings?.serviceRate ?? 20) / 100
      const service_fee = Math.round(subtotal * svcRate)
      const newOrder = {
        id: orderId,
        table_id: state.currentTableId,
        table_name: table.name,
        waiter_name: state.user?.name || 'Waiter',
        status: 'sent_to_kitchen',
        payment_status: 'unpaid',
        items: state.cart.map(i => ({ ...i, status: 'new' })),
        subtotal,
        service_fee,
        total: subtotal + service_fee,
        created_at: new Date().toISOString(),
      }
      const updatedTables = state.tables.map(t =>
        t.id === state.currentTableId ? { ...t, status: 'occupied' } : t
      )
      return { ...state, orders: [...state.orders, newOrder], cart: [], tables: updatedTables }
    }

    case 'UPDATE_ORDER_ITEM_STATUS': {
      const { orderId, menuItemId, status } = action.payload
      return {
        ...state,
        orders: state.orders.map(o =>
          o.id === orderId
            ? { ...o, items: o.items.map(i => i.menu_item_id === menuItemId ? { ...i, status } : i) }
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

    case 'MARK_ORDER_PAID': {
      const tableId        = typeof action.payload === 'string' ? action.payload : action.payload.tableId
      const loyalty        = typeof action.payload === 'object' ? action.payload.loyalty : null
      const payment_method = typeof action.payload === 'object' ? action.payload.payment_method : null
      return {
        ...state,
        tables: state.tables.map(t => t.id === tableId ? { ...t, status: 'available' } : t),
        orders: state.orders.map(o =>
          o.table_id === tableId && o.payment_status !== 'paid'
            ? { ...o, status: 'paid', payment_status: 'paid', payment_method, ...(loyalty || {}) }
            : o
        ),
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
      ? { ...action, _orderId: 'o' + Date.now() }
      : action

    dispatch(enriched)
    writeToSupabase(enriched, stateRef.current).catch(err =>
      console.error('[db] write failed:', action.type, err)
    )
  }

  // Load from Supabase on mount + subscribe to realtime
  useEffect(() => {
    let unsubscribe = () => {}

    loadPOSData()
      .then(({ tables, categories, menuItems, orders }) => {
        dispatch({ type: 'SET_TABLES',     payload: tables })
        dispatch({ type: 'SET_CATEGORIES', payload: categories })
        dispatch({ type: 'SET_MENU_ITEMS', payload: menuItems })
        dispatch({ type: 'SET_ORDERS',     payload: orders })
        dispatch({ type: 'SET_LOADED' })
        unsubscribe = subscribeToRealtime(dispatch)
      })
      .catch(err => console.error('[db] initial load failed:', err))

    return () => unsubscribe()
  }, [])

  return (
    <AppContext.Provider value={{ state, dispatch: dbDispatch }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  return useContext(AppContext)
}
