import { supabase } from './supabase.js'
import {
  getOrderPaymentFields,
  normalizeServiceRatePct,
  restaurantTodayStr,
} from './analytics.js'
import {
  DEFAULT_PRICE_MODE,
  calculateUnitPrice,
  getOrderItemBasePrice,
  getOrderItemUnitPrice,
  normalizePriceMode,
  withPriceModeFields,
} from './priceModes.js'
import { notifyTelegramOrderStatus } from './telegramNotifications.js'
import {
  isOffPremiseOrderType,
  normalizeOrderType,
  orderTypeLabel,
  orderTypePrefix,
} from './orderTypes.js'
import { collectPagedRows, loadActiveOrders, loadPaidOrdersForRange } from './orderHistory.js'
import { getRequiredMenuItemCost } from './menuItemCosts.js'
import { trimMenuItemTextFields } from './menuItemText.js'

// ── Loaders ───────────────────────────────────────────────────────────────────

function serviceRatePctFromSettings(settings) {
  return normalizeServiceRatePct(settings?.serviceRate)
}

function isMissingOptionalOrderTypeColumn(error) {
  const message = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return (
    message.includes('schema cache') &&
    (
      message.includes('order_type') ||
      message.includes('order_number') ||
      message.includes('item_type') ||
      message.includes('is_counter_item') ||
      message.includes('kitchen_round_id') ||
      message.includes('submitted_at') ||
      message.includes('price_mode') ||
      message.includes('base_price') ||
      message.includes('unit_price') ||
      message.includes('selected_options') ||
      message.includes('opened_by') ||
      message.includes('opened_by_name') ||
      message.includes('completed_by') ||
      message.includes('completed_by_name')
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

function isMissingRpc(error, functionName) {
  const message = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return (
    message.includes(String(functionName || '').toLowerCase()) ||
    message.includes('schema cache') ||
    message.includes('could not find the function') ||
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

function isMissingVariantCostsColumn(error) {
  const message = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return message.includes('variant_costs') && (
    message.includes('schema cache') ||
    message.includes('column') ||
    message.includes('42703')
  )
}

function normalizeVariantCosts(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).flatMap(([variantId, rawCost]) => {
    const id = String(variantId || '').trim()
    const cost = Number(rawCost)
    if (!id || !Number.isFinite(cost)) return []
    return [[id, Math.max(0, Math.round(cost))]]
  }))
}

async function updateRestaurantTableStatus(tableId, fields, fallbackFields = null) {
  let { data, error } = await supabase
    .from('restaurant_tables')
    .update(fields)
    .eq('id', tableId)
    .select('id')
  if (error && fallbackFields && isMissingTableReservationColumn(error)) {
    ;({ data, error } = await supabase
      .from('restaurant_tables')
      .update(fallbackFields)
      .eq('id', tableId)
      .select('id'))
  }
  if (error) throw error
  assertUpdatedRows(data, `Table ${tableId} was not updated. Refresh and try again.`)
}

function assertUpdatedRows(data, message) {
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(message)
  }
}

function makeOrderNumber(orderId, orderType = 'take_away') {
  const suffix = String(orderId || Date.now()).replace(/\D/g, '').slice(-4).padStart(4, '0')
  return `${orderTypePrefix(orderType)}-${suffix}`
}

function orderActorFields(user, fallbackName) {
  const name = user?.name || user?.email || fallbackName
  return { id: user?.id || null, name }
}

function omitOrderTrackingFields(row) {
  const {
    opened_by,
    opened_by_name,
    completed_by,
    completed_by_name,
    ...fallback
  } = row
  return fallback
}

const RECEIPT_MARKETING_MODES = new Set(['none', 'compactFooter', 'loyaltyOnly', 'instagramOnly', 'full'])

function normalizeReceiptMarketing(value) {
  return RECEIPT_MARKETING_MODES.has(value) ? value : 'compactFooter'
}

function normalizeBusinessSettings(row) {
  if (!row) return null
  return {
    restaurantName: row.restaurant_name || 'Zar Kebab',
    serviceRate: normalizeServiceRatePct(row.service_rate_pct),
    monthlyRentUzs: Math.max(0, Math.round(Number(row.monthly_rent_uzs) || 0)),
    receiptFooter: row.receipt_footer || '',
    receiptMarketing: normalizeReceiptMarketing(row.receipt_marketing),
    autoPrint: !!row.auto_print,
    autoPrintKitchenCheck: !!row.auto_print_kitchen_check,
  }
}

export function isRecoverableIdleError(error) {
  const message = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return (
    message.includes('jwt') ||
    message.includes('token') ||
    message.includes('session') ||
    message.includes('failed to fetch') ||
    message.includes('fetch failed') ||
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('connection') ||
    message.includes('websocket')
  )
}

export async function refreshSupabaseSession(dbClient = supabase) {
  const auth = dbClient?.auth
  if (!auth?.getSession) return null
  const { data, error } = await auth.getSession()
  if (error) throw error

  let activeSession = data?.session || null
  if (activeSession && auth.refreshSession) {
    const { data: refreshedData, error: refreshError } = await auth.refreshSession()
    if (refreshError) throw refreshError
    activeSession = refreshedData?.session || activeSession
  }
  return activeSession
}

async function submitOrderToKitchenRpc({ orderId, table, tableId, orderType, items, paymentFields, state, action, signal }) {
  const isOffPremise = isOffPremiseOrderType(orderType)
  const priceMode = normalizePriceMode(action.payload?.priceMode || action._priceMode || DEFAULT_PRICE_MODE)
  const opener = orderActorFields(state.user, 'Waiter')
  const payload = {
    order: {
      id: orderId,
      table_id: isOffPremise ? null : tableId,
      table_name: isOffPremise ? orderTypeLabel(orderType, 'en') : table.name,
      waiter_name: opener.name,
      opened_by: opener.id,
      opened_by_name: opener.name,
      status: 'sent_to_kitchen',
      payment_status: 'unpaid',
      order_type: orderType,
      order_number: isOffPremise ? (action._orderNumber || makeOrderNumber(orderId, orderType)) : null,
      price_mode: priceMode,
      ...paymentFields,
    },
    items: items.map(i => ({
      id: i.id,
      menu_item_id: i.menu_item_id,
      name: i.name,
      price: getOrderItemUnitPrice(i),
      base_price: getOrderItemBasePrice(i),
      unit_price: getOrderItemUnitPrice(i),
      price_mode: normalizePriceMode(i.price_mode || priceMode),
      quantity: Number(i.quantity) || 1,
      notes: i.notes || '',
      selected_options: i.selected_options || i.selectedOptions || {},
      status: 'new',
      order_type: normalizeOrderType(i.order_type || orderType),
      item_type: i.item_type || i.itemType || 'menu',
      is_counter_item: !!(i.is_counter_item ?? i.isCounterItem),
      kitchen_round_id: i.kitchen_round_id || i.kitchenRoundId || '',
      submitted_at: null,
    })),
    kitchen_round_id: action._kitchenRoundId || items[0]?.kitchen_round_id || '',
    table_status: isOffPremise ? null : 'occupied',
  }

  const { error } = await withAbortSignal(supabase.rpc('submit_order_to_kitchen', { payload }), signal)
  return { error }
}

function withAbortSignal(query, signal) {
  if (signal && typeof query?.abortSignal === 'function') return query.abortSignal(signal)
  return query
}

export function buildAtomicPaymentPayload(action) {
  const source = action?.payload && typeof action.payload === 'object' ? action.payload : {}
  const orderId = String(source.orderId || '').trim() || null
  const tableId = String(source.tableId || '').trim() || null
  if ((orderId && tableId) || (!orderId && !tableId)) {
    throw new Error('Payment requires exactly one order or table')
  }
  if (!Array.isArray(source.payments)) {
    throw new Error('Payment amounts are required and must match the current bill exactly')
  }

  const loyalty = source.loyalty && typeof source.loyalty === 'object' ? source.loyalty : {}
  return {
    order_id: orderId,
    table_id: tableId,
    payments: source.payments.map(row => ({
      method: row?.method ?? row?.payment_method,
      amount: row?.amount,
    })),
    loyalty_card_number: String(loyalty.loyalty_card_number || loyalty.cardNumber || '').trim() || null,
    loyalty_used_amount: loyalty.loyalty_used_amount ?? loyalty.loyalty_redeem_amount ?? 0,
  }
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

export async function loadMenuCatalog(dbClient = supabase) {
  const [categoriesRes, menuItemsRes, initialMenuItemCostsRes] = await Promise.all([
    dbClient.from('menu_categories').select('*').order('sort_order'),
    dbClient.from('menu_items').select('*').order('sort_order'),
    dbClient.from('menu_item_costs').select('menu_item_id, cost_price, variant_costs'),
  ])
  if (categoriesRes.error) throw categoriesRes.error
  if (menuItemsRes.error) throw menuItemsRes.error

  let menuItemCostsRes = initialMenuItemCostsRes
  if (isMissingVariantCostsColumn(menuItemCostsRes.error)) {
    menuItemCostsRes = await dbClient.from('menu_item_costs').select('menu_item_id, cost_price')
  }

  const costsByMenuItemId = menuItemCostsRes.error
    ? new Map()
    : new Map((menuItemCostsRes.data || []).map(row => [row.menu_item_id, row]))

  return {
    categories: categoriesRes.data || [],
    menuItems: (menuItemsRes.data || []).map(item => {
      const protectedCosts = costsByMenuItemId.get(item.id)
      return {
        ...item,
        cost_price: protectedCosts ? protectedCosts.cost_price : null,
        variant_costs: normalizeVariantCosts(protectedCosts?.variant_costs),
      }
    }),
  }
}

export function mergeOperationalOrders(activeOrders = [], paidTodayOrders = []) {
  const byId = new Map(paidTodayOrders.map(order => [order.id, order]))
  activeOrders.forEach(order => byId.set(order.id, order))
  return [...byId.values()]
}

async function loadCurrentOrderState() {
  const today = restaurantTodayStr()
  const [activeOrders, paidTodayOrders] = await Promise.all([
    loadActiveOrders(),
    loadPaidOrdersForRange(today, today),
  ])
  return mergeOperationalOrders(activeOrders, paidTodayOrders)
}

export async function loadOrders() {
  return loadCurrentOrderState()
}

export async function loadOperationalTableData() {
  const [tables, orders] = await Promise.all([
    loadRestaurantTables(),
    loadCurrentOrderState(),
  ])
  return { tables, orders }
}

export async function loadTableOrderHistoryIds(dbClient = supabase) {
  const rows = await collectPagedRows((from, to) => dbClient
    .from('orders')
    .select('table_id')
    .not('table_id', 'is', null)
    .order('created_at', { ascending: false })
    .range(from, to))
  return [...new Set(rows.map(row => row.table_id).filter(Boolean))]
}

export async function loadEarliestOrderDate(dbClient = supabase) {
  const { data, error } = await dbClient
    .from('orders')
    .select('created_at')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data?.created_at || ''
}

export async function loadReceiptOrderGroup(orderId, options = {}) {
  const dbClient = options.dbClient || supabase
  const select = '*, items:order_items(*), payments:order_payments(*)'
  const { data: order, error } = await withAbortSignal(dbClient
    .from('orders')
    .select(select)
    .eq('id', orderId)
    .maybeSingle(), options.signal)
  if (error) throw error
  if (!order) return []

  const paidAtMs = Date.parse(order.paid_at || '')
  const isGroupedPaidTableOrder = (
    order.table_id &&
    order.payment_status === 'paid' &&
    Number.isFinite(paidAtMs) &&
    !isOffPremiseOrderType(normalizeOrderType(order.order_type))
  )
  if (!isGroupedPaidTableOrder) return [order]

  const minuteStart = new Date(Math.floor(paidAtMs / 60000) * 60000).toISOString()
  const minuteEnd = new Date(Math.floor(paidAtMs / 60000) * 60000 + 60000).toISOString()
  const { data: siblings, error: siblingsError } = await withAbortSignal(dbClient
    .from('orders')
    .select(select)
    .eq('table_id', order.table_id)
    .eq('payment_status', 'paid')
    .gte('paid_at', minuteStart)
    .lt('paid_at', minuteEnd)
    .order('created_at', { ascending: true }), options.signal)
  if (siblingsError) throw siblingsError
  return siblings?.length ? siblings : [order]
}

export async function loadKitchenCheckOrder(orderId, options = {}) {
  const dbClient = options.dbClient || supabase
  const { data, error } = await withAbortSignal(dbClient
    .from('orders')
    .select('*, items:order_items(*)')
    .eq('id', orderId)
    .maybeSingle(), options.signal)
  if (error) throw error
  return data || null
}

export async function loadPOSData() {
  const [tables, tableZones, menuCatalog, orders, settings] = await Promise.all([
    loadRestaurantTables(),
    loadTableZones(),
    loadMenuCatalog(),
    loadCurrentOrderState(),
    loadBusinessSettings(),
  ])

  return {
    tables,
    tableZones,
    categories: menuCatalog.categories,
    menuItems:  menuCatalog.menuItems,
    orders,
    settings,
  }
}

// ── Realtime subscription ─────────────────────────────────────────────────────

export function subscribeToRealtime(dispatch, options = {}) {
  const dbClient = options.dbClient || supabase
  const settingsLoader = options.settingsLoader || (() => loadBusinessSettings(dbClient))
  const menuCatalogLoader = options.menuCatalogLoader || (() => loadMenuCatalog(dbClient))
  const debounceMs = options.debounceMs ?? 250
  const onConnectionIssue = options.onConnectionIssue || (() => {})

  let ordersReloadTimer = null
  let ordersReloadInFlight = false
  let ordersReloadQueued = false
  let settingsReloadTimer = null
  let menuReloadTimer = null

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

  function scheduleReloadMenu(payload) {
    notifyRemoteChange(payload)
    if (menuReloadTimer) clearTimeout(menuReloadTimer)
    menuReloadTimer = setTimeout(() => {
      menuReloadTimer = null
      menuCatalogLoader()
        .then(({ categories, menuItems }) => {
          dispatch({ type: 'SET_CATEGORIES', payload: categories })
          dispatch({ type: 'SET_MENU_ITEMS', payload: menuItems })
        })
        .catch(err => console.error('[db] realtime menu reload failed:', err))
    }, debounceMs)
  }

  const channel = dbClient
    .channel(`pos-realtime-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, scheduleReloadOrders)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, scheduleReloadOrders)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'order_payments' }, scheduleReloadOrders)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items' }, scheduleReloadMenu)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_item_costs' }, scheduleReloadMenu)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_categories' }, scheduleReloadMenu)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_tables' }, reloadTables)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'table_zones' }, reloadTableZones)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'business_settings' }, scheduleReloadSettings)
    .subscribe(status => {
      if (status === 'SUBSCRIBED') {
        dispatch({ type: 'SET_CONNECTION_NOTICE', payload: null })
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('[db] realtime channel status:', status)
        onConnectionIssue(status)
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
    if (menuReloadTimer) clearTimeout(menuReloadTimer)
    dbClient.removeChannel(channel)
  }
}

// ── Writers ───────────────────────────────────────────────────────────────────

export async function writeToSupabase(action, state, options = {}) {
  switch (action.type) {

    case 'SEND_TO_KITCHEN': {
      const orderId  = action._orderId
      const tableId  = state.currentTableId
      const orderType = normalizeOrderType(action.payload?.orderType)
      const priceMode = normalizePriceMode(action.payload?.priceMode || action._priceMode || DEFAULT_PRICE_MODE)
      const isOffPremise = isOffPremiseOrderType(orderType)
      const table    = isOffPremise ? null : state.tables.find(t => t.id === tableId)
      if ((!isOffPremise && !table) || state.cart.length === 0) return

      const submittedAt = action._submittedAt || new Date().toISOString()
      const kitchenRoundId = action._kitchenRoundId || `${orderId}-${submittedAt}`
      const items = (action._items || state.cart.map(i => ({
        ...i,
        status: 'new',
        order_type: orderType,
        kitchen_round_id: kitchenRoundId,
        submitted_at: submittedAt,
        created_at: submittedAt,
      }))).map(i => ({
        ...withPriceModeFields(i, i.price_mode || priceMode),
        status: i.status || 'new',
        order_type: i.order_type || orderType,
        kitchen_round_id: i.kitchen_round_id || kitchenRoundId,
        submitted_at: i.submitted_at || submittedAt,
        created_at: i.created_at || submittedAt,
      }))
      const addedSubtotal = items.reduce((s, i) => s + getOrderItemUnitPrice(i) * (Number(i.quantity) || 1), 0)
      const { data: existingOrder } = await withAbortSignal(supabase
        .from('orders')
        .select('id, subtotal, service_rate_pct')
        .eq('id', orderId)
        .neq('payment_status', 'paid')
        .maybeSingle(), options.signal)

      const subtotal    = (Number(existingOrder?.subtotal) || 0) + addedSubtotal
      const serviceRatePct = isOffPremise ? 0 : Number.isFinite(Number(existingOrder?.service_rate_pct))
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
        items,
        paymentFields,
        state,
        action,
        signal: options.signal,
      })
      if (!rpcResult.error) break
      if (!isMissingKitchenSubmitRpc(rpcResult.error)) throw rpcResult.error

      if (existingOrder) {
        let { data: updatedOrder, error: orderUpdateError } = await withAbortSignal(supabase.from('orders').update({
          status: 'sent_to_kitchen',
          price_mode: priceMode,
          ...paymentFields,
        }).eq('id', orderId).select('*').maybeSingle(), options.signal)
        if (orderUpdateError && isMissingOptionalOrderTypeColumn(orderUpdateError)) {
          ;({ data: updatedOrder, error: orderUpdateError } = await withAbortSignal(supabase.from('orders').update({
            status: 'sent_to_kitchen',
            ...paymentFields,
          }).eq('id', orderId).select('*').maybeSingle(), options.signal))
        }
        if (orderUpdateError) throw orderUpdateError
      } else {
        const opener = orderActorFields(state.user, 'Waiter')
        const orderInsert = {
          id:             orderId,
          table_id:       isOffPremise ? null : tableId,
          table_name:     isOffPremise ? orderTypeLabel(orderType, 'en') : table.name,
          waiter_name:    opener.name,
          opened_by:      opener.id,
          opened_by_name: opener.name,
          status:         'sent_to_kitchen',
          payment_status: 'unpaid',
          price_mode:     priceMode,
          ...paymentFields,
        }
        if (isOffPremise) {
          orderInsert.order_number = action._orderNumber || makeOrderNumber(orderId, orderType)
          orderInsert.order_type = orderType
        }
        let { data: createdOrder, error: orderInsertError } = await withAbortSignal(supabase.from('orders').insert(orderInsert).select('*').maybeSingle(), options.signal)
        if (orderInsertError && isOffPremise && isMissingOptionalOrderTypeColumn(orderInsertError)) {
          // Backward-compatible fallback while the take-away migration is being applied.
          // table_id=null + service_fee=0 still lets the order reach kitchen/cashier.
          const { order_type, order_number, price_mode, ...fallbackOrderInsert } = omitOrderTrackingFields(orderInsert)
          ;({ data: createdOrder, error: orderInsertError } = await withAbortSignal(supabase.from('orders').insert(fallbackOrderInsert).select('*').maybeSingle(), options.signal))
        } else if (orderInsertError && isMissingOptionalOrderTypeColumn(orderInsertError)) {
          const { price_mode, ...fallbackOrderInsert } = omitOrderTrackingFields(orderInsert)
          ;({ data: createdOrder, error: orderInsertError } = await withAbortSignal(supabase.from('orders').insert(fallbackOrderInsert).select('*').maybeSingle(), options.signal))
        }
        if (orderInsertError) throw orderInsertError
      }

      const rows = items.map(i => ({
        id:           i.id,
        order_id:     orderId,
        menu_item_id: i.menu_item_id,
        name:         i.name,
        price:        getOrderItemUnitPrice(i),
        base_price:   getOrderItemBasePrice(i),
        unit_price:   getOrderItemUnitPrice(i),
        price_mode:   normalizePriceMode(i.price_mode || priceMode),
        quantity:     i.quantity,
        notes:        i.notes || '',
        selected_options: i.selected_options || i.selectedOptions || {},
        status:       'new',
        order_type:   normalizeOrderType(i.order_type || orderType),
        kitchen_round_id: i.kitchen_round_id || i.kitchenRoundId || '',
        submitted_at: null,
      }))
      let { data: insertedItems, error: itemInsertError } = await withAbortSignal(supabase
        .from('order_items')
        .insert(rows)
        .select('*'), options.signal)
      if (itemInsertError && isMissingOptionalOrderTypeColumn(itemInsertError)) {
        const fallbackRows = rows.map(({ order_type, kitchen_round_id, submitted_at, base_price, unit_price, price_mode, selected_options, ...row }) => row)
        ;({ data: insertedItems, error: itemInsertError } = await withAbortSignal(supabase
          .from('order_items')
          .insert(fallbackRows)
          .select('*'), options.signal))
      }
      if (itemInsertError) throw itemInsertError

      if (!isOffPremise) {
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
      const { orderId, orderItemId, menuItemId, status, reason, markMenuUnavailable } = action.payload
      if (status === 'cancelled') {
        const { error: cancellationError } = await supabase.from('order_item_cancellations').insert({
          order_id: orderId,
          order_item_id: orderItemId || null,
          menu_item_id: menuItemId || null,
          reason: reason || 'Unavailable',
          created_at: new Date().toISOString(),
        })
        if (cancellationError && !/order_item_cancellations|schema cache|relation/i.test(cancellationError.message || '')) {
          throw cancellationError
        }
        if (markMenuUnavailable && menuItemId) {
          await supabase.from('menu_items').update({ available: false }).eq('id', menuItemId)
        }
      }
      let query = status === 'cancelled'
        ? supabase.from('order_items').delete().eq('order_id', orderId)
        : supabase.from('order_items').update({ status }).eq('order_id', orderId)
      query = orderItemId ? query.eq('id', orderItemId) : query.eq('menu_item_id', menuItemId)
      const { error } = await query
      if (error) throw error

      const { data: order } = await supabase
        .from('orders')
        .select('*, items:order_items(*)')
        .eq('id', orderId)
        .maybeSingle()
      if (order) {
        const serviceRatePct = isOffPremiseOrderType(order.order_type) ? 0 : Number.isFinite(Number(order.service_rate_pct))
          ? Number(order.service_rate_pct)
          : serviceRatePctFromSettings(state.settings)
        const paymentFields = getOrderPaymentFields(
          { order_type: order.order_type, service_rate_pct: serviceRatePct },
          order.items || [],
          serviceRatePct
        )
        if (paymentFields.total <= 0) {
          await supabase
            .from('orders')
            .update({
              status: 'cancelled',
              payment_status: 'cancelled',
              subtotal: 0,
              service_fee: 0,
              total: 0,
            })
            .eq('id', orderId)
          if (order.table_id) {
            const { data: activeOrders } = await supabase
              .from('orders')
              .select('id')
              .eq('table_id', order.table_id)
              .neq('id', orderId)
              .neq('payment_status', 'paid')
              .neq('status', 'cancelled')
              .limit(1)
            if (!activeOrders?.length) {
              await updateRestaurantTableStatus(order.table_id, { status: 'available' }, { status: 'available' })
            }
          }
        } else {
          await supabase
            .from('orders')
            .update(paymentFields)
            .eq('id', orderId)
        }
      }
      await notifyTelegramOrderStatus(orderId, status)
      break
    }

    case 'CONFIRM_ORDER_DELIVERED': {
      const tableId = action.payload
      // Mark all active orders for this table as delivered.
      // Use neq('paid') instead of eq('unpaid') to also catch legacy orders with payment_status = null.
      const { data: tableOrders, error: tableOrdersError } = await supabase
        .from('orders')
        .select('id')
        .eq('table_id', tableId)
        .neq('payment_status', 'paid')
      if (tableOrdersError) throw tableOrdersError
      if (tableOrders?.length) {
        const ids = tableOrders.map(o => o.id)
        const { data: deliveredOrders, error: ordersError } = await supabase
          .from('orders')
          .update({ status: 'delivered' })
          .in('id', ids)
          .select('id')
        if (ordersError) throw ordersError
        assertUpdatedRows(deliveredOrders, 'Order was not marked served. Refresh and try again.')
        const { data: servedItems, error: itemsError } = await supabase
          .from('order_items')
          .update({ status: 'served' })
          .in('order_id', ids)
          .select('id')
        if (itemsError) throw itemsError
        assertUpdatedRows(servedItems, 'Order items were not marked served. Refresh and try again.')
        await Promise.all(ids.map(id => notifyTelegramOrderStatus(id, 'completed')))
      }
      break
    }

    case 'MARK_TABLE_NEEDS_BILL': {
      const tableId = action.payload
      const { data: billOrders, error: ordersError } = await supabase
        .from('orders')
        .update({ status: 'needs_bill' })
        .eq('table_id', tableId)
        .neq('payment_status', 'paid')
        .select('id')
      if (ordersError) throw ordersError
      // Soft check: if no orders matched (e.g. legacy null payment_status), still update the table
      if (!billOrders?.length) {
        const { data: fallbackOrders, error: fallbackError } = await supabase
          .from('orders')
          .update({ status: 'needs_bill' })
          .eq('table_id', tableId)
          .is('payment_status', null)
          .select('id')
        if (fallbackError) throw fallbackError
        if (!fallbackOrders?.length) {
          throw new Error('Order was not moved to bill. Refresh and try again.')
        }
      }
      await updateRestaurantTableStatus(tableId, { status: 'needs_bill' }, { status: 'needs_bill' })
      break
    }

    case 'RECALL_TABLE_FROM_CASHIER': {
      const tableId = action.payload
      const { error } = await supabase.rpc('recall_table_from_cashier', { p_table_id: tableId })
      if (error) throw error
      break
    }

    case 'ADD_QUICK_ITEM_TO_ORDER': {
      const { tableId, orderId, item } = action.payload
      if ((!tableId && !orderId) || !item) return

      let query = supabase
        .from('orders')
        .select('*, items:order_items(*)')
        .neq('payment_status', 'paid')
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
          price: Number(item.unit_price ?? item.unitPrice ?? item.price) || 0,
          base_price: Number(item.base_price ?? item.basePrice ?? item.price) || 0,
          unit_price: Number(item.unit_price ?? item.unitPrice ?? item.price) || 0,
          price_mode: normalizePriceMode(item.price_mode || item.priceMode || order.price_mode),
          quantity: 1,
          notes: '',
          status: item.sendToKitchen || item.send_to_kitchen ? 'new' : 'served',
          order_type: item.order_type || order.order_type || 'dine_in',
          item_type: item.item_type || item.itemType || 'counter',
          is_counter_item: item.is_counter_item ?? item.isCounterItem ?? true,
        }
        let { error } = await supabase.from('order_items').insert(row)
        if (error && isMissingOptionalOrderTypeColumn(error)) {
          const { order_type, item_type, is_counter_item, base_price, unit_price, price_mode, ...fallbackRow } = row
          ;({ error } = await supabase.from('order_items').insert(fallbackRow))
        }
        if (error) throw error
        nextItems = [...(order.items || []), row]
      }

      const serviceRatePct = isOffPremiseOrderType(order.order_type) ? 0 : Number.isFinite(Number(order.service_rate_pct))
        ? Number(order.service_rate_pct)
        : serviceRatePctFromSettings(state.settings)
      const paymentFields = getOrderPaymentFields(
        { order_type: order.order_type, service_rate_pct: serviceRatePct },
        nextItems,
        serviceRatePct
      )
      const orderUpdateFields = paymentFields.total <= 0
        ? {
            status: 'cancelled',
            payment_status: 'cancelled',
            subtotal: 0,
            service_fee: 0,
            total: 0,
          }
        : paymentFields
      const { error: orderUpdateError } = await supabase
        .from('orders')
        .update(orderUpdateFields)
        .eq('id', order.id)
      if (orderUpdateError) throw orderUpdateError
      if (paymentFields.total <= 0 && order.table_id) {
        const { data: activeOrders, error: activeOrdersError } = await supabase
          .from('orders')
          .select('id')
          .eq('table_id', order.table_id)
          .neq('id', order.id)
          .neq('payment_status', 'paid')
          .neq('status', 'cancelled')
          .limit(1)
        if (activeOrdersError) throw activeOrdersError
        if (!activeOrders?.length) {
          await updateRestaurantTableStatus(order.table_id, { status: 'available' }, { status: 'available' })
        }
      }
      break
    }

    case 'UPDATE_ORDER_PRICE_MODE': {
      const { tableId, orderId } = action.payload || {}
      const priceMode = normalizePriceMode(action.payload?.priceMode)
      if (!tableId && !orderId) return

      let query = supabase
        .from('orders')
        .select('*, items:order_items(*)')
        .neq('payment_status', 'paid')
      query = orderId ? query.eq('id', orderId) : query.eq('table_id', tableId)
      const { data: orders, error: ordersError } = await query
      if (ordersError) throw ordersError

      for (const order of orders || []) {
        const nextItems = (order.items || []).map(item => {
          const basePrice = getOrderItemBasePrice(item)
          const unitPrice = calculateUnitPrice(basePrice, priceMode)
          return {
            ...item,
            base_price: basePrice,
            unit_price: unitPrice,
            price: unitPrice,
            price_mode: priceMode,
          }
        })

        for (const item of nextItems) {
          const updateRow = {
            price: item.unit_price,
            base_price: item.base_price,
            unit_price: item.unit_price,
            price_mode: priceMode,
          }
          let { error } = await supabase.from('order_items').update(updateRow).eq('id', item.id)
          if (error && isMissingOptionalOrderTypeColumn(error)) {
            ;({ error } = await supabase.from('order_items').update({ price: item.unit_price }).eq('id', item.id))
          }
          if (error) throw error
        }

        const serviceRatePct = isOffPremiseOrderType(order.order_type) ? 0 : Number.isFinite(Number(order.service_rate_pct))
          ? Number(order.service_rate_pct)
          : serviceRatePctFromSettings(state.settings)
        const paymentFields = getOrderPaymentFields(
          { ...order, order_type: order.order_type, service_rate_pct: serviceRatePct, price_mode: priceMode },
          nextItems,
          serviceRatePct
        )
        let { error: orderUpdateError } = await supabase
          .from('orders')
          .update({ price_mode: priceMode, ...paymentFields })
          .eq('id', order.id)
        if (orderUpdateError && isMissingOptionalOrderTypeColumn(orderUpdateError)) {
          ;({ error: orderUpdateError } = await supabase
            .from('orders')
            .update(paymentFields)
            .eq('id', order.id))
        }
        if (orderUpdateError) throw orderUpdateError
      }
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
        .neq('payment_status', 'paid')
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
      const serviceRatePct = isOffPremiseOrderType(order.order_type) ? 0 : Number.isFinite(Number(order.service_rate_pct))
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
      const payload = buildAtomicPaymentPayload(action)
      const { data, error } = await withAbortSignal(
        supabase.rpc('settle_orders_payment', { payload }),
        options.signal
      )
      if (error) throw error

      const paidOrderIds = Array.isArray(data?.order_ids) ? data.order_ids.filter(Boolean) : []
      if (paidOrderIds.length === 0) {
        throw new Error('No unpaid orders were settled. Refresh and try again.')
      }
      notifyTelegramOrderStatus(paidOrderIds, 'completed')
      break
    }

    case 'CHANGE_PAID_ORDER_PAYMENT_METHOD': {
      const orderIds = (action.payload?.orderIds || []).filter(Boolean)
      const paymentMethod = String(action.payload?.paymentMethod || '').trim().toLowerCase()
      if (orderIds.length === 0 || !paymentMethod) return
      const { error } = await supabase.rpc('change_paid_order_payment_method_owner', {
        p_order_ids: orderIds,
        p_payment_method: paymentMethod,
      })
      if (error) throw error
      break
    }

    case 'DELETE_ORDER': {
      const orderId = typeof action.payload === 'string' ? action.payload : action.payload?.orderId
      if (!orderId) return
      const { error } = await supabase.rpc('delete_order_owner', { p_order_id: orderId })
      if (error) throw error
      break
    }

    case 'SET_SETTINGS': {
      const settings = action.payload || {}
      const serviceRatePct = serviceRatePctFromSettings({ serviceRate: settings.serviceRate })
      let { error } = await supabase
        .from('business_settings')
        .upsert({
          id: 'default',
          restaurant_name: settings.restaurantName || 'Zar Kebab',
          service_rate_pct: serviceRatePct,
          monthly_rent_uzs: Math.max(0, Math.round(Number(settings.monthlyRentUzs) || 0)),
          receipt_footer: settings.receiptFooter || '',
          receipt_marketing: normalizeReceiptMarketing(settings.receiptMarketing),
          auto_print: !!settings.autoPrint,
          auto_print_kitchen_check: !!settings.autoPrintKitchenCheck,
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
      const { data: history, error: historyError } = await supabase
        .from('orders')
        .select('id')
        .eq('table_id', action.payload)
        .limit(1)
      if (historyError) throw historyError
      if (history?.length) {
        throw new Error('This table has order history. Disable it instead of deleting it.')
      }
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
      const {
        cost_price: costPrice,
        costPrice: _costPriceAlias,
        variant_costs: variantCosts,
        variantCosts: _variantCostsAlias,
        ...fields
      } = action.payload
      const requiredCost = getRequiredMenuItemCost(costPrice ?? _costPriceAlias)
      if (requiredCost === null) {
        throw new Error('Real cost must be greater than zero for every new product.')
      }
      const normalizedVariantCosts = normalizeVariantCosts(variantCosts ?? _variantCostsAlias)
      const normalizedFields = trimMenuItemTextFields(fields)
      const rpcResult = await supabase.rpc('create_menu_item_with_media_and_cost', {
        payload: {
          ...normalizedFields,
          cost_price: requiredCost,
          variant_costs: normalizedVariantCosts,
        },
      })
      if (!rpcResult.error) break
      if (isMissingRpc(rpcResult.error, 'create_menu_item_with_media_and_cost')) {
        throw new Error('Database migration 103 is required before creating menu products with media.')
      }
      throw rpcResult.error
    }

    case 'UPDATE_MENU_ITEM': {
      const {
        id,
        cost_price: costPrice,
        costPrice: _costPriceAlias,
        variant_costs: variantCosts,
        variantCosts: _variantCostsAlias,
        ...fields
      } = action.payload
      delete fields.external_id
      delete fields.externalId
      const normalizedFields = trimMenuItemTextFields(fields)
      const { error } = await supabase.from('menu_items').update(normalizedFields).eq('id', id)
      if (error) throw error
      const { error: costError } = await supabase.from('menu_item_costs').upsert({
        menu_item_id: id,
        cost_price: Math.max(0, Math.round(Number(costPrice ?? _costPriceAlias) || 0)),
        variant_costs: normalizeVariantCosts(variantCosts ?? _variantCostsAlias),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'menu_item_id' })
      if (costError) throw costError
      break
    }

    case 'DELETE_MENU_ITEM': {
      const deletedAt = new Date().toISOString()
      const payload = {
        available: false,
        show_in_cashier_quick_items: false,
        deleted_at: deletedAt,
      }
      const { error } = await supabase.from('menu_items').update(payload).eq('id', action.payload)
      if (error) {
        const text = `${error.code || ''} ${error.message || ''} ${error.details || ''}`.toLowerCase()
        const missingDeletedAt = text.includes('deleted_at') && (
          text.includes('column') ||
          text.includes('schema cache') ||
          text.includes('42703')
        )
        if (!missingDeletedAt) throw error

        const fallback = await supabase
          .from('menu_items')
          .update({ available: false, show_in_cashier_quick_items: false })
          .eq('id', action.payload)
        if (fallback.error) throw fallback.error
      }
      action.meta = { ...(action.meta || {}), deleted_at: deletedAt }
      break
    }

    case 'REORDER_MENU_ITEM': {
      if (Array.isArray(action.payload?.updates)) {
        const updates = action.payload.updates.filter(update => update?.id && Number.isFinite(Number(update.sort_order)))
        const results = await Promise.all(updates.map(update =>
          supabase.from('menu_items').update({ sort_order: Number(update.sort_order) }).eq('id', update.id)
        ))
        const error = results.find(result => result.error)?.error
        if (error) throw error
        break
      }
      const { idA, idB } = action.payload
      const itemA = state.menuItems.find(i => i.id === idA)
      const itemB = state.menuItems.find(i => i.id === idB)
      if (!itemA || !itemB) return

      const results = await Promise.all([
        supabase.from('menu_items').update({ sort_order: itemB.sort_order ?? 0 }).eq('id', idA),
        supabase.from('menu_items').update({ sort_order: itemA.sort_order ?? 0 }).eq('id', idB),
      ])
      const error = results.find(result => result.error)?.error
      if (error) throw error
      break
    }

    case 'REORDER_QUICK_ITEM': {
      if (Array.isArray(action.payload?.updates)) {
        const updates = action.payload.updates.filter(update => update?.id && Number.isFinite(Number(update.quick_item_sort_order)))
        const results = await Promise.all(updates.map(update =>
          supabase.from('menu_items').update({ quick_item_sort_order: Number(update.quick_item_sort_order) }).eq('id', update.id)
        ))
        const error = results.find(result => result.error)?.error
        if (error) throw error
        break
      }
      const { idA, idB } = action.payload
      const itemA = state.menuItems.find(i => i.id === idA)
      const itemB = state.menuItems.find(i => i.id === idB)
      if (!itemA || !itemB) return

      const orderA = Number(itemA.quick_item_sort_order ?? itemA.sort_order ?? 0)
      const orderB = Number(itemB.quick_item_sort_order ?? itemB.sort_order ?? 0)
      const results = await Promise.all([
        supabase.from('menu_items').update({ quick_item_sort_order: orderB }).eq('id', idA),
        supabase.from('menu_items').update({ quick_item_sort_order: orderA }).eq('id', idB),
      ])
      const error = results.find(result => result.error)?.error
      if (error) throw error
      break
    }

    case 'ADD_CATEGORY': {
      const { error } = await supabase.from('menu_categories').insert(action.payload)
      if (error) throw error
      break
    }

    case 'UPDATE_CATEGORY': {
      const { id, ...fields } = action.payload
      const { error } = await supabase.from('menu_categories').update(fields).eq('id', id)
      if (error) throw error
      break
    }

    case 'DELETE_CATEGORY': {
      const { error } = await supabase.from('menu_categories').delete().eq('id', action.payload)
      if (error) throw error
      break
    }

    case 'REORDER_CATEGORY': {
      if (Array.isArray(action.payload?.updates)) {
        const updates = action.payload.updates.filter(update => update?.id && Number.isFinite(Number(update.sort_order)))
        const results = await Promise.all(updates.map(update =>
          supabase.from('menu_categories').update({ sort_order: Number(update.sort_order) }).eq('id', update.id)
        ))
        const error = results.find(result => result.error)?.error
        if (error) throw error
        break
      }
      const { idA, idB } = action.payload
      const catA = state.categories.find(c => c.id === idA)
      const catB = state.categories.find(c => c.id === idB)
      if (!catA || !catB) return

      const results = await Promise.all([
        supabase.from('menu_categories').update({ sort_order: catB.sort_order ?? 0 }).eq('id', idA),
        supabase.from('menu_categories').update({ sort_order: catA.sort_order ?? 0 }).eq('id', idB),
      ])
      const error = results.find(result => result.error)?.error
      if (error) throw error
      break
    }

    default:
      break
  }
}
