import React, { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Printer, CheckCircle2, Banknote, CreditCard,
  Receipt, Users, Clock, Tag, UtensilsCrossed, Menu as MenuIcon,
  Monitor, QrCode, MoreHorizontal,
} from 'lucide-react'
import { useApp } from '../store/AppContext'
import { useAuth } from '../contexts/AuthContext'
import { t } from '../lib/i18n'
import { formatCurrency } from '../lib/formatCurrency'
import UnifiedSidebar from '../components/UnifiedSidebar'
import StatusBadge from '../components/StatusBadge'

// ── Constants ──────────────────────────────────────────────────────────────────
const LOYALTY_PRESETS = [0, 5, 10, 15, 20]
const CASH_PRESETS    = [
  { label: 'Exact',   exact: true  },
  { label: '150,000', value: 150000 },
  { label: '200,000', value: 200000 },
  { label: '500,000', value: 500000 },
]

const PAY_METHODS = [
  { key: 'cash',     icon: Banknote,  labelUz: 'Naqd',    labelRu: 'Наличные',  labelEn: 'Cash'     },
  { key: 'card',     icon: CreditCard, labelUz: 'Karta',   labelRu: 'Карта',     labelEn: 'Card'     },
  { key: 'terminal', icon: Monitor,   labelUz: 'Terminal', labelRu: 'Терминал',  labelEn: 'Terminal' },
  { key: 'qr',       icon: QrCode,    labelUz: 'QR Code',  labelRu: 'QR-код',    labelEn: 'QR Code'  },
]

function payLabel(m, lang) {
  return lang === 'uz' ? m.labelUz : lang === 'ru' ? m.labelRu : m.labelEn
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function elapsedSince(iso) {
  if (!iso) return null
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1)  return '< 1 min ago'
  if (m < 60) return `${m} min ago`
  return `${Math.floor(m / 60)}h ${m % 60}m ago`
}

