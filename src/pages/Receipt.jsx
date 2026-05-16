import React, { useMemo, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useApp } from '../store/AppContext'
import { getItemName } from '../lib/i18n'
import { ArrowLeft, Printer } from 'lucide-react'

// ── Localisation ──────────────────────────────────────────────────────────────

const L = {
  uz: {
    slogan:      "Olov. Ta'm. An'ana.",
    receiptTitle:'CHEK',
    table:       'Stol',
    waiter:      'Ofitsiant',
    date:        'Sana',
    itemCol:     'Taom',
    qtyCol:      'Soni',
    amountCol:   'Summa',
    orderAmount: 'Buyurtma summasi',
    servicePct:  n => `Xizmat haqi ${n}%`,
    loyaltyPct:  n => `Chegirma (${n}%)`,
    total:       "To'lovga jami",
    thanks1:     'Tashrifingiz uchun rahmat!',
    thanks2:     'Sizni yana kutib qolamiz!',
    scanLabel:   'Instagram uchun skanerlang',
  },
  ru: {
    slogan:      'Огонь. Вкус. Традиции.',
    receiptTitle:'ЧЕК',
    table:       'Стол',
    waiter:      'Официант',
    date:        'Дата',
    itemCol:     'Блюдо',
    qtyCol:      'Кол-во',
    amountCol:   'Сумма',
    orderAmount: 'Сумма заказа',
    servicePct:  n => `Обслуживание ${n}%`,
    loyaltyPct:  n => `Скидка (${n}%)`,
    total:       'Итого к оплате',
    thanks1:     'Спасибо, что выбрали ZarKebab!',
    thanks2:     'Будем рады видеть вас снова!',
    scanLabel:   'Отсканируйте для Instagram',
  },
  en: {
    slogan:      'Fire. Flavor. Tradition.',
    receiptTitle:'RECEIPT',
    table:       'Table',
    waiter:      'Waiter',
    date:        'Date',
    itemCol:     'Item',
    qtyCol:      'Qty',
    amountCol:   'Amount',
    orderAmount: 'Order amount',
    servicePct:  n => `Service ${n}%`,
    loyaltyPct:  n => `Discount (${n}%)`,
    total:       'Total to pay',
    thanks1:     'Thank you for choosing ZarKebab!',
    thanks2:     'We hope to see you again!',
    scanLabel:   'Scan for Instagram',
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
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  html, body { margin: 0; padding: 0; background: #fff; }
  .no-print { display: none !important; }
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
  .receipt-paper {
    display: block !important;
    width: 80mm !important;
    max-width: 80mm !important;
    box-shadow: none !important;
    border-radius: 0 !important;
    margin: 0 !important;
    padding: 6mm 5mm !important;
    border: none !important;
    overflow: visible !important;
  }
}
`

// ── ReceiptPaper ──────────────────────────────────────────────────────────────

function ReceiptPaper({ tableName, waiterName, dateStr, items, subtotal, serviceFee, serviceRate, loyaltyPct, loyaltyAmt, total, labels, restaurantName, receiptFooter }) {
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=https://instagram.com/zarkebab&size=220x220&margin=6&color=111111&bgcolor=ffffff`

  return (
    <div
      className="receipt-paper bg-white"
      style={{
        width: '340px',
        maxWidth: '100%',
        padding: '32px 26px',
        fontFamily: INTER,
        fontVariantNumeric: 'tabular-nums',
        color: '#111',
        fontSize: '14px',
        lineHeight: 1.5,
      }}
    >

      {/* ── Brand header ─────────────────────────────────────────────────── */}
      <div style={{ textAlign: 'center', marginBottom: '4px' }}>
        <div style={{
          fontFamily: POPPINS,
          fontSize: '32px',
          fontWeight: 800,
          letterSpacing: '-0.5px',
          lineHeight: 1.1,
          color: '#111',
        }}>
          {restaurantName}
        </div>
        <div style={{
          fontFamily: INTER,
          fontSize: '12px',
          fontWeight: 500,
          color: '#555',
          marginTop: '5px',
          letterSpacing: '0.1px',
        }}>
          {restaurantName} — {labels.slogan}
        </div>
      </div>

      <Divider dashed style={{ margin: '16px 0 12px' }} />

      {/* ── Receipt title ─────────────────────────────────────────────────── */}
      <div style={{ textAlign: 'center', margin: '10px 0 14px' }}>
        <div style={{
          fontFamily: POPPINS,
          fontSize: '22px',
          fontWeight: 800,
          letterSpacing: '4px',
          textTransform: 'uppercase',
          color: '#111',
        }}>
          {labels.receiptTitle}
        </div>
      </div>

      <Divider dashed style={{ margin: '0 0 12px' }} />

      {/* ── Order meta ───────────────────────────────────────────────────── */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '14px' }}>
        <tbody>
          <MetaRow label={labels.table}  value={tableName}  />
          <MetaRow label={labels.waiter} value={waiterName} />
          <MetaRow label={labels.date}   value={dateStr}    />
        </tbody>
      </table>

      <Divider dashed style={{ margin: '0 0 12px' }} />

      {/* ── Items table header ───────────────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 36px 88px',
        fontFamily: INTER,
        fontSize: '13px',
        fontWeight: 700,
        color: '#111',
        paddingBottom: '8px',
        borderBottom: '1px solid #e0e0e0',
        marginBottom: '4px',
      }}>
        <span>{labels.itemCol}</span>
        <span style={{ textAlign: 'center' }}>{labels.qtyCol}</span>
        <span style={{ textAlign: 'right' }}>{labels.amountCol}</span>
      </div>

      {/* ── Item rows ────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: '12px' }}>
        {items.map((item, i) => (
          <div key={i} style={{
            display: 'grid',
            gridTemplateColumns: '1fr 36px 88px',
            alignItems: 'baseline',
            padding: '6px 0',
            borderBottom: '1px solid #f0f0f0',
            fontFamily: INTER,
            fontSize: '14px',
            fontWeight: 400,
          }}>
            <span style={{ paddingRight: '8px', lineHeight: 1.4, color: '#222' }}>{item.name}</span>
            <span style={{ textAlign: 'center', fontWeight: 500, color: '#444' }}>{item.quantity}</span>
            <span style={{ textAlign: 'right', fontWeight: 600, color: '#111' }}>
              {fmtNum(item.price * item.quantity)}
            </span>
          </div>
        ))}
      </div>

      <Divider dashed style={{ margin: '0 0 10px' }} />

      {/* ── Subtotals ────────────────────────────────────────────────────── */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '4px' }}>
        <tbody>
          <TotalRow label={labels.orderAmount}              value={fmtUZS(subtotal)}   />
          {loyaltyPct > 0 && (
            <TotalRow label={labels.loyaltyPct(loyaltyPct)} value={`− ${fmtUZS(loyaltyAmt)}`} color="#16a34a" />
          )}
          <TotalRow label={labels.servicePct(serviceRate)}  value={fmtUZS(serviceFee)} />
        </tbody>
      </table>

      {/* Solid divider before grand total */}
      <Divider solid style={{ margin: '12px 0' }} />

      {/* ── Grand total ──────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        fontFamily: POPPINS,
        fontSize: '18px',
        fontWeight: 800,
        color: '#111',
        marginBottom: '16px',
        fontVariantNumeric: 'tabular-nums',
      }}>
        <span>{labels.total}</span>
        <span>{fmtUZS(total)}</span>
      </div>

      <Divider dashed style={{ margin: '0 0 16px' }} />

      {/* ── Thank-you footer ─────────────────────────────────────────────── */}
      <div style={{ textAlign: 'center', marginBottom: '16px' }}>
        <div style={{
          fontFamily: INTER,
          fontSize: '14px',
          fontWeight: 600,
          color: '#111',
          marginBottom: '3px',
        }}>
          {labels.thanks1}
        </div>
        {receiptFooter && (
          <div style={{
            fontFamily: INTER,
            fontSize: '13px',
            fontWeight: 400,
            color: '#555',
            marginBottom: '8px',
          }}>
            {receiptFooter}
          </div>
        )}
        <div style={{
          fontFamily: INTER,
          fontSize: '11px',
          fontWeight: 500,
          color: '#999',
          letterSpacing: '0.2px',
        }}>
          {restaurantName} — {labels.slogan}
        </div>
      </div>

      <Divider dashed style={{ margin: '0 0 18px' }} />

      {/* ── QR code section ──────────────────────────────────────────────── */}
      <div style={{ textAlign: 'center' }}>
        <div style={{
          fontFamily: POPPINS,
          fontSize: '14px',
          fontWeight: 700,
          color: '#111',
          marginBottom: '14px',
          letterSpacing: '0.3px',
        }}>
          {labels.scanLabel}
        </div>
        <img
          src={qrUrl}
          alt="Instagram QR"
          width={140}
          height={140}
          style={{
            display: 'block',
            margin: '0 auto 10px',
            borderRadius: '6px',
          }}
        />
        <div style={{
          fontFamily: INTER,
          fontSize: '12px',
          fontWeight: 500,
          color: '#555',
          marginTop: '6px',
        }}>
          Instagram: @zarkebab
        </div>
      </div>

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
  const { state, dispatch } = useApp()
  const lang     = state.lang
  const labels   = L[lang] || L.en
  const settings = state.settings
  const svcRate  = (settings.serviceRate ?? 20) / 100

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
    const allItems = orders.flatMap(o => o.items || [])

    const map = {}
    allItems.forEach(item => {
      const key = item.menu_item_id || item.name
      if (!map[key]) map[key] = { ...item }
      else map[key] = { ...map[key], quantity: (map[key].quantity || 1) + (item.quantity || 1) }
    })
    const items = Object.values(map).map(item => ({
      ...item,
      name: (menuItemMap[item.menu_item_id] && getItemName(menuItemMap[item.menu_item_id], lang)) || item.name,
    }))
    const subtotal   = items.reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0)
    const serviceFee = Math.round(subtotal * svcRate)

    return {
      tableName:  table?.name || orders[0]?.table_name || tableId,
      waiterName: orders[0]?.waiter_name || '—',
      createdAt:  orders[0]?.created_at,
      items,
      subtotal,
      serviceFee,
      serviceRate: settings.serviceRate ?? 20,
      loyaltyPct:  0,
      loyaltyAmt:  0,
      total: subtotal + serviceFee,
    }
  }, [state.orders, state.tables, tableId, svcRate, settings.serviceRate, menuItemMap, lang])

  if (!data) return <NotFound onBack={() => navigate(-1)} />

  return (
    <ReceiptShell lang={lang} dispatch={dispatch} onBack={() => navigate(-1)} autoPrint={settings.autoPrint}>
      <ReceiptPaper
        {...data}
        dateStr={formatDate(data.createdAt)}
        labels={labels}
        restaurantName={settings.restaurantName}
        receiptFooter={settings.receiptFooter}
      />
    </ReceiptShell>
  )
}

