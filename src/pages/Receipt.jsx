import React, { useMemo, useEffect, useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useApp } from '../store/AppContext'
import { getItemName, t } from '../lib/i18n'
import { ArrowLeft, Printer } from 'lucide-react'
import {
  getGroupedOrderItems,
  getOrderItemProductId,
  getOrderPaymentBreakdown,
  getOrderPaymentSummary,
} from '../lib/analytics'
import { getOrderItemUnitPrice, normalizePriceMode } from '../lib/priceModes'
import { isCashierQuickItem } from '../lib/menuItems'
import { inferOrderType, isOffPremiseOrderType, orderTypeLabel } from '../lib/orderTypes'
import { formatDateTime } from '../lib/dateFormat'
import { loadReceiptOrderGroup } from '../lib/db'
import { OperationalError, OperationalLoading } from '../components/OperationalState'
import { formatMenuQuantity } from '../lib/menuSaleUnits'
import { getConfiguredServiceRatePct } from '../lib/serviceRates'
import { getReceiptFooterVisibility, normalizeReceiptMarketing } from '../lib/receiptMarketing'

// ── Localisation ──────────────────────────────────────────────────────────────

const L = {
  uz: {
    slogan:      "Olov. Ta'm. An'ana.",
    receiptTitle:'CHEK',
    table:       'Stol',
    menuType:    'Menyu turi',
    waiter:      'Ofitsiant',
    completedBy: 'Yopgan',
    date:        'Sana',
    itemCol:     'Taom',
    qtyCol:      'Soni',
    amountCol:   'Summa',
    orderAmount: 'Buyurtma summasi',
    servicePct:  n => `Xizmat haqi ${n}%`,
    loyaltyUsed: 'Sodiqlik ishlatildi',
    cashbackEarned: 'Cashback hisoblandi',
    total:       "To'lovga jami",
    thanks1:     'Tashrifingiz uchun rahmat!',
    thanks2:     'Sizni yana kutib qolamiz!',
    scanLabel:   'Instagram uchun skanerlang',
    scanPitch:   "Har hafta yangi aksiyalar — o'tkazib yubormang!",
    cashbackPromo: 'Cashback 10% gacha',
    loyaltyTitle: 'Sodiqlik kartalarimiz',
    loyaltyPitch: 'Kartani oling va keyingi tashriflarda kamroq tolang',
    loyaltyInfo:  "Batafsil ma'lumot uchun menejerga murojaat qiling",
  },
  ru: {
    slogan:      'Огонь. Вкус. Традиции.',
    receiptTitle:'ЧЕК',
    table:       'Стол',
    menuType:    'Тип меню',
    waiter:      'Официант',
    completedBy: 'Закрыл',
    date:        'Дата',
    itemCol:     'Блюдо',
    qtyCol:      'Кол-во',
    amountCol:   'Сумма',
    orderAmount: 'Сумма заказа',
    servicePct:  n => `Обслуживание ${n}%`,
    loyaltyUsed: 'Использовано с карты',
    cashbackEarned: 'Начислен кешбэк',
    total:       'Итого к оплате',
    thanks1:     'Спасибо, что выбрали ZarKebab!',
    thanks2:     'Будем рады видеть вас снова!',
    scanLabel:   'Сканируйте Instagram',
    scanPitch:   'Каждую неделю новые акции — не пропустите!',
    cashbackPromo: 'Cashback до 10%',
    loyaltyTitle: 'Наши карты лояльности',
    loyaltyPitch: 'Оформите карту и платите меньше в следующий раз',
    loyaltyInfo:  'Подробности уточняйте у менеджера',
  },
  en: {
    slogan:      'Fire. Flavor. Tradition.',
    receiptTitle:'RECEIPT',
    table:       'Table',
    menuType:    'Menu type',
    waiter:      'Waiter',
    completedBy: 'Completed by',
    date:        'Date',
    itemCol:     'Item',
    qtyCol:      'Qty',
    amountCol:   'Amount',
    orderAmount: 'Order amount',
    servicePct:  n => `Service ${n}%`,
    loyaltyUsed: 'Loyalty used',
    cashbackEarned: 'Cashback earned',
    total:       'Total to pay',
    thanks1:     'Thank you for choosing ZarKebab!',
    thanks2:     'We hope to see you again!',
    scanLabel:   'Scan our Instagram',
    scanPitch:   "New deals every week — don't miss out!",
    cashbackPromo: 'Cashback up to 10%',
    loyaltyTitle: 'Our loyalty cards',
    loyaltyPitch: 'Get a card and pay less on your next visit',
    loyaltyInfo:  'Ask our manager for more details',
  },
}

