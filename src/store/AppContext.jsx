import React, { createContext, useContext, useReducer } from 'react'
import { tables as initialTables, menuItems as initialMenuItems, categories as initialCategories, mockOrders } from '../data/mockData'

const AppContext = createContext(null)

const initialState = {
  lang: localStorage.getItem('zk_lang') || 'uz',
  user: null,
  tables: initialTables,
  menuItems: initialMenuItems,
  categories: initialCategories,
  orders: mockOrders,
  cart: [],
  currentTableId: null,
}

function reducer(state, action) {
  switch (action.type) {
    case 'SET_LANG':
      localStorage.setItem('zk_lang', action.payload)
      return { ...state, lang: action.payload }

    case 'LOGIN':
      return { ...state, user: action.payload }

    case 'LOGOUT':
      return { ...state, user: null, cart: [], currentTableId: null }

    case 'SET_TABLE':
      return { ...state, currentTableId: action.payload }

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

    case 'SEND_TO_KITCHEN': {
      const table = state.tables.find(t => t.id === state.currentTableId)
      if (!table || state.cart.length === 0) return state
      const subtotal = state.cart.reduce((s, i) => s + i.price * i.quantity, 0)
      const service_fee = Math.round(subtotal * 0.2)
      const newOrder = {
        id: 'o' + Date.now(),
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

    case 'MARK_TABLE_NEEDS_BILL':
      return {
        ...state,
        tables: state.tables.map(t => t.id === action.payload ? { ...t, status: 'needs_bill' } : t),
        orders: state.orders.map(o => o.table_id === action.payload ? { ...o, status: 'needs_bill' } : o),
      }

    case 'MARK_ORDER_PAID': {
      // payload can be a string tableId (legacy) or { tableId, loyalty }
      const tableId = typeof action.payload === 'string' ? action.payload : action.payload.tableId
      const loyalty = typeof action.payload === 'object' ? action.payload.loyalty : null
      return {
        ...state,
        tables: state.tables.map(t => t.id === tableId ? { ...t, status: 'available' } : t),
        orders: state.orders.map(o =>
          o.table_id === tableId && o.payment_status !== 'paid'
            ? { ...o, status: 'paid', payment_status: 'paid', ...(loyalty || {}) }
            : o
        ),
      }
    }

    case 'ADD_TABLE':
      return { ...state, tables: [...state.tables, action.payload] }

    case 'UPDATE_TABLE':
      return { ...state, tables: state.tables.map(t => t.id === action.payload.id ? action.payload : t) }

    case 'DELETE_TABLE':
      return { ...state, tables: state.tables.filter(t => t.id !== action.payload) }

    case 'ADD_MENU_ITEM':
      return { ...state, menuItems: [...state.menuItems, action.payload] }

    case 'UPDATE_MENU_ITEM':
      return { ...state, menuItems: state.menuItems.map(i => i.id === action.payload.id ? action.payload : i) }

    case 'DELETE_MENU_ITEM':
      return { ...state, menuItems: state.menuItems.filter(i => i.id !== action.payload) }

    case 'ADD_CATEGORY':
      return { ...state, categories: [...state.categories, action.payload] }

    case 'UPDATE_CATEGORY':
      return { ...state, categories: state.categories.map(c => c.id === action.payload.id ? action.payload : c) }

    case 'DELETE_CATEGORY':
      return { ...state, categories: state.categories.filter(c => c.id !== action.payload) }

    default:
      return state
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>
}

export function useApp() {
  return useContext(AppContext)
}
