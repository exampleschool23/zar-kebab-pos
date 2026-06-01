import React, { createContext, useContext, useReducer, useEffect, useRef, useCallback } from 'react'
import { isRecoverableIdleError, loadPOSData, refreshSupabaseSession, writeToSupabase, subscribeToRealtime } from '../lib/db'
import { appMetaReducer } from './appMetaReducer'
import { cartReducer } from './cartReducer'
import { menuReducer } from './menuReducer'
import { ordersReducer } from './ordersReducer'
import { DEFAULT_SETTINGS, loadInitialLang, loadSettings, makeLocalId, makeTakeAwayOrderNumber, normalizeOrderType } from './reducerHelpers'
import { settingsReducer } from './settingsReducer'
import { tablesReducer } from './tablesReducer'

const AppContext = createContext(null)

const initialState = {
  lang:           loadInitialLang(),
  settings:       { ...DEFAULT_SETTINGS, ...loadSettings() },
  user:           null,
  tables:         [],
  tableZones:     [],
  menuItems:      [],
  categories:     [],
  orders:         [],
  cart:           [],
  currentTableId: null,
  connectionNotice: null,
  loadError: null,
  loaded:         false,
}

const domainReducers = [
  settingsReducer,
  appMetaReducer,
  tablesReducer,
  menuReducer,
  cartReducer,
  ordersReducer,
]

function reducer(state, action) {
  for (const domainReducer of domainReducers) {
    const next = domainReducer(state, action)
    if (next !== state) return next
  }
  return state
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState)

  // Always-current state reference for async callbacks (avoids stale closures)
  const stateRef = useRef(state)
  useEffect(() => { stateRef.current = state }, [state])

  const recoverFromIdleRef = useRef(() => {})

  async function writeWithIdleRecovery(action, stateSnapshot) {
    try {
      await writeToSupabase(action, stateSnapshot)
    } catch (error) {
      if (!isRecoverableIdleError(error)) throw error
      await refreshSupabaseSession()
      recoverFromIdleRef.current?.()
      await writeToSupabase(action, stateRef.current)
    }
  }

  // dbDispatch: optimistic local update + async Supabase write
  const dbDispatch = useCallback(function dbDispatch(action) {
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

    if (enriched.type === 'UPDATE_ORDER_ITEM_STATUS' || enriched.type === 'SEND_TO_KITCHEN' || enriched.type === 'MARK_ORDER_PAID') {
      return writeWithIdleRecovery(enriched, stateRef.current)
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
    return writeWithIdleRecovery(enriched, stateRef.current)
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
  }, [])

  // Load from Supabase on mount + subscribe to realtime
  useEffect(() => {
    let unsubscribe = () => {}
    let mounted = true
    let hydrateInFlight = false
    let reconnectTimer = null
    let lastResumeAt = 0

    async function hydratePOSData() {
      if (hydrateInFlight) return
      hydrateInFlight = true
      try {
        await refreshSupabaseSession()
        const { tables, tableZones, categories, menuItems, orders, settings } = await loadPOSData()
        if (!mounted) return
        dispatch({ type: 'SET_TABLES',     payload: tables })
        dispatch({ type: 'SET_TABLE_ZONES', payload: tableZones || [] })
        dispatch({ type: 'SET_CATEGORIES', payload: categories })
        dispatch({ type: 'SET_MENU_ITEMS', payload: menuItems })
        dispatch({ type: 'SET_ORDERS',     payload: orders })
        if (settings) dispatch({ type: 'SET_SETTINGS', payload: settings })
        dispatch({ type: 'SET_LOADED' })
        dispatch({ type: 'SET_CONNECTION_NOTICE', payload: null })
      } finally {
        hydrateInFlight = false
      }
    }

    function connectRealtime() {
      unsubscribe()
      unsubscribe = subscribeToRealtime(dispatch, {
        onConnectionIssue: () => scheduleIdleRecovery(1000),
      })
    }

    function scheduleIdleRecovery(delay = 0) {
      if (reconnectTimer) clearTimeout(reconnectTimer)
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null
        hydratePOSData()
          .then(() => {
            if (mounted) connectRealtime()
          })
          .catch(err => {
            console.error('[db] idle recovery failed:', err)
            dispatch({
              type: 'SET_CONNECTION_NOTICE',
              payload: {
                tone: 'error',
                message: stateRef.current.lang === 'ru'
                  ? 'Соединение устарело. Обновите страницу, если данные не обновятся.'
                  : stateRef.current.lang === 'uz'
                    ? 'Ulanish eskirdi. Ma’lumotlar yangilanmasa, sahifani yangilang.'
                    : 'Connection was stale. Refresh the page if data does not update.',
              },
            })
          })
      }, delay)
    }

    function handleResume() {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      const now = Date.now()
      if (now - lastResumeAt < 5000) return
      lastResumeAt = now
      scheduleIdleRecovery(0)
    }

    recoverFromIdleRef.current = () => scheduleIdleRecovery(0)

    hydratePOSData()
      .then(() => {
        if (mounted) connectRealtime()
      })
      .catch(err => {
        console.error('[db] initial load failed:', err)
        dispatch({ type: 'SET_LOAD_ERROR', payload: err?.message || 'Failed to load POS data' })
      })

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleResume)
      window.addEventListener('focus', handleResume)
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleResume)
    }

    return () => {
      mounted = false
      recoverFromIdleRef.current = () => {}
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleResume)
        window.removeEventListener('focus', handleResume)
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleResume)
      }
      unsubscribe()
    }
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
