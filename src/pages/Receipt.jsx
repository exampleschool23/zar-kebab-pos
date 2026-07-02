import React, { useMemo, useEffect } from 'react'
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

// ── Localisation ──────────────────────────────────────────────────────────────

const L = {
  uz: {
    slogan:      "Olov. Ta'm. An'ana.",
    receiptTitle:'CHEK',
    table:       'Stol',
    menuType:    'Menyu turi',
    waiter:      'Ofitsiant',
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
      ? { ...item, item_type: item.item_type || item.itemType || 'counter', is_counter_item: true }
      : item
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
    padding: 3mm !important;
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

const RECEIPT_MARKETING_MODES = new Set(['none', 'compactFooter', 'loyaltyOnly', 'instagramOnly', 'full'])
const LOYALTY_LEVELS = 'Bronze 3% | Silver 5% | Gold 7% | Premium 10%'

function normalizeReceiptMarketing(value) {
  return RECEIPT_MARKETING_MODES.has(value) ? value : 'compactFooter'
}

function shouldShowQr(mode) {
  return mode === 'compactFooter' || mode === 'instagramOnly' || mode === 'full'
}

function ReceiptMarketingFooter({ labels, mode }) {
  const marketingMode = normalizeReceiptMarketing(mode)
  if (marketingMode === 'none') return null

  const showThanks = ['compactFooter', 'full'].includes(marketingMode)
  const showLoyalty = ['compactFooter', 'loyaltyOnly', 'full'].includes(marketingMode)
  const showInstagram = ['compactFooter', 'instagramOnly', 'full'].includes(marketingMode)
  const isFull = marketingMode === 'full'
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=https://instagram.com/zarkebab&size=132x132&margin=4&color=111111&bgcolor=ffffff`

  return (
    <>
      <Divider dashed style={{ margin: '8px 0 6px' }} />
      <div className={`receipt-marketing receipt-marketing-${marketingMode}`} style={{
        textAlign: 'center',
        fontFamily: INTER,
        fontSize: '11px',
        lineHeight: 1.32,
        color: '#111',
        pageBreakInside: 'avoid',
      }}>
        {showThanks && <div style={{ fontSize: '11.5px', fontWeight: 700, marginBottom: '5px' }}>{labels.thanks1}</div>}
        {showLoyalty && (
          <>
            <div style={{ fontSize: '11.2px', fontWeight: 700, marginBottom: '4px' }}>{labels.cashbackPromo}</div>
            <div style={{ fontSize: '10.4px', color: '#333', marginBottom: showInstagram ? '6px' : 0 }}>{LOYALTY_LEVELS}</div>
          </>
        )}
        {showInstagram && (
          <>
            <div style={{ fontWeight: 600, marginBottom: shouldShowQr(marketingMode) ? '7px' : 0 }}>Instagram: @zarkebab</div>
            {shouldShowQr(marketingMode) && (
              <img
                src={qrUrl}
                alt="Instagram QR"
                width={isFull ? 84 : 72}
                height={isFull ? 84 : 72}
                style={{
                  display: 'block',
                  margin: '0 auto 8px',
                  width: isFull ? '22mm' : '19mm',
                  height: isFull ? '22mm' : '19mm',
                }}
              />
            )}
          </>
        )}
      </div>
    </>
  )
}

function ReceiptPaper({ tableName, waiterName, dateStr, items, subtotal, serviceFee, serviceRate, loyaltyAmt, cashbackEarned, total, labels, receiptFooter, receiptMarketing }) {
  const marketingMode = normalizeReceiptMarketing(receiptMarketing)

  return (
    <div
      className="receipt-paper receipt-print-area bg-white"
      style={{
        width: '320px',
        maxWidth: '100%',
        padding: '18px 22px 22px',
        fontFamily: INTER,
        fontVariantNumeric: 'tabular-nums',
        color: '#111',
        fontSize: '12px',
        lineHeight: 1.32,
      }}
    >

      {/* ── Brand header ─────────────────────────────────────────────────── */}
      <div style={{ textAlign: 'center', marginBottom: '6px' }}>
        <div style={{
          fontFamily: INTER,
          fontSize: '23px',
          fontWeight: 800,
          color: '#111',
          letterSpacing: '0',
          lineHeight: 1.05,
          marginBottom: '4px',
        }}>
          ZarKebab
        </div>
        <div style={{
          fontFamily: INTER,
          fontSize: '10.5px',
          fontWeight: 500,
          color: '#333',
        }}>
          {labels.slogan}
        </div>
      </div>

      <Divider dashed style={{ margin: '7px 0' }} />

      {/* ── Order meta ───────────────────────────────────────────────────── */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '6px' }}>
        <tbody>
          <MetaRow label={labels.table} value={tableName} />
          <MetaRow label={labels.waiter} value={waiterName} />
          <MetaRow label={labels.date} value={dateStr} />
        </tbody>
      </table>

      <Divider dashed style={{ margin: '0 0 6px' }} />

      {/* ── Items table header ───────────────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 48px 74px',
        fontFamily: INTER,
        fontSize: '11px',
        fontWeight: 700,
        color: '#111',
        paddingBottom: '4px',
        borderBottom: '1px solid #ddd',
        marginBottom: '2px',
      }}>
        <span style={{ fontStyle: 'italic' }}>{labels.itemCol}</span>
        <span style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>{labels.qtyCol}</span>
        <span style={{ textAlign: 'right' }}>{labels.amountCol}</span>
      </div>

      {/* ── Item rows ────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: '6px' }}>
        {items.map((item, i) => (
          <div key={i} style={{
            display: 'grid',
            gridTemplateColumns: '1fr 48px 74px',
            alignItems: 'baseline',
            padding: '3px 0',
            borderBottom: '1px solid #eee',
            fontFamily: INTER,
            fontSize: '12px',
            fontWeight: 400,
          }}>
            <span style={{ paddingRight: '6px', lineHeight: 1.25, color: '#111', fontStyle: 'italic' }}>{item.name}</span>
            <span style={{ textAlign: 'center', fontWeight: 500, color: '#333' }}>{item.quantity}</span>
            <span style={{ textAlign: 'right', fontWeight: 600, color: '#111' }}>
              {fmtNum(getOrderItemUnitPrice(item) * (Number(item.quantity) || 1))}
            </span>
          </div>
        ))}
      </div>

      {/* ── Subtotals ────────────────────────────────────────────────────── */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '4px' }}>
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

      <Divider solid style={{ margin: '7px 0' }} />

      {/* ── Grand total ──────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        fontFamily: POPPINS,
        fontSize: '16px',
        fontWeight: 800,
        color: '#111',
        marginBottom: marketingMode === 'none' ? '0' : '4px',
        fontVariantNumeric: 'tabular-nums',
      }}>
        <span>{labels.total}</span>
        <span>{fmtUZS(total)}</span>
      </div>

      {receiptFooter && marketingMode !== 'none' && (
        <div style={{
          textAlign: 'center',
          fontFamily: INTER,
          fontSize: '10px',
          fontWeight: 400,
          color: '#333',
          marginTop: '4px',
        }}>
          {receiptFooter}
        </div>
      )}

      <ReceiptMarketingFooter labels={labels} mode={marketingMode} />
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
        fontSize: '14px',
        fontWeight: 500,
        color: '#555',
        paddingRight: '8px',
        paddingBottom: '4px',
        whiteSpace: 'nowrap',
      }}>
        {label}:
      </td>
      <td style={{
        fontFamily: INTER,
        fontSize: '14px',
        fontWeight: 600,
        color: '#111',
        textAlign: 'right',
        paddingBottom: '4px',
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
        fontSize: '13px',
        fontWeight: 500,
        color: color || '#555',
        paddingBottom: '4px',
      }}>
        {label}:
      </td>
      <td style={{
        fontFamily: INTER,
        fontSize: '13px',
        fontWeight: 600,
        color: color || '#111',
        textAlign: 'right',
        paddingBottom: '4px',
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
    const summary = getOrderPaymentSummary(
      combineReceiptOrders(orders),
      allItems,
      settings.serviceRate ?? 20
    )

    return {
      tableName:  receiptTableLabel(orders[0], table, lang, tableId),
      priceMode: normalizePriceMode(orders[0]?.price_mode),
      waiterName: orders[0]?.waiter_name || '—',
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
  }, [state.orders, state.tables, tableId, settings.serviceRate, menuItemMap, lang])

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

  const menuItemMap = useMemo(() => {
    const m = {}
    state.menuItems.forEach(mi => { m[mi.id] = mi })
    return m
  }, [state.menuItems])

  const data = useMemo(() => {
    const order = state.orders.find(o => o.id === orderId)
    if (!order) return null

    const isOffPremise = isOffPremiseOrderType(inferOrderType(order))

    // Off-premise bills do not share a table, so the order route must stay
    // one receipt per order. Dine-in table receipts can still merge rounds.
    const allOrders = isOffPremise
      ? [order]
      : order.payment_status === 'paid' && order.paid_at
        ? state.orders.filter(
            o => o.table_id === order.table_id &&
                 o.payment_status === 'paid' &&
                 o.paid_at?.slice(0, 16) === order.paid_at.slice(0, 16)
          )
        : (() => {
            const siblings = state.orders.filter(
              o => o.table_id === order.table_id && o.payment_status !== 'paid'
            )
            return siblings.length > 0 ? siblings : [order]
          })()

    const allItems = normalizeReceiptItems(allOrders.flatMap(o => o.items || []), menuItemMap)
    const items = getReceiptItems(allItems, menuItemMap, lang)
    const summary = getOrderPaymentSummary(
      combineReceiptOrders(allOrders),
      allItems,
      settings.serviceRate ?? 20
    )
    const table      = state.tables.find(t => t.id === order.table_id)

    return {
      tableName:  receiptTableLabel(order, table, lang, '—'),
      priceMode: normalizePriceMode(order.price_mode),
      waiterName: order.waiter_name || '—',
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
  }, [state.orders, state.tables, orderId, settings.serviceRate, menuItemMap, lang])

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