// ── Route: /receipt/:orderId  (legacy) ───────────────────────────────────────

export default function Receipt() {
  const { orderId } = useParams()
  const navigate    = useNavigate()
  const { state, dispatch } = useApp()
  const lang     = state.lang
  const labels   = L[lang] || L.en
  const settings = state.settings
  const svcRate  = (settings.serviceRate ?? 20) / 100

  const menuItemMap = useMemo(() => {
    const m = {}
    state.menuItems.forEach(mi => { m[mi.id] = mi })
    return m
  }, [state.menuItems])

  const data = useMemo(() => {
    const order = state.orders.find(o => o.id === orderId)
    if (!order) return null

    const siblings  = state.orders.filter(
      o => o.table_id === order.table_id && o.payment_status !== 'paid'
    )
    const allOrders = siblings.length > 0 ? siblings : [order]
    const allItems  = allOrders.flatMap(o => o.items || [])

    const map = {}
    allItems.forEach(item => {
      const key = item.menu_item_id || item.name
      if (!map[key]) map[key] = { ...item }
      else map[key] = { ...map[key], quantity: (map[key].quantity || 1) + (item.quantity || 1) }
    })
    const items = Object.values(map).map(item => ({
      ...item,
      name: (menuItemMap[item.menu_item_id] && getItemName(menuItemMap[item.menu_item_id], lang)) || item.name,
    }))

    const loyaltyPct = order.loyalty_discount_pct   || 0
    const loyaltyAmt = order.loyalty_discount_amount || 0
    const subtotal   = items.reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0)
    const afterDisc  = subtotal - loyaltyAmt
    const serviceFee = Math.round(afterDisc * svcRate)
    const table      = state.tables.find(t => t.id === order.table_id)

    return {
      tableName:  table?.name || order.table_name || '—',
      waiterName: order.waiter_name || '—',
      createdAt:  order.created_at,
      items,
      subtotal,
      serviceFee,
      serviceRate: settings.serviceRate ?? 20,
      loyaltyPct,
      loyaltyAmt,
      total: order.total || (afterDisc + serviceFee),
    }
  }, [state.orders, state.tables, orderId, svcRate, settings.serviceRate, menuItemMap, lang])

  if (!data) return <NotFound onBack={() => navigate(-1)} />

  return (
    <ReceiptShell lang={lang} dispatch={dispatch} onBack={() => navigate(-1)} autoPrint={settings.autoPrint}>
      <ReceiptPaper
        {...data}
        dateStr={formatDate(data.createdAt)}
        labels={labels}
        restaurantName={settings.restaurantName}
        receiptFooter={settings.receiptFooter}
      />
    </ReceiptShell>
  )
}

// ── Shell (screen top-bar + background) ──────────────────────────────────────

function ReceiptShell({ lang, dispatch, onBack, autoPrint, children }) {
  useEffect(() => {
    if (!autoPrint) return
    const t = setTimeout(() => window.print(), 600)
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
          onClick={() => window.print()}
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
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white rounded-2xl p-10 text-center shadow-lg max-w-xs">
        <p className="text-4xl mb-3">🧾</p>
        <p className="text-gray-600 font-semibold">Order not found</p>
        <button onClick={onBack} className="mt-5 text-[#ff5a00] font-bold hover:underline text-sm">
          ← Back
        </button>
      </div>
    </div>
  )
}

function formatDate(isoString) {
  const d   = isoString ? new Date(isoString) : new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