// ── Number formatters ─────────────────────────────────────────────────────────

function fmtNum(n) {
  // Space-separated thousands, no currency symbol — for item line amounts
  return new Intl.NumberFormat('ru-RU').format(Math.round(n))
}
function fmtUZS(n) {
  return `${fmtNum(n)} UZS`
}

function normalizeReceiptItems(rawItems, menuItemMap) {
  return rawItems.map(item => {
    const productId = getOrderItemProductId(item)
    const menuItem = productId != null ? menuItemMap[productId] : null
    return isCashierQuickItem(menuItem)
      ? { ...item, sale_unit: item.sale_unit || menuItem?.sale_unit, item_type: item.item_type || item.itemType || 'counter', is_counter_item: true }
      : { ...item, sale_unit: item.sale_unit || menuItem?.sale_unit }
  })
}

function getReceiptItems(rawItems, menuItemMap, lang) {
  // Never group by localized/display name. Shared grouping uses product id plus
  // selected modifiers/options, and leaves rows without product ids separate.
  const normalizedItems = normalizeReceiptItems(rawItems, menuItemMap)
  return getGroupedOrderItems(normalizedItems, item => {
    const productId = getOrderItemProductId(item)
    const menuItem = productId != null ? menuItemMap[productId] : null
    return (menuItem && getItemName(menuItem, lang)) || item.name
  })
}

function combineReceiptOrders(orders) {
  return {
    ...orders[0],
    subtotal: orders.reduce((s, o) => s + (Number(o.subtotal) || 0), 0),
    service_fee: orders.reduce((s, o) => s + (Number(o.service_fee) || 0), 0),
    total: orders.reduce((s, o) => s + (Number(o.total) || 0), 0),
    loyalty_discount_amount: orders.reduce(
      (s, o) => s + (Number(o.loyalty_used_amount) || Number(o.loyalty_redeem_amount) || Number(o.loyalty_discount_amount) || Number(o.discount_amount) || 0),
      0
    ),
    loyalty_used_amount: orders.reduce(
      (s, o) => s + (Number(o.loyalty_used_amount) || Number(o.loyalty_redeem_amount) || Number(o.loyalty_discount_amount) || Number(o.discount_amount) || 0),
      0
    ),
    cashback_earned: orders.reduce((s, o) => s + (Number(o.cashback_earned) || 0), 0),
    loyalty_discount_pct: orders.find(o => o.loyalty_discount_pct != null)?.loyalty_discount_pct ??
      orders.find(o => o.discount_percent != null)?.discount_percent ??
      orders[0]?.loyalty_discount_pct ??
      0,
    service_rate_pct: orders.find(o => o.service_rate_pct != null)?.service_rate_pct ??
      orders.find(o => o.service_percent != null)?.service_percent ??
      orders[0]?.service_rate_pct,
    price_mode: normalizePriceMode(orders[0]?.price_mode),
    payments: orders.flatMap(o => getOrderPaymentBreakdown(o)),
  }
}

function receiptTableLabel(order, table, lang, fallback) {
  const orderType = inferOrderType(order)
  return isOffPremiseOrderType(orderType) ? orderTypeLabel(orderType, lang) : (table?.name || order?.table_name || fallback)
}

// ── Shared font styles ────────────────────────────────────────────────────────

