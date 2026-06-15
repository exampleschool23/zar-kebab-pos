import React, { createContext, useContext, useReducer, useEffect, useRef, useCallback } from 'react'
import { isRecoverableIdleError, loadPOSData, refreshSupabaseSession, writeToSupabase, subscribeToRealtime } from '../lib/db'
import { appMetaReducer } from './appMetaReducer'
import { cartReducer } from './cartReducer'
import { menuReducer } from './menuReducer'
import { ordersReducer } from './ordersReducer'
import { DEFAULT_SETTINGS, loadInitialLang, loadSettings, makeLocalId, makeOrderNumber, normalizeOrderType } from './reducerHelpers'
import { settingsReducer } from './settingsReducer'
import { tablesReducer } from './tablesReducer'
import { isOffPremiseOrderType } from '../lib/orderTypes'

const AppContext = createContext(null)

const WRITE_BEFORE_LOCAL_ACTIONS = new Set([
  'UPDATE_ORDER_ITEM_STATUS',
  'SEND_TO_KITCHEN',
  'CONFIRM_ORDER_DELIVERED',
  'MARK_TABLE_NEEDS_BILL',
  'RECALL_TABLE_FROM_CASHIER',
  'UPDATE_BILL_ITEM_QTY',
  'MARK_ORDER_PAID',
  'DELETE_ORDER',
])

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
    let enriched = action
    if (action.type === 'SEND_TO_KITCHEN') {
      const orderType = normalizeOrderType(action.payload?.orderType)
      const isOffPremise = isOffPremiseOrderType(orderType)
      const submittedAt = action._submittedAt || new Date().toISOString()
      const kitchenRoundId = action._kitchenRoundId || `round-${submittedAt}-${Math.random().toString(36).slice(2, 8)}`
      enriched = {
        ...action,
        _submittedAt: submittedAt,
        _kitchenRoundId: kitchenRoundId,
        _orderId: isOffPremise
          ? `${orderType === 'delivery' ? 'dl' : 'ta'}-${Date.now()}`
          : stateRef.current.orders.find(o =>
            o.table_id === stateRef.current.currentTableId && o.payment_status !== 'paid'
          )?.id || 'o' + Date.now(),
        _orderNumber: isOffPremise
          ? makeOrderNumber(Date.now(), orderType)
          : undefined,
        _items: stateRef.current.cart.map(i => ({
          ...i,
          id: makeLocalId('oi'),
          status: 'new',
          order_type: orderType,
          kitchen_round_id: kitchenRoundId,
          submitted_at: submittedAt,
          created_at: submittedAt,
        })),
      }
    } else if (action.type === 'ADD_QUICK_ITEM_TO_ORDER') {
      enriched = {
        ...action,
        _itemId: makeLocalId('oi'),
      }
    }

    if (WRITE_BEFORE_LOCAL_ACTIONS.has(enriched.type)) {
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
    let backOnlineTimer = null
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
        dispatch({
          type: 'SET_CONNECTION_NOTICE',
          payload: {
            tone: 'info',
            message: stateRef.current.lang === 'ru'
              ? 'Восстанавливаем соединение...'
              : stateRef.current.lang === 'uz'
                ? 'Ulanish tiklanmoqda...'
                : 'Reconnecting...',
          },
        })
        hydratePOSData()
          .then(() => {
            if (mounted) connectRealtime()
            if (!mounted) return
            if (backOnlineTimer) clearTimeout(backOnlineTimer)
            dispatch({
              type: 'SET_CONNECTION_NOTICE',
              payload: {
                tone: 'success',
                message: stateRef.current.lang === 'ru'
                  ? 'Соединение восстановлено.'
                  : stateRef.current.lang === 'uz'
                    ? 'Ulanish tiklandi.'
                    : 'Back online.',
              },
            })
            backOnlineTimer = setTimeout(() => {
              backOnlineTimer = null
              if (mounted) dispatch({ type: 'SET_CONNECTION_NOTICE', payload: null })
            }, 2200)
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
      if (backOnlineTimer) clearTimeout(backOnlineTimer)
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
            : state.connectionNotice.tone === 'success'
              ? 'bg-emerald-600 text-white'
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
