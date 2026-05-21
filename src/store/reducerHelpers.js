import {
  getOrderPaymentFields,
  normalizeServiceRatePct,
} from '../lib/analytics.js'

export const DEFAULT_SETTINGS = {
  restaurantName: 'Zar Kebab',
  serviceRate:    20,
  receiptFooter:  'Thank you for visiting!',
  autoPrint:      false,
}

export function loadSettings() {
  try {
    const s = localStorage.getItem('zk_settings')
    return s ? JSON.parse(s) : {}
  } catch { return {} }
}

export function loadInitialLang() {
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

export function normalizeOrderType(value) {
  const raw = String(value || '').toLowerCase()
  return raw.includes('take') || raw.includes('away') ? 'take_away' : 'dine_in'
}

export function serviceRatePctFromSettings(settings) {
  return normalizeServiceRatePct(settings?.serviceRate)
}

export function makeLocalId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

export function recalcOrderTotals(order, settings) {
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

export function makeTakeAwayOrderNumber(orderId) {
  const suffix = String(orderId || Date.now()).replace(/\D/g, '').slice(-4).padStart(4, '0')
  return `TA-${suffix}`
}

export function getQuickSortOrder(item) {
  const value = Number(item?.quick_item_sort_order ?? item?.quickItemSortOrder ?? item?.sort_order ?? 9999)
  return Number.isFinite(value) ? value : 9999
}