const INTER   = "'Inter', sans-serif"
const POPPINS = "'Poppins', sans-serif"

// ── Print + font CSS ──────────────────────────────────────────────────────────

const PRINT_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Poppins:wght@500;600;700;800&display=swap');

@page {
  size: 80mm auto;
  margin: 0;
}

@media print {
  * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  html,
  body {
    width: 80mm !important;
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
    color: #000 !important;
  }
  body * {
    visibility: hidden !important;
  }
  .no-print { display: none !important; }
  button,
  nav,
  aside,
  header,
  footer,
  dialog,
  [role="dialog"] {
    display: none !important;
  }
  .receipt-bg {
    display: block !important;
    background: #fff !important;
    padding: 0 !important;
    min-height: unset !important;
  }
  .receipt-bg > div {
    overflow: visible !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    display: block !important;
  }
  .receipt-print-area,
  .receipt-print-area * {
    visibility: visible !important;
  }
  .receipt-print-area {
    position: absolute !important;
    left: 0 !important;
    top: 0 !important;
    display: block !important;
    width: 80mm !important;
    max-width: 80mm !important;
    min-height: auto !important;
    box-shadow: none !important;
    border-radius: 0 !important;
    margin: 0 !important;
    padding: 2mm !important;
    border: none !important;
    overflow: visible !important;
    box-sizing: border-box !important;
    background: #fff !important;
    color: #000 !important;
    font-family: Arial, sans-serif !important;
    font-size: 11px !important;
    line-height: 1.25 !important;
  }
  .receipt-print-area *,
  .receipt-print-area svg,
  .receipt-print-area img {
    color: #000 !important;
    background: #fff !important;
    border-color: #000 !important;
    border-radius: 0 !important;
    box-shadow: none !important;
  }
  .receipt-marketing {
    break-inside: avoid !important;
    page-break-inside: avoid !important;
  }
}
`

function handlePrintReceipt(delay = 300) {
  // Browser JavaScript cannot select a printer. For silent Windows thermal
  // printing, set the Xprinter as the Windows default printer and launch Chrome
  // with --kiosk-printing; then window.print() prints directly to that printer.
  window.setTimeout(() => window.print(), delay)
}

// ── ReceiptPaper ──────────────────────────────────────────────────────────────

const LOYALTY_LEVELS = 'Bronze 3% | Silver 5% | Gold 7% | Premium 10%'

function ReceiptMarketingFooter({ labels, mode, priceMode, receiptFooter }) {
  const {
    mode: marketingMode,
    showCustomFooter,
    showLoyalty,
    showInstagram,
  } = getReceiptFooterVisibility(mode, priceMode)
  const hasMarketingContent = (showCustomFooter && !!receiptFooter) || showLoyalty || showInstagram

  return (
    <>
      <Divider dashed style={{ margin: '5px 0 4px' }} />
      <div className={`receipt-marketing receipt-marketing-${marketingMode}`} style={{
        textAlign: 'center',
        fontFamily: INTER,
        fontSize: '9.5px',
        lineHeight: 1.2,
        color: '#111',
        pageBreakInside: 'avoid',
      }}>
        {showCustomFooter && receiptFooter && (
          <div style={{ fontSize: '9px', fontWeight: 400, color: '#333', marginBottom: '3px' }}>
            {receiptFooter}
          </div>
        )}
        {showLoyalty && (
          <>
            <div style={{ fontSize: '9.5px', fontWeight: 700, marginBottom: '2px' }}>{labels.cashbackPromo}</div>
            <div style={{ fontSize: '8.8px', color: '#333', marginBottom: showInstagram ? '3px' : 0 }}>{LOYALTY_LEVELS}</div>
          </>
        )}
        {showInstagram && (
          <div style={{ fontWeight: 600 }}>Instagram: @zarkebab</div>
        )}
        <div style={{
          fontSize: '10px',
          fontWeight: 700,
          marginTop: hasMarketingContent ? '4px' : 0,
        }}>
          {labels.thanks1}
        </div>
      </div>
    </>
  )
}

function firstNonEmpty(orders, keys, fallback = '—') {
  for (const order of orders) {
    for (const key of keys) {
      const value = String(order?.[key] || '').trim()
      if (value) return value
    }
  }
  return fallback
}

function ReceiptPaper({ tableName, priceMode, waiterName, completedByName, dateStr, items, subtotal, serviceFee, serviceRate, loyaltyAmt, cashbackEarned, total, labels, receiptFooter, receiptMarketing }) {
  const marketingMode = normalizeReceiptMarketing(receiptMarketing)

  return (
    <div
      className="receipt-paper receipt-print-area bg-white"
      style={{
        width: '320px',
        maxWidth: '100%',
        padding: '12px 16px 14px',
        fontFamily: INTER,
        fontVariantNumeric: 'tabular-nums',
        color: '#111',
        fontSize: '11px',
        lineHeight: 1.22,
      }}
    >

      {/* ── Brand header ─────────────────────────────────────────────────── */}
      <div style={{ textAlign: 'center', marginBottom: '3px' }}>
        <div style={{
          fontFamily: INTER,
          fontSize: '19px',
          fontWeight: 800,
          color: '#111',
          letterSpacing: '0',
          lineHeight: 1.05,
          marginBottom: '2px',
        }}>
          ZarKebab
        </div>
        <div style={{
          fontFamily: INTER,
          fontSize: '9px',
          fontWeight: 500,
          color: '#333',
        }}>
          {labels.slogan}
        </div>
      </div>

      <Divider dashed style={{ margin: '4px 0' }} />

      {/* ── Order meta ───────────────────────────────────────────────────── */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '3px' }}>
        <tbody>
          <MetaRow label={labels.table} value={tableName} />
          <MetaRow label={labels.waiter} value={waiterName} />
          {completedByName && completedByName !== '—' && <MetaRow label={labels.completedBy} value={completedByName} />}
          <MetaRow label={labels.date} value={dateStr} />
        </tbody>
      </table>

      <Divider dashed style={{ margin: '0 0 4px' }} />

      {/* ── Items table header ───────────────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 48px 74px',
        fontFamily: INTER,
        fontSize: '9.5px',
        fontWeight: 700,
        color: '#111',
        paddingBottom: '2px',
        borderBottom: '1px solid #ddd',
        marginBottom: '2px',
      }}>
        <span style={{ fontStyle: 'italic' }}>{labels.itemCol}</span>
        <span style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>{labels.qtyCol}</span>
        <span style={{ textAlign: 'right' }}>{labels.amountCol}</span>
      </div>

      {/* ── Item rows ────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: '3px' }}>
        {items.map((item, i) => (
          <div key={i} style={{
            display: 'grid',
            gridTemplateColumns: '1fr 48px 74px',
            alignItems: 'baseline',
            padding: '2px 0',
            borderBottom: '1px solid #eee',
            fontFamily: INTER,
            fontSize: '10.5px',
            fontWeight: 400,
          }}>
            <span style={{ paddingRight: '6px', lineHeight: 1.25, color: '#111', fontStyle: 'italic' }}>{item.name}</span>
            <span style={{ textAlign: 'center', fontWeight: 500, color: '#333' }}>{formatMenuQuantity(item.quantity, item)}</span>
            <span style={{ textAlign: 'right', fontWeight: 600, color: '#111' }}>
              {fmtNum(getOrderItemUnitPrice(item) * (Number(item.quantity) || 1))}
            </span>
          </div>
        ))}
      </div>

      {/* ── Subtotals ────────────────────────────────────────────────────── */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '2px' }}>
        <tbody>
          <TotalRow label={labels.orderAmount} value={fmtUZS(subtotal)} />
          <TotalRow label={labels.servicePct(serviceRate)} value={fmtUZS(serviceFee)} />
          {loyaltyAmt > 0 && (
            <TotalRow label={labels.loyaltyUsed} value={`− ${fmtUZS(loyaltyAmt)}`} color="#111" />
          )}
          {cashbackEarned > 0 && (
            <TotalRow label={labels.cashbackEarned} value={`+ ${fmtUZS(cashbackEarned)}`} color="#111" />
          )}
        </tbody>
      </table>

      <Divider solid style={{ margin: '4px 0' }} />

      {/* ── Grand total ──────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        fontFamily: POPPINS,
        fontSize: '14px',
        fontWeight: 800,
        color: '#111',
        marginBottom: 0,
        fontVariantNumeric: 'tabular-nums',
      }}>
        <span>{labels.total}</span>
        <span>{fmtUZS(total)}</span>
      </div>

      <ReceiptMarketingFooter
        labels={labels}
        mode={marketingMode}
        priceMode={priceMode}
        receiptFooter={receiptFooter}
      />
    </div>
  )
}

// ── Divider variants ──────────────────────────────────────────────────────────

function Divider({ dashed, solid, style }) {
  return (
    <div style={{
      borderTop: dashed
        ? '1px dashed #ccc'
        : solid
        ? '1.5px solid #222'
        : '1px solid #e5e5e5',
      ...style,
    }} />
  )
}

// ── Table row helpers ─────────────────────────────────────────────────────────

function MetaRow({ label, value }) {
  return (
    <tr>
      <td style={{
        fontFamily: INTER,
        fontSize: '12px',
        fontWeight: 500,
        color: '#555',
        paddingRight: '8px',
        paddingBottom: '2px',
        whiteSpace: 'nowrap',
      }}>
        {label}:
      </td>
      <td style={{
        fontFamily: INTER,
        fontSize: '12px',
        fontWeight: 600,
        color: '#111',
        textAlign: 'right',
        paddingBottom: '2px',
      }}>
        {value}
      </td>
    </tr>
  )
}

function TotalRow({ label, value, color }) {
  return (
    <tr>
      <td style={{
        fontFamily: INTER,
        fontSize: '11px',
        fontWeight: 500,
        color: color || '#555',
        paddingBottom: '2px',
      }}>
        {label}:
      </td>
      <td style={{
        fontFamily: INTER,
        fontSize: '11px',
        fontWeight: 600,
        color: color || '#111',
        textAlign: 'right',
        paddingBottom: '2px',
        whiteSpace: 'nowrap',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {value}
      </td>
    </tr>
  )
}

// ── Route: /receipt/table/:tableId ────────────────────────────────────────────

export function TableReceipt() {
  const { tableId } = useParams()
  const navigate    = useNavigate()
  const location    = useLocation()
  const { state, dispatch } = useApp()
  const lang     = state.lang
  const labels   = L[lang] || L.en
  const settings = state.settings

  const menuItemMap = useMemo(() => {
    const m = {}
    state.menuItems.forEach(mi => { m[mi.id] = mi })
    return m
  }, [state.menuItems])

  const data = useMemo(() => {
    const orders = state.orders.filter(
      o => o.table_id === tableId && o.payment_status !== 'paid'
    )
    if (orders.length === 0) return null

    const table    = state.tables.find(t => t.id === tableId)
    const allItems = normalizeReceiptItems(orders.flatMap(o => o.items || []), menuItemMap)
    const items = getReceiptItems(allItems, menuItemMap, lang)
    const combinedOrder = combineReceiptOrders(orders)
    const summary = getOrderPaymentSummary(
      combinedOrder,
      allItems,
      getConfiguredServiceRatePct(settings, combinedOrder.price_mode)
    )

    return {
      tableName:  receiptTableLabel(orders[0], table, lang, tableId),
      priceMode: normalizePriceMode(orders[0]?.price_mode),
      waiterName: firstNonEmpty(orders, ['opened_by_name', 'waiter_name']),
      completedByName: firstNonEmpty(orders, ['completed_by_name']),
      receiptAt:  orders[0]?.paid_at || orders[0]?.created_at,
      items,
      subtotal: summary.subtotal,
      serviceFee: summary.serviceFee,
      serviceRate: summary.serviceRatePct,
      loyaltyAmt:  summary.discountAmount,
      cashbackEarned: summary.cashbackEarned,
      total: summary.total,
      payments: getOrderPaymentBreakdown(combineReceiptOrders(orders)),
    }
  }, [state.orders, state.tables, tableId, settings, menuItemMap, lang])

  if (!data) return <NotFound onBack={() => navigate(-1)} />

  return (
    <ReceiptShell
      lang={lang}
      dispatch={dispatch}
      onBack={() => navigate(-1)}
      autoPrint={settings.autoPrint || new URLSearchParams(location.search).get('print') === '1'}
    >
      <ReceiptPaper
        {...data}
        dateStr={formatDateTime(data.receiptAt)}
        labels={labels}
        lang={lang}
        restaurantName={settings.restaurantName}
        receiptFooter={settings.receiptFooter}
        receiptMarketing={settings.receiptMarketing}
      />
    </ReceiptShell>
  )
}

// ── Route: /receipt/:orderId  (legacy) ───────────────────────────────────────

export default function Receipt() {
  const { orderId } = useParams()
  const navigate    = useNavigate()
  const location    = useLocation()
  const { state, dispatch } = useApp()
  const lang     = state.lang
  const labels   = L[lang] || L.en
  const settings = state.settings
  const localOrder = state.orders.find(order => order.id === orderId)
  const [historicalOrders, setHistoricalOrders] = useState([])
  const [lookupState, setLookupState] = useState({ loading: !localOrder, error: '' })
  const [lookupVersion, setLookupVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    if (localOrder) {
      setHistoricalOrders([])
      setLookupState({ loading: false, error: '' })
      return () => { cancelled = true }
    }

    setLookupState({ loading: true, error: '' })
    loadReceiptOrderGroup(orderId)
      .then(orders => {
        if (cancelled) return
        setHistoricalOrders(orders)
        setLookupState({ loading: false, error: '' })
      })
      .catch(error => {
        if (cancelled) return
        setHistoricalOrders([])
        setLookupState({ loading: false, error: error?.message || 'Could not load receipt' })
      })
    return () => { cancelled = true }
  }, [localOrder, lookupVersion, orderId])

  const receiptOrders = localOrder ? state.orders : historicalOrders

  const menuItemMap = useMemo(() => {
    const m = {}
    state.menuItems.forEach(mi => { m[mi.id] = mi })
    return m
  }, [state.menuItems])

  const data = useMemo(() => {
    const order = receiptOrders.find(o => o.id === orderId)
    if (!order) return null

    const isOffPremise = isOffPremiseOrderType(inferOrderType(order))

    // Off-premise bills do not share a table, so the order route must stay
    // one receipt per order. Dine-in table receipts can still merge rounds.
    const allOrders = isOffPremise
      ? [order]
      : order.payment_status === 'paid' && order.paid_at
        ? receiptOrders.filter(
            o => o.table_id === order.table_id &&
                 o.payment_status === 'paid' &&
                 o.paid_at?.slice(0, 16) === order.paid_at.slice(0, 16)
          )
        : (() => {
            const siblings = receiptOrders.filter(
              o => o.table_id === order.table_id && o.payment_status !== 'paid'
            )
            return siblings.length > 0 ? siblings : [order]
          })()

    const allItems = normalizeReceiptItems(allOrders.flatMap(o => o.items || []), menuItemMap)
    const items = getReceiptItems(allItems, menuItemMap, lang)
    const combinedOrder = combineReceiptOrders(allOrders)
    const summary = getOrderPaymentSummary(
      combinedOrder,
      allItems,
      getConfiguredServiceRatePct(settings, combinedOrder.price_mode)
    )
    const table      = state.tables.find(t => t.id === order.table_id)

    return {
      tableName:  receiptTableLabel(order, table, lang, '—'),
      priceMode: normalizePriceMode(order.price_mode),
      waiterName: firstNonEmpty(allOrders, ['opened_by_name', 'waiter_name']),
      completedByName: firstNonEmpty(allOrders, ['completed_by_name']),
      receiptAt:  order.paid_at || order.created_at,
      items,
      subtotal: summary.subtotal,
      serviceFee: summary.serviceFee,
      serviceRate: summary.serviceRatePct,
      loyaltyAmt: summary.discountAmount,
      cashbackEarned: summary.cashbackEarned,
      total: summary.total,
      payments: getOrderPaymentBreakdown(combineReceiptOrders(allOrders)),
    }
  }, [receiptOrders, state.tables, orderId, settings, menuItemMap, lang])

  if (!localOrder && lookupState.loading) {
    return <OperationalLoading title={t(lang, 'loading')} description="" />
  }

  if (!localOrder && lookupState.error) {
    return (
      <OperationalError
        title={lang === 'ru' ? 'Не удалось загрузить чек' : lang === 'uz' ? 'Chekni yuklab bo‘lmadi' : 'Could not load receipt'}
        description={lookupState.error}
        actionLabel={lang === 'ru' ? 'Повторить' : lang === 'uz' ? 'Qayta urinish' : 'Retry'}
        onAction={() => setLookupVersion(version => version + 1)}
      />
    )
  }

  if (!data) return <NotFound onBack={() => navigate(-1)} />

  return (
    <ReceiptShell
      lang={lang}
      dispatch={dispatch}
      onBack={() => navigate(-1)}
      autoPrint={settings.autoPrint || new URLSearchParams(location.search).get('print') === '1'}
    >
      <ReceiptPaper
        {...data}
        dateStr={formatDateTime(data.receiptAt)}
        labels={labels}
        lang={lang}
        restaurantName={settings.restaurantName}
        receiptFooter={settings.receiptFooter}
        receiptMarketing={settings.receiptMarketing}
      />
    </ReceiptShell>
  )
}

// ── Shell (screen top-bar + background) ──────────────────────────────────────

function ReceiptShell({ lang, dispatch, onBack, autoPrint, children }) {
  useEffect(() => {
    if (!autoPrint) return
    const t = setTimeout(() => handlePrintReceipt(0), 600)
    return () => clearTimeout(t)
  }, [autoPrint])

  return (
    <>
      <style>{PRINT_CSS}</style>

      {/* Top bar – hidden during print */}
      <div className="no-print sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shadow-sm z-10">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-gray-600 font-semibold text-sm hover:text-gray-900 transition-colors"
        >
          <ArrowLeft size={16} />
          Back
        </button>

        {/* Language switcher */}
        <div className="flex gap-1">
          {['uz', 'ru', 'en'].map(l => (
            <button
              key={l}
              onClick={() => dispatch({ type: 'SET_LANG', payload: l })}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold uppercase transition-colors ${
                lang === l
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {l}
            </button>
          ))}
        </div>

        <button
          onClick={() => handlePrintReceipt()}
          className="flex items-center gap-1.5 bg-[#ff5a00] text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-[#cc4800] transition-colors shadow-sm shadow-orange-200"
        >
          <Printer size={15} />
          {lang === 'uz' ? 'Chop etish' : lang === 'ru' ? 'Печать' : 'Print'}
        </button>
      </div>

      {/* Receipt preview background */}
      <div className="receipt-bg min-h-screen bg-gray-100 flex justify-center py-10 px-4">
        <div className="shadow-2xl rounded-2xl overflow-hidden">
          {children}
        </div>
      </div>
    </>
  )
}

function NotFound({ onBack }) {
  const { state } = useApp()
  const lang = state.lang || 'ru'

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white rounded-2xl p-10 text-center shadow-lg max-w-xs">
        <p className="text-4xl mb-3">🧾</p>
        <p className="text-gray-600 font-semibold">{t(lang, 'orderNotFound')}</p>
        <button onClick={onBack} className="mt-5 text-[#ff5a00] font-bold hover:underline text-sm">
          ← {t(lang, 'back')}
        </button>
      </div>
    </div>
  )
}