function getDesc(menuItem, lang) {
  if (!menuItem) return ''
  return menuItem[`description_${lang}`] || menuItem.description_en || menuItem.description_uz || ''
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function CashierBill() {
  const { tableId }  = useParams()
  const navigate     = useNavigate()
  const { state, dispatch } = useApp()
  const lang = state.lang

  const serviceRate = (state.settings?.serviceRate ?? 20) / 100

  const [payMethod,  setPayMethod]  = useState('cash')
  const [received,   setReceived]   = useState('')
  const [loyaltyPct, setLoyaltyPct] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Merge all active orders for this table into one
  const order = useMemo(() => {
    const orders = state.orders.filter(o => o.table_id === tableId && o.payment_status !== 'paid')
    if (orders.length === 0) return null
    const allItems = orders.flatMap(o => o.items || [])
    // Group same menu items
    const itemMap = {}
    allItems.forEach(item => {
      const key = item.menu_item_id || item.name
      if (!itemMap[key]) itemMap[key] = { ...item }
      else itemMap[key] = { ...itemMap[key], quantity: (itemMap[key].quantity || 1) + (item.quantity || 1) }
    })
    const mergedItems = Object.values(itemMap)
    const subtotal    = mergedItems.reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0)
    const service_fee = Math.round(subtotal * serviceRate)
    return {
      ...orders[0],
      items:       mergedItems,
      subtotal,
      service_fee,
      total:       subtotal + service_fee,
    }
  }, [state.orders, tableId])

  const table = state.tables.find(t => t.id === tableId)

  const menuItemMap = useMemo(() => {
    const m = {}
    state.menuItems.forEach(mi => { m[mi.id] = mi })
    return m
  }, [state.menuItems])

  // ── Totals ─────────────────────────────────────────────────────────────────
  const subtotal      = order ? order.items.reduce((s, i) => s + i.price * i.quantity, 0) : 0
  const loyaltyAmt    = Math.round(subtotal * loyaltyPct / 100)
  const afterDiscount = subtotal - loyaltyAmt
  const serviceFee    = Math.round(afterDiscount * serviceRate)
  const total         = afterDiscount + serviceFee

  // Cash
  const receivedNum  = parseFloat(received) || 0
  const change       = receivedNum - total
  const shortfall    = total - receivedNum
  const needsCash    = payMethod === 'cash'
  const canProcess   = !needsCash || receivedNum >= total

  function applyPreset(p) {
    setReceived(p.exact ? String(total) : String(p.value))
  }

  function handlePaid() {
    dispatch({
      type: 'MARK_ORDER_PAID',
      payload: {
        tableId,
        payment_method: payMethod,
        loyalty: {
          loyalty_discount_pct:    loyaltyPct,
          loyalty_discount_amount: loyaltyAmt,
          discounted_subtotal:     afterDiscount,
          service_fee:             serviceFee,
          total,
        },
      },
    })
    navigate('/cashier/tables')
  }

  // ── Localized strings ───────────────────────────────────────────────────────
  const lbl = {
    backTables:   lang === 'uz' ? 'Storlarga qaytish' : lang === 'ru' ? 'Назад к столам' : 'Back to Tables',
    waiter:       lang === 'uz' ? 'Ofitsiant' : lang === 'ru' ? 'Официант' : 'Waiter',
    opened:       lang === 'uz' ? 'Ochildi' : lang === 'ru' ? 'Открыт' : 'Opened',
    orderItems:   lang === 'uz' ? 'Buyurtma elementlari' : lang === 'ru' ? 'Позиции заказа' : 'Order Items',
    item:         lang === 'uz' ? 'Mahsulot' : lang === 'ru' ? 'Блюдо' : 'Item',
    qty:          lang === 'uz' ? 'Miqdor' : lang === 'ru' ? 'Кол-во' : 'Qty',
    unitPrice:    lang === 'uz' ? 'Narxi' : lang === 'ru' ? 'Цена' : 'Unit Price',
    total:        lang === 'uz' ? 'Jami' : lang === 'ru' ? 'Итого' : 'Total',
    paySummary:   lang === 'uz' ? "To'lov xulosasi" : lang === 'ru' ? 'Итоговый счёт' : 'Payment Summary',
    subtotal:     lang === 'uz' ? 'Buyurtma summasi' : lang === 'ru' ? 'Сумма заказа' : 'Subtotal',
    service:      lang === 'uz' ? `Xizmat (${serviceRate * 100}%)` : lang === 'ru' ? `Обслуживание (${serviceRate * 100}%)` : `Service (${serviceRate * 100}%)`,
    loyalty:      lang === 'uz' ? 'Chegirma' : lang === 'ru' ? 'Скидка' : 'Discount',
    totalAmt:     lang === 'uz' ? "To'lovga jami" : lang === 'ru' ? 'Итого к оплате' : 'Total Amount',
    payMethod:    lang === 'uz' ? "To'lov usuli" : lang === 'ru' ? 'Способ оплаты' : 'Payment Method',
    receivedAmt:  lang === 'uz' ? 'Qabul qilingan summa' : lang === 'ru' ? 'Полученная сумма' : 'Enter received amount',
    changeAmt:    lang === 'uz' ? 'Qaytim' : lang === 'ru' ? 'Сдача' : 'Change',
    remaining:    lang === 'uz' ? 'Yetishmaydi' : lang === 'ru' ? 'Не хватает' : 'Remaining',
    quickAmt:     lang === 'uz' ? 'Tez summa' : lang === 'ru' ? 'Быстрая сумма' : 'Quick Amount',
    exact:        lang === 'uz' ? 'Aniq' : lang === 'ru' ? 'Точно' : 'Exact',
    confirmPay:   lang === 'uz' ? "To'lovni tasdiqlash" : lang === 'ru' ? 'Подтвердить оплату' : 'Confirm Payment',
    printBill:    lang === 'uz' ? 'Hisob chiqarish' : lang === 'ru' ? 'Распечатать счёт' : 'Print Bill',
    printReceipt: lang === 'uz' ? 'Chek chiqarish' : lang === 'ru' ? 'Распечатать чек' : 'Print Receipt',
    loyaltyLabel: lang === 'uz' ? 'Sodiqlik chegirmasi' : lang === 'ru' ? 'Скидка лояльности' : 'Loyalty Discount',
    saving:       lang === 'uz' ? 'Tejash' : lang === 'ru' ? 'Экономия' : 'Saving',
    noOrder:      lang === 'uz' ? 'Bu stol uchun faol buyurtma yo\'q' : lang === 'ru' ? 'Нет активного заказа для этого стола' : 'No active order for this table',
    noteLabel:    lang === 'uz' ? 'Izoh' : lang === 'ru' ? 'Примечание' : 'Note',
  }

  // ── Empty state ─────────────────────────────────────────────────────────────
  if (!order) {
    return (
      <div className="flex overflow-hidden bg-[#FAF7F0]" style={{ height: '100dvh' }}>
        <div className="hidden lg:block flex-shrink-0 h-full"><UnifiedSidebar /></div>
        <div className="flex flex-col flex-1 min-w-0 items-center justify-center p-8">
          <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm p-10 flex flex-col items-center text-center max-w-sm w-full">
            <div className="w-16 h-16 bg-orange-50 rounded-2xl flex items-center justify-center mb-4">
              <Receipt size={28} className="text-orange-300" strokeWidth={1.5} />
            </div>
            <p className="font-black text-[#1F2937] text-base mb-1">{lbl.noOrder}</p>
            <p className="text-sm text-[#6B7280] mt-1 mb-5">
              {lang === 'uz' ? "Buyurtma allaqachon to'langan bo'lishi mumkin." : lang === 'ru' ? 'Возможно, заказ уже оплачен.' : 'The order may have already been paid.'}
            </p>
            <button
              onClick={() => navigate('/cashier/tables')}
              className="flex items-center gap-2 text-[#ff5a00] font-semibold hover:underline text-sm"
            >
              <ArrowLeft size={15} /> {lbl.backTables}
            </button>
          </div>
        </div>
      </div>
    )
  }

  const totalItems = order.items.reduce((s, i) => s + i.quantity, 0)

  return (
    <div className="flex overflow-hidden bg-[#FAF7F0]" style={{ height: '100dvh' }}>

      {/* Sidebar – desktop */}
      <div className="hidden lg:block flex-shrink-0 h-full">
        <UnifiedSidebar />
      </div>

      {/* Sidebar – mobile overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
          <div className="relative z-10 h-full">
            <UnifiedSidebar onClose={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      {/* Main column */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

        {/* Top header */}
        <header className="flex-shrink-0 bg-white border-b border-[#E5E7EB] px-5 py-3 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 -ml-1 rounded-xl hover:bg-gray-100 transition-colors"
            >
              <MenuIcon size={20} className="text-[#6B7280]" />
            </button>
            {/* Back button */}
            <button
              onClick={() => navigate('/cashier/tables')}
              className="flex items-center justify-center w-9 h-9 rounded-xl border border-[#E5E7EB] text-[#6B7280] hover:text-[#ff5a00] hover:border-orange-300 hover:bg-orange-50 transition-colors flex-shrink-0"
            >
              <ArrowLeft size={17} />
            </button>
            <div>
              <p className="font-black text-[#1F2937] text-[15px] leading-tight">
                {lang === 'uz' ? 'Kassir' : lang === 'ru' ? 'Кассир' : 'Cashier'}
              </p>
              <p className="text-[11px] text-[#6B7280] font-medium">
                {lang === 'uz' ? "To'lovlarni qayta ishlash va hisoblarni yopish" : lang === 'ru' ? 'Обработка платежей и закрытие счетов' : 'Process payments and close bills'}
              </p>
            </div>
          </div>
          {/* Lang switcher */}
          <div className="flex items-center gap-2">
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
              {['uz', 'ru', 'en'].map(l => (
                <button
                  key={l}
                  onClick={() => dispatch({ type: 'SET_LANG', payload: l })}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase transition-colors ${
                    lang === l ? 'bg-white text-[#1F2937] shadow-sm' : 'text-[#6B7280] hover:text-[#1F2937]'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
        </header>

        {/* Scrollable area */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-5">
          <div className="flex flex-col lg:flex-row gap-4 items-start max-w-[1280px] mx-auto">

            {/* ══ CENTER: order details ══════════════════════════════════════ */}
            <div className="w-full lg:flex-[60] min-w-0 flex flex-col gap-3">

              {/* Bill card */}
              <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm overflow-hidden">

                {/* Bill header */}
                <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
                  {/* Table info */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h1 className="font-black text-[#1F2937] text-2xl leading-tight">{table?.name}</h1>
                        <StatusBadge status={order.payment_status === 'paid' ? 'paid' : order.status} />
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-[11px] text-[#6B7280]">
                        {order.waiter_name && (
                          <span className="flex items-center gap-1">
                            <Users size={11} />
                            {lbl.waiter}: {order.waiter_name}
                          </span>
                        )}
                        {order.created_at && (
                          <span className="flex items-center gap-1">
                            <Clock size={11} />
                            {lbl.opened}: {elapsedSince(order.created_at)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => navigate(`/receipt/table/${tableId}`)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E5E7EB] text-[#1F2937] text-[12px] font-semibold hover:bg-gray-100 transition-colors"
                      >
                        <Printer size={14} />
                        {lbl.printBill}
                      </button>
                      <button className="w-9 h-9 flex items-center justify-center rounded-xl border border-[#E5E7EB] hover:bg-gray-100 text-[#6B7280] transition-colors">
                        <MoreHorizontal size={16} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Column headers */}
                <div className="hidden sm:grid grid-cols-12 gap-2 px-5 py-2.5 bg-gray-50 border-b border-gray-100 text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">
                  <div className="col-span-6">{lbl.item}</div>
                  <div className="col-span-2 text-center">{lbl.qty}</div>
                  <div className="col-span-2 text-right">{lbl.unitPrice}</div>
                  <div className="col-span-2 text-right">{lbl.total}</div>
                </div>

                {/* Item rows */}
                <div className="divide-y divide-[#F9FAFB]">
                  {order.items.map((item, i) => {
                    const mi   = menuItemMap[item.menu_item_id]
                    const desc = getDesc(mi, lang)
                    return (
                      <div
                        key={i}
                        className="grid grid-cols-12 gap-3 px-5 py-4 items-center hover:bg-gray-50/50 transition-colors"
                      >
                        {/* Image + name + desc */}
                        <div className="col-span-12 sm:col-span-6 flex items-center gap-3 min-w-0">
                          <div className="w-14 h-14 rounded-xl overflow-hidden bg-orange-50 border border-gray-100 flex-shrink-0">
                            {mi?.image_url ? (
                              <img
                                src={mi.image_url}
                                alt={item.name}
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <UtensilsCrossed size={18} className="text-orange-200" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-sm text-[#1F2937] line-clamp-1">{item.name}</p>
                            {desc && (
                              <p className="text-[11px] text-[#6B7280] line-clamp-1 mt-0.5">{desc}</p>
                            )}
                            {item.notes && (
                              <p className="text-[11px] text-amber-600 mt-0.5 line-clamp-1">
                                {lbl.noteLabel}: {item.notes}
                              </p>
                            )}
                            {/* Mobile: qty + price */}
                            <div className="flex items-center gap-3 mt-1.5 sm:hidden">
                              <span className="inline-flex items-center justify-center bg-[#fff1e8] text-[#ff5a00] font-black text-[11px] rounded-lg px-2 py-0.5">
                                ×{item.quantity}
                              </span>
                              <span className="text-xs text-[#6B7280]">{formatCurrency(item.price)}</span>
                              <span className="text-sm font-black text-[#1F2937]">{formatCurrency(item.price * item.quantity)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Qty */}
                        <div className="hidden sm:flex col-span-2 justify-center">
                          <span className="inline-flex items-center justify-center bg-[#fff1e8] text-[#ff5a00] font-black text-xs rounded-lg w-9 h-7">
                            ×{item.quantity}
                          </span>
                        </div>

                        {/* Unit price */}
                        <div className="hidden sm:block col-span-2 text-right text-sm text-[#6B7280] font-medium">
                          {formatCurrency(item.price)}
                        </div>

                        {/* Line total */}
                        <div className="hidden sm:block col-span-2 text-right font-black text-sm text-[#1F2937]">
                          {formatCurrency(item.price * item.quantity)}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Items footer: subtotal strip */}
                <div className="px-5 py-4 bg-gray-50 border-t border-gray-100 space-y-2">
                  <div className="flex justify-between text-sm text-[#6B7280]">
                    <span>{lbl.subtotal}</span>
                    <span>{formatCurrency(subtotal)}</span>
                  </div>
                  {loyaltyPct > 0 && (
                    <div className="flex justify-between text-sm text-[#16A34A] font-medium">
                      <span>{lbl.loyalty} ({loyaltyPct}%)</span>
                      <span>− {formatCurrency(loyaltyAmt)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm text-[#6B7280]">
                    <span>{lbl.service}</span>
                    <span>{formatCurrency(serviceFee)}</span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-dashed border-gray-200">
                    <span className="font-black text-[#1F2937]">{lbl.totalAmt}</span>
                    <span className="font-black text-2xl text-[#ff5a00]">{formatCurrency(total)}</span>
                  </div>
                </div>
              </div>

              {/* Loyalty card */}
              <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Tag size={15} className="text-[#ff5a00]" />
                  <p className="text-[11px] font-bold text-[#9CA3AF] uppercase tracking-widest">{lbl.loyaltyLabel}</p>
                </div>
                <div className="flex gap-1.5 flex-wrap mb-3">
                  {LOYALTY_PRESETS.map(pct => (
                    <button
                      key={pct}
                      onClick={() => setLoyaltyPct(pct)}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${
                        loyaltyPct === pct
                          ? 'border-[#ff5a00] bg-[#fff1e8] text-[#ff5a00]'
                          : 'border-[#E5E7EB] text-[#6B7280] hover:border-orange-300 bg-white'
                      }`}
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <input
                    type="number" min="0" max="100"
                    value={loyaltyPct === 0 ? '' : loyaltyPct}
                    onChange={e => setLoyaltyPct(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                    placeholder="Custom %"
                    className="w-full border-2 border-[#E5E7EB] rounded-xl px-4 py-2.5 text-sm font-semibold text-[#1F2937] pr-8 focus:outline-none focus:border-[#ff5a00] transition-all"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] text-sm font-bold">%</span>
                </div>
                {loyaltyPct > 0 && (
                  <div className="mt-3 bg-green-50 border border-green-200 rounded-xl px-4 py-2.5 flex justify-between items-center">
                    <span className="text-sm text-[#16A34A] font-medium">{lbl.saving}</span>
                    <span className="font-black text-[#16A34A]">− {formatCurrency(loyaltyAmt)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* ══ RIGHT: payment panel ════════════════════════════════════════ */}
            <div className="w-full lg:w-[360px] flex-shrink-0 flex flex-col gap-3 lg:sticky lg:top-0">

              {/* Payment Summary */}
              <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm p-5">
                <h3 className="font-black text-[#1F2937] text-base mb-4">{lbl.paySummary}</h3>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-[#6B7280]">{lbl.subtotal}</span>
                    <span className="text-[#1F2937] font-semibold">{formatCurrency(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[#6B7280]">{lbl.service}</span>
                    <span className="text-[#1F2937] font-semibold">{formatCurrency(serviceFee)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[#6B7280]">{lbl.loyalty}</span>
                    <span className="text-[#1F2937] font-semibold">
                      {loyaltyPct > 0 ? `− ${formatCurrency(loyaltyAmt)}` : `− 0 UZS`}
                    </span>
                  </div>
                  <div className="pt-3 border-t border-dashed border-[#E5E7EB] flex justify-between items-baseline">
                    <span className="font-black text-[#1F2937] text-sm">{lbl.totalAmt}</span>
                    <span className="font-black text-2xl text-[#ff5a00]">{formatCurrency(total)}</span>
                  </div>
                </div>
              </div>

              {/* Payment Method */}
              <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm p-5">
                <h3 className="font-black text-[#1F2937] text-sm mb-3">{lbl.payMethod}</h3>

                <div className="grid grid-cols-2 gap-2 mb-4">
                  {PAY_METHODS.map(m => {
                    const Icon = m.icon
                    const active = payMethod === m.key
                    return (
                      <button
                        key={m.key}
                        onClick={() => setPayMethod(m.key)}
                        className={`flex flex-col items-center gap-2 py-3.5 rounded-xl border-2 font-semibold text-[12px] transition-all ${
                          active
                            ? 'border-[#ff5a00] bg-[#fff1e8] text-[#ff5a00]'
                            : 'border-[#E5E7EB] text-[#6B7280] hover:border-gray-300 bg-white'
                        }`}
                      >
                        <Icon size={20} strokeWidth={active ? 2.5 : 1.5} />
                        {payLabel(m, lang)}
                      </button>
                    )
                  })}
                </div>

                {/* Cash section */}
                {payMethod === 'cash' && (
                  <div className="space-y-3">
                    {/* Quick amounts */}
                    <div>
                      <p className="text-[10px] font-semibold text-[#9CA3AF] mb-2 uppercase tracking-wide">
                        {lbl.quickAmt}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {CASH_PRESETS.map((p, i) => (
                          <button
                            key={i}
                            onClick={() => applyPreset(p)}
                            className="px-3 py-1.5 rounded-xl border border-[#E5E7EB] text-xs font-semibold text-[#6B7280] hover:border-[#ff5a00] hover:text-[#ff5a00] bg-white transition-all"
                          >
                            {p.exact ? lbl.exact : p.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Received amount input */}
                    <div>
                      <label className="text-[10px] font-semibold text-[#9CA3AF] block mb-1.5 uppercase tracking-wide">
                        {lbl.receivedAmt}
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          value={received}
                          onChange={e => setReceived(e.target.value)}
                          placeholder={`0`}
                          className="w-full border-2 border-[#E5E7EB] rounded-xl px-4 py-3 text-xl font-black text-[#1F2937] pr-16 focus:outline-none focus:border-[#ff5a00] transition-all"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[#9CA3AF] text-sm font-bold">UZS</span>
                      </div>
                    </div>

                    {/* Change / shortfall */}
                    {receivedNum > 0 && (
                      <div className={`rounded-xl px-4 py-3 flex justify-between items-center ${
                        change >= 0
                          ? 'bg-green-50 border border-green-200'
                          : 'bg-red-50 border border-red-200'
                      }`}>
                        <span className={`text-sm font-semibold ${change >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'}`}>
                          {change >= 0 ? lbl.changeAmt : lbl.remaining}
                        </span>
                        <span className={`font-black text-lg ${change >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'}`}>
                          {formatCurrency(Math.abs(change >= 0 ? change : shortfall))}
                        </span>
                      </div>
                    )}

                    {/* When no input yet, show placeholder change row */}
                    {receivedNum === 0 && (
                      <div className="rounded-xl px-4 py-3 flex justify-between items-center bg-gray-50 border border-gray-100">
                        <span className="text-sm font-semibold text-[#9CA3AF]">{lbl.changeAmt}</span>
                        <span className="font-black text-lg text-[#9CA3AF]">0 UZS</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Card / Terminal / QR helper */}
                {payMethod !== 'cash' && (
                  <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3 flex items-center gap-2">
                    {React.createElement(PAY_METHODS.find(m => m.key === payMethod)?.icon || Receipt, {
                      size: 15,
                      className: 'text-[#6B7280] flex-shrink-0',
                    })}
                    <p className="text-sm text-[#6B7280] font-medium">
                      {payMethod === 'card'
                        ? (lang === 'uz' ? 'Karta orqali to\'lov' : lang === 'ru' ? 'Оплата картой' : 'Card terminal payment')
                        : payMethod === 'terminal'
                        ? (lang === 'uz' ? 'Terminal orqali to\'lov' : lang === 'ru' ? 'Оплата через терминал' : 'Terminal payment selected')
                        : (lang === 'uz' ? 'QR kod orqali to\'lov' : lang === 'ru' ? 'Оплата по QR-коду' : 'QR payment selected')}
                    </p>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm p-5 space-y-2.5">
                <button
                  onClick={handlePaid}
                  disabled={!canProcess}
                  className={`w-full flex items-center justify-center gap-2 py-4 rounded-xl font-black text-base transition-all active:scale-[0.98] ${
                    canProcess
                      ? 'bg-[#ff5a00] text-white hover:bg-[#cc4800] shadow-lg shadow-orange-200'
                      : 'bg-gray-100 text-[#9CA3AF] cursor-not-allowed'
                  }`}
                >
                  <CheckCircle2 size={19} />
                  {lbl.confirmPay}
                </button>

                <button
                  onClick={() => navigate(`/receipt/table/${tableId}`)}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-[#E5E7EB] text-[#1F2937] font-bold text-sm hover:bg-gray-50 transition-colors"
                >
                  <Printer size={16} />
                  {lbl.printReceipt}
                </button>

              </div>
            </div>

          </div>
        </div>
        {/* Mobile sticky confirm button */}
        <div className="lg:hidden flex-shrink-0 bg-white border-t border-[#E5E7EB] px-4 py-3 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
          <button
            onClick={handlePaid}
            disabled={!canProcess}
            className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-black text-base transition-all active:scale-[0.98] ${
              canProcess
                ? 'bg-[#ff5a00] text-white hover:bg-[#cc4800] shadow-lg shadow-orange-200'
                : 'bg-gray-100 text-[#9CA3AF] cursor-not-allowed'
            }`}
          >
            <CheckCircle2 size={19} />
            {lbl.confirmPay}
          </button>
        </div>
      </div>
    </div>
  )
}
