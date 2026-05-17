import React, { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../store/AppContext'
import { supabase } from '../lib/supabase'
import { getCategoryName } from '../lib/i18n'
import { formatCurrency } from '../lib/formatCurrency'
import {
  getOrderDate,
  getOrderItems,
  getOrderPaymentSummary,
  getOrderTotal,
  groupOrdersBySession,
  isPaidOrder,
  matchesRange,
  toLocalDateStr,
} from '../lib/analytics'
import AppShell from '../components/AppShell'
import {
  TrendingUp, ShoppingBag, DollarSign, Package,
  Download, X, Printer, Eye, ChevronLeft, ChevronRight,
  Search, SlidersHorizontal, CreditCard,
  Monitor, QrCode, Banknote, UtensilsCrossed,
  BarChart2, Clock, Tag, Users, ListOrdered, HelpCircle,
} from 'lucide-react'

/** Payment method with fallback */
function getPaymentMethod(o) {
  return o.payment_method || null
}

function addDays(isoDate, n) {
  const d = new Date(isoDate + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return toLocalDateStr(d.toISOString())
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_SIZE    = 8

const TABS = [
  { key: 'best_selling',       label: { uz: 'Ko\'p sotiladigan', ru: 'Бестселлеры',    en: 'Best Selling'       }, Icon: TrendingUp  },
  { key: 'by_category',        label: { uz: 'Kategoriya',         ru: 'По категории',   en: 'Sales by Category'  }, Icon: Tag         },
  { key: 'by_hour',            label: { uz: 'Soat bo\'yicha',     ru: 'По часам',       en: 'Sales by Hour'      }, Icon: Clock       },
  { key: 'payment_methods',    label: { uz: 'To\'lov usullari',   ru: 'Методы оплаты',  en: 'Payment Methods'    }, Icon: CreditCard  },
  { key: 'waiter_performance', label: { uz: 'Ofitsiantlar',       ru: 'Официанты',      en: 'Waiter Performance' }, Icon: Users       },
  { key: 'order_history',      label: { uz: 'Buyurtmalar',        ru: 'История',        en: 'Order History'      }, Icon: ListOrdered },
]

const STATUS_CFG = {
  paid:      { label: { uz: 'To\'landi',   ru: 'Оплачен',    en: 'Paid'      }, cls: 'bg-green-50 text-green-700 border-green-200'   },
  unpaid:    { label: { uz: 'To\'lanmagan',ru: 'Не оплачен', en: 'Unpaid'    }, cls: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  cancelled: { label: { uz: 'Bekor',       ru: 'Отменён',    en: 'Cancelled' }, cls: 'bg-red-50 text-red-600 border-red-200'          },
}

const PAY_CFG = {
  cash:     { label: { uz: 'Naqd',      ru: 'Наличные',   en: 'Cash'     }, cls: 'bg-green-50 text-green-700',   Icon: Banknote,   bar: '#16A34A' },
  card:     { label: { uz: 'Karta',     ru: 'Карта',      en: 'Card'     }, cls: 'bg-blue-50 text-blue-700',     Icon: CreditCard, bar: '#2563EB' },
  terminal: { label: { uz: 'Terminal',  ru: 'Терминал',   en: 'Terminal' }, cls: 'bg-purple-50 text-purple-700', Icon: Monitor,    bar: '#7C3AED' },
  qr:       { label: { uz: 'QR Kod',    ru: 'QR Код',     en: 'QR Code'  }, cls: 'bg-pink-50 text-pink-700',     Icon: QrCode,     bar: '#DB2777' },
  unknown:  { label: { uz: "Noma'lum",  ru: 'Неизвестно', en: 'Unknown'  }, cls: 'bg-gray-50 text-gray-600',     Icon: HelpCircle, bar: '#9CA3AF' },
}

// ─────────────────────────────────────────────────────────────────────────────
// SMALL UI ATOMS
// ─────────────────────────────────────────────────────────────────────────────

function todayStr() {
  return toLocalDateStr(new Date().toISOString())
}

function fmtDate(iso) {
  if (!iso) return '—'
  const d   = new Date(iso)
  const pad = n => String(n).padStart(2, '0')
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}  ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function StatusBadge({ status, lang }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.unpaid
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${cfg.cls}`}>
      {cfg.label[lang] || cfg.label.en}
    </span>
  )
}

function PayBadge({ method, lang }) {
  const key = (method || '').toLowerCase()
  const cfg = PAY_CFG[key] || PAY_CFG.unknown
  const { Icon } = cfg
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${cfg.cls}`}>
      <Icon size={10} />
      {cfg.label[lang] || cfg.label.en}
    </span>
  )
}

function KpiCard({ icon: Icon, iconCls, label, value, sub }) {
  return (
    <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 shadow-sm flex flex-col gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconCls}`}>
        <Icon size={20} />
      </div>
      <div>
        <p className="text-xs text-[#6B7280] font-medium mb-1">{label}</p>
        <p className="text-2xl font-black text-[#1F2937] leading-tight">{value}</p>
        {sub && <p className="text-[11px] text-[#ff5a00] font-semibold mt-1">{sub}</p>}
      </div>
    </div>
  )
}

function ProgressBar({ pct, color = '#ff5a00' }) {
  return (
    <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

function EmptyState({ label, lang }) {
  return (
    <div className="bg-white border border-[#E5E7EB] rounded-2xl py-20 text-center shadow-sm">
      <BarChart2 size={36} className="mx-auto mb-3 text-gray-200" />
      <p className="text-[#6B7280] font-semibold">
        {label || (lang === 'uz' ? "Bu davr uchun ma'lumot yo'q" : lang === 'ru' ? 'Нет данных за этот период' : 'No data for this period')}
      </p>
      <p className="text-[12px] text-[#9CA3AF] mt-1">
        {lang === 'uz' ? 'Boshqa sana yoki filterni tanlang' : lang === 'ru' ? 'Выберите другую дату или уберите фильтры' : 'Try selecting a different date or removing filters'}
      </p>
    </div>
  )
}

function PageBtn({ children, onClick, disabled, active }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-7 h-7 flex items-center justify-center rounded-lg text-xs font-bold transition-colors ${
        active   ? 'bg-[#ff5a00] text-white' :
        disabled ? 'text-gray-300 cursor-not-allowed' :
                   'text-[#6B7280] hover:bg-gray-100'
      }`}
    >
      {children}
    </button>
  )
}

function SummaryRow({ label, value, bold, valueClass }) {
  return (
    <div className="flex justify-between items-center">
      <span className={`text-sm ${bold ? 'font-black text-[#1F2937]' : 'text-[#6B7280] font-medium'}`}>{label}</span>
      <span className={`text-sm tabular-nums ${bold ? 'font-black text-[#ff5a00]' : `font-semibold text-[#1F2937] ${valueClass || ''}`}`}>
        {value}
      </span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 1 — BEST SELLING
// ─────────────────────────────────────────────────────────────────────────────

function BestSellingTab({ orders, menuItemMap, categories, lang }) {
  const [sortBy, setSortBy] = useState('quantity') // 'quantity' | 'revenue'

  const items = useMemo(() => {
    const map = {}
    orders.forEach(o => {
      getOrderItems(o).forEach(item => {
        const key = item.menu_item_id || item.name || 'unknown'
        const mi  = menuItemMap[item.menu_item_id]
        const cat = mi ? categories.find(c => c.id === mi.category_id) : null
        if (!map[key]) {
          map[key] = {
            name:     item.name || mi?.name_en || mi?.name_uz || 'Unknown',
            image:    item.image_url || mi?.image_url || null,
            category: cat ? getCategoryName(cat, lang) : '—',
            quantity: 0,
            revenue:  0,
          }
        }
        map[key].quantity += Number(item.quantity) || 1
        map[key].revenue  += (Number(item.price) || 0) * (Number(item.quantity) || 1)
      })
    })
    return Object.values(map).sort((a, b) =>
      sortBy === 'revenue' ? b.revenue - a.revenue : b.quantity - a.quantity
    )
  }, [orders, menuItemMap, categories, lang, sortBy])

  const maxQty = items[0]?.quantity || 1
  const maxRev = items[0]?.revenue  || 1

  const s = {
    sortBy:   { uz: 'Saralash:',  ru: 'Сортировка:', en: 'Sort by:' },
    units:    { uz: 'Dona',       ru: 'Кол-во',      en: 'Units Sold' },
    revenue:  { uz: 'Daromad',    ru: 'Выручка',     en: 'Revenue' },
    product:  { uz: 'Mahsulot',   ru: 'Продукт',     en: 'Product' },
    category: { uz: 'Kategoriya', ru: 'Категория',   en: 'Category' },
    sold:     { uz: 'Sotilgan',   ru: 'Продано',     en: 'Sold' },
  }

  if (items.length === 0) return <EmptyState lang={lang} />

  return (
    <div>
      {/* Sort toggle */}
      <div className="flex items-center justify-end gap-2 mb-4">
        <span className="text-[12px] text-[#9CA3AF]">{s.sortBy[lang] || s.sortBy.en}</span>
        {['quantity', 'revenue'].map(k => (
          <button
            key={k}
            onClick={() => setSortBy(k)}
            className={`px-3 py-1 rounded-lg text-[12px] font-bold transition-all ${
              sortBy === k ? 'bg-[#ff5a00] text-white' : 'bg-gray-100 text-[#6B7280] hover:bg-gray-200'
            }`}
          >
            {k === 'quantity' ? (s.units[lang] || s.units.en) : (s.revenue[lang] || s.revenue.en)}
          </button>
        ))}
      </div>

      <div className="w-full overflow-x-auto rounded-2xl border border-[#E5E7EB] shadow-sm">
        <div className="bg-white rounded-2xl overflow-hidden min-w-[520px]">
        {/* Header */}
        <div className="hidden md:grid grid-cols-[32px_48px_1fr_120px_80px_110px] gap-3 px-5 py-3 bg-gray-50 border-b border-gray-100 text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">
          <span>#</span><span></span><span>{s.product[lang] || s.product.en}</span><span>{s.category[lang] || s.category.en}</span>
          <span className="text-center">{s.sold[lang] || s.sold.en}</span><span className="text-right">{s.revenue[lang] || s.revenue.en}</span>
        </div>

        {items.slice(0, 20).map((item, i) => (
          <div key={i} className="grid grid-cols-[32px_48px_1fr_120px_80px_110px] gap-3 px-5 py-3.5 items-center border-b border-[#F9FAFB] last:border-0">
            <span className={`w-7 h-7 rounded-full text-[11px] font-black flex items-center justify-center ${
              i === 0 ? 'bg-[#ff5a00] text-white' :
              i === 1 ? 'bg-orange-100 text-[#ff5a00]' :
              i === 2 ? 'bg-orange-50 text-orange-400' :
                        'bg-gray-100 text-gray-500'
            }`}>{i + 1}</span>

            <div className="w-12 h-12 rounded-xl overflow-hidden bg-orange-50 border border-gray-100 flex-shrink-0">
              {item.image ? (
                <img src={item.image} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <UtensilsCrossed size={14} className="text-orange-200" />
                </div>
              )}
            </div>

            <div className="min-w-0">
              <p className="font-semibold text-sm text-[#1F2937] truncate">{item.name}</p>
              <ProgressBar pct={sortBy === 'revenue'
                ? Math.round(item.revenue  / maxRev  * 100)
                : Math.round(item.quantity / maxQty * 100)} />
            </div>

            <span className="text-[12px] text-[#6B7280] truncate">{item.category}</span>
            <span className="text-center text-sm font-bold text-[#1F2937]">{item.quantity}</span>
            <span className="text-right font-bold text-sm text-[#ff5a00]">{formatCurrency(item.revenue)}</span>
          </div>
        ))}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 2 — SALES BY CATEGORY
// ─────────────────────────────────────────────────────────────────────────────

function ByCategoryTab({ orders, categories, menuItemMap, lang }) {
  const data = useMemo(() => {
    const map = {}
    let totalRev = 0
    orders.forEach(o => {
      getOrderItems(o).forEach(item => {
        const mi  = menuItemMap[item.menu_item_id]
        const cat = mi ? categories.find(c => c.id === mi.category_id) : null
        const key = cat?.id || '__uncategorized__'
        const lbl = cat ? getCategoryName(cat, lang) : 'Uncategorized'
        if (!map[key]) map[key] = { label: lbl, image: cat?.image_url || null, revenue: 0, qty: 0 }
        const rev = (Number(item.price) || 0) * (Number(item.quantity) || 1)
        map[key].revenue += rev
        map[key].qty     += Number(item.quantity) || 1
        totalRev         += rev
      })
    })
    return Object.values(map)
      .map(d => ({ ...d, pct: totalRev > 0 ? Math.round(d.revenue / totalRev * 100) : 0 }))
      .sort((a, b) => b.revenue - a.revenue)
  }, [orders, categories, menuItemMap, lang])

  if (data.length === 0) return <EmptyState lang={lang} />

  const maxRev = data[0]?.revenue || 1
  return (
    <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm overflow-hidden">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-4 border-b border-[#F9FAFB] last:border-0">
          <span className={`w-7 h-7 rounded-full text-[11px] font-black flex items-center justify-center flex-shrink-0 ${
            i === 0 ? 'bg-[#ff5a00] text-white' : i === 1 ? 'bg-orange-100 text-[#ff5a00]' : 'bg-gray-100 text-gray-500'
          }`}>{i + 1}</span>

          <div className="w-10 h-10 rounded-xl overflow-hidden bg-orange-50 border border-gray-100 flex-shrink-0">
            {d.image ? (
              <img src={d.image} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Tag size={12} className="text-orange-300" />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <p className="font-semibold text-sm text-[#1F2937]">{d.label}</p>
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-[#9CA3AF]">{d.qty} {lang === 'uz' ? 'dona' : lang === 'ru' ? 'шт.' : 'items'} · {d.pct}%</span>
                <span className="font-bold text-sm text-[#ff5a00]">{formatCurrency(d.revenue)}</span>
              </div>
            </div>
            <ProgressBar pct={Math.round(d.revenue / maxRev * 100)} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 3 — SALES BY HOUR
// ─────────────────────────────────────────────────────────────────────────────

function ByHourTab({ orders, lang }) {
  const { hours, peakIdx } = useMemo(() => {
    const hrs = Array.from({ length: 24 }, (_, h) => ({ hour: h, revenue: 0, count: 0 }))
    orders.forEach(o => {
      const d = getOrderDate(o)
      if (!d) return
      const h = new Date(d).getHours()   // local hour
      hrs[h].revenue += getOrderTotal(o)
      hrs[h].count   += 1
    })
    const active  = hrs.filter(h => h.count > 0)
    const peakIdx = hrs.reduce((best, h, i) => h.revenue > hrs[best].revenue ? i : best, 0)
    return { hours: hrs, peakIdx }
  }, [orders])

  const activeHours = hours.filter(h => h.count > 0)
  if (activeHours.length === 0) return <EmptyState lang={lang} />

  const maxRev = Math.max(...hours.map(h => h.revenue), 1)
  const peak   = hours[peakIdx]

  return (
    <div>
      {/* Peak summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        {[
          { label: lang === 'ru' ? 'Пиковый час' : lang === 'uz' ? 'Eng faol soat' : 'Peak Hour',
            value: `${String(peak.hour).padStart(2, '0')}:00` },
          { label: lang === 'ru' ? 'Доход за пиковый час' : lang === 'uz' ? 'Eng ko\'p daromad' : 'Peak Revenue',
            value: formatCurrency(peak.revenue) },
          { label: lang === 'ru' ? 'Заказов в пик' : lang === 'uz' ? 'Buyurtmalar' : 'Peak Orders',
            value: peak.count },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm p-4 text-center">
            <p className="text-[11px] text-[#9CA3AF] font-medium uppercase tracking-wide mb-1">{label}</p>
            <p className="text-xl font-black text-[#ff5a00]">{value}</p>
          </div>
        ))}
      </div>

      {/* Hourly bars */}
      <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm p-5">
        <div className="space-y-2">
          {activeHours.map(h => {
            const isPeak = h.hour === peakIdx
            const pct    = Math.round(h.revenue / maxRev * 100)
            return (
              <div key={h.hour} className="flex items-center gap-3">
                <span className="w-12 text-[12px] font-bold text-[#6B7280] flex-shrink-0 text-right">
                  {String(h.hour).padStart(2, '0')}:00
                </span>
                <div className="flex-1 h-7 bg-gray-100 rounded-lg overflow-hidden">
                  <div
                    className="h-full rounded-lg flex items-center px-2 transition-all"
                    style={{ width: `${Math.max(pct, 2)}%`, background: isPeak ? '#ff5a00' : '#FDBA74' }}
                  >
                    {pct > 15 && (
                      <span className="text-[10px] font-bold text-white truncate">{formatCurrency(h.revenue)}</span>
                    )}
                  </div>
                </div>
                <span className="text-[11px] text-[#9CA3AF] w-16 text-right flex-shrink-0">
                  {h.count} {lang === 'ru' ? 'зак.' : lang === 'uz' ? 'brt.' : 'orders'}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 4 — PAYMENT METHODS
// ─────────────────────────────────────────────────────────────────────────────

function PaymentMethodsTab({ orders, lang }) {
  const { data, totalRevenue } = useMemo(() => {
    const map = {}
    let total = 0
    orders.forEach(o => {
      const raw = getPaymentMethod(o)
      const key = (raw || '').toLowerCase()
      const m   = PAY_CFG[key] ? key : 'unknown'
      const rev = getOrderTotal(o)
      if (!map[m]) map[m] = { method: m, revenue: 0, count: 0 }
      map[m].revenue += rev
      map[m].count   += 1
      total          += rev
    })
    const rows = Object.values(map)
      .map(d => ({ ...d, pct: total > 0 ? Math.round(d.revenue / total * 100) : 0 }))
      .sort((a, b) => b.revenue - a.revenue)
    return { data: rows, totalRevenue: total }
  }, [orders])

  if (data.length === 0) return <EmptyState lang={lang} />

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {data.map(d => {
          const cfg   = PAY_CFG[d.method] || PAY_CFG.unknown
          const { Icon } = cfg
          return (
            <div key={d.method} className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className={`w-8 h-8 rounded-xl flex items-center justify-center ${cfg.cls}`}>
                  <Icon size={14} />
                </span>
                <span className="font-bold text-[13px] text-[#1F2937]">{cfg.label[lang] || cfg.label.en}</span>
              </div>
              <p className="font-black text-xl text-[#ff5a00]">{formatCurrency(d.revenue)}</p>
              <p className="text-[11px] text-[#9CA3AF] mt-0.5">{d.count} {lang === 'uz' ? 'ta' : lang === 'ru' ? 'зак.' : 'orders'} · {d.pct}%</p>
              <ProgressBar pct={d.pct} color={cfg.bar} />
            </div>
          )
        })}
      </div>

      {/* Detailed breakdown */}
      <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 bg-gray-50">
          <p className="text-[11px] font-bold text-[#9CA3AF] uppercase tracking-widest">{lang === 'uz' ? 'Tafsilot' : lang === 'ru' ? 'Детали' : 'Breakdown'}</p>
        </div>
        {data.map(d => {
          const cfg = PAY_CFG[d.method] || PAY_CFG.unknown
          const { Icon } = cfg
          return (
            <div key={d.method} className="flex items-center gap-4 px-5 py-4 border-b border-[#F9FAFB] last:border-0">
              <span className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${cfg.cls}`}>
                <Icon size={16} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between mb-1">
                  <p className="font-semibold text-sm text-[#1F2937]">{cfg.label[lang] || cfg.label.en}</p>
                  <p className="font-bold text-sm text-[#ff5a00]">{formatCurrency(d.revenue)}</p>
                </div>
                <ProgressBar pct={d.pct} color={cfg.bar} />
              </div>
              <div className="text-right flex-shrink-0 min-w-[60px]">
                <p className="text-[12px] font-bold text-[#1F2937]">{d.pct}%</p>
                <p className="text-[11px] text-[#9CA3AF]">{d.count} {lang === 'uz' ? 'ta' : lang === 'ru' ? 'зак.' : 'orders'}</p>
              </div>
            </div>
          )
        })}
        {/* Totals row */}
        <div className="flex items-center justify-between px-5 py-4 bg-gray-50 border-t border-gray-100">
          <span className="font-black text-sm text-[#1F2937]">
            {lang === 'uz' ? 'Jami' : lang === 'ru' ? 'Итого' : 'Total'}
          </span>
          <span className="font-black text-lg text-[#ff5a00]">{formatCurrency(totalRevenue)}</span>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 5 — WAITER PERFORMANCE
// ─────────────────────────────────────────────────────────────────────────────

function WaiterPerformanceTab({ orders, lang }) {
  const data = useMemo(() => {
    const map = {}
    orders.forEach(o => {
      const w = o.waiter_name || o.waiter_email || 'Unknown'
      if (!map[w]) map[w] = { name: w, revenue: 0, orders: 0, items: 0 }
      map[w].revenue += getOrderTotal(o)
      map[w].orders  += 1
      map[w].items   += getOrderItems(o).reduce((s, i) => s + (Number(i.quantity) || 1), 0)
    })
    return Object.values(map)
      .map(d => ({ ...d, avg: d.orders > 0 ? Math.round(d.revenue / d.orders) : 0 }))
      .sort((a, b) => b.revenue - a.revenue)
  }, [orders])

  if (data.length === 0) return <EmptyState lang={lang} />

  const maxRev = data[0]?.revenue || 1

  return (
    <div className="w-full overflow-x-auto rounded-2xl border border-[#E5E7EB] shadow-sm">
    <div className="bg-white rounded-2xl overflow-hidden min-w-[640px]">
      {/* Header */}
      <div className="hidden md:grid grid-cols-[32px_1fr_80px_140px_140px_80px] gap-4 px-5 py-3 bg-gray-50 border-b border-gray-100 text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">
        <span>#</span><span>{lang === 'uz' ? 'Ofitsiant' : lang === 'ru' ? 'Официант' : 'Waiter'}</span>
        <span className="text-center">{lang === 'uz' ? 'Brt.' : lang === 'ru' ? 'Зак.' : 'Orders'}</span>
        <span className="text-right">{lang === 'uz' ? 'Daromad' : lang === 'ru' ? 'Выручка' : 'Revenue'}</span>
        <span className="text-right">{lang === 'uz' ? "O'rtacha" : lang === 'ru' ? 'Ср. чек' : 'Avg Order'}</span>
        <span className="text-center">{lang === 'uz' ? 'Dona' : lang === 'ru' ? 'Блюд' : 'Items'}</span>
      </div>

      {data.map((d, i) => (
        <div key={d.name} className="px-5 py-4 border-b border-[#F9FAFB] last:border-0">
          {/* Desktop row */}
          <div className="hidden md:grid grid-cols-[32px_1fr_80px_140px_140px_80px] gap-4 items-center">
            <span className={`w-7 h-7 rounded-full text-[11px] font-black flex items-center justify-center ${
              i === 0 ? 'bg-[#ff5a00] text-white' : i === 1 ? 'bg-orange-100 text-[#ff5a00]' : 'bg-gray-100 text-gray-500'
            }`}>{i + 1}</span>

            <div className="min-w-0">
              <div className="flex items-center gap-2.5 mb-1">
                <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-[#ff5a00] text-[11px] font-black">
                    {(d.name[0] || '?').toUpperCase()}
                  </span>
                </div>
                <p className="font-semibold text-sm text-[#1F2937] truncate">{d.name}</p>
              </div>
              <ProgressBar pct={Math.round(d.revenue / maxRev * 100)} />
            </div>

            <span className="text-center text-sm font-bold text-[#1F2937]">{d.orders}</span>
            <span className="text-right font-bold text-sm text-[#ff5a00]">{formatCurrency(d.revenue)}</span>
            <span className="text-right text-sm text-[#6B7280]">{formatCurrency(d.avg)}</span>
            <span className="text-center text-sm text-[#6B7280]">{d.items}</span>
          </div>

          {/* Mobile card */}
          <div className="md:hidden">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className={`w-6 h-6 rounded-full text-[10px] font-black flex items-center justify-center ${
                  i === 0 ? 'bg-[#ff5a00] text-white' : 'bg-gray-100 text-gray-500'
                }`}>{i + 1}</span>
                <p className="font-bold text-[14px] text-[#1F2937]">{d.name}</p>
              </div>
              <p className="font-black text-[#ff5a00]">{formatCurrency(d.revenue)}</p>
            </div>
            <div className="flex gap-4 text-[12px] text-[#6B7280]">
              <span>{d.orders} {lang === 'uz' ? 'brt.' : lang === 'ru' ? 'зак.' : 'orders'}</span>
              <span>{lang === 'uz' ? "o'rt." : lang === 'ru' ? 'ср.' : 'avg'} {formatCurrency(d.avg)}</span>
              <span>{d.items} {lang === 'uz' ? 'dona' : lang === 'ru' ? 'шт.' : 'items'}</span>
            </div>
            <ProgressBar pct={Math.round(d.revenue / maxRev * 100)} />
          </div>
        </div>
      ))}
    </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 6 — ORDER HISTORY
// ─────────────────────────────────────────────────────────────────────────────

function OrderDrawer({ order, menuItemMap, onClose, navigate, lang, serviceRatePct }) {
  const [fetchedItems, setFetchedItems] = useState(null)

  useEffect(() => {
    if (!order) return
    setFetchedItems(null)
    const ids = order._mergedIds?.length ? order._mergedIds : [order.id]
    supabase
      .from('order_items')
      .select('*')
      .in('order_id', ids)
      .then(({ data }) => { if (data?.length) setFetchedItems(data) })
  }, [order?.id])

  if (!order) return null

  const items    = fetchedItems || getOrderItems(order)
  const payment = getOrderPaymentSummary(order, items, serviceRatePct)
  const subtotal = payment.subtotal
  const discPct = payment.discountPercent
  const discAmt = payment.discountAmount
  const servicePct = payment.serviceRatePct
  const serviceAmt = payment.serviceFee
  const total = payment.total
  const received   = order.amount_received || 0
  const change     = order.change_amount   || (received > 0 ? Math.max(0, received - total) : 0)
  const orderNum   = order.id ? `#${String(order.id).slice(-4).toUpperCase()}` : '—'
  const sessionCnt = order._orderCount || 1

  return (
    <div className="flex flex-col h-full">
      {/* Drawer header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E7EB] flex-shrink-0 bg-white">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="font-black text-[#1F2937] text-base flex items-center gap-1.5">
            {lang === 'uz' ? 'Buyurtma' : lang === 'ru' ? 'Заказ' : 'Order'} {orderNum}
            {sessionCnt > 1 && (
              <span className="text-[10px] font-black bg-orange-100 text-[#ff5a00] rounded-md px-1.5 py-0.5 leading-none">
                {sessionCnt} {lang === 'uz' ? 'tur' : lang === 'ru' ? 'раунд' : 'rounds'}
              </span>
            )}
          </span>
          <StatusBadge status={order.payment_status || (isPaidOrder(order) ? 'paid' : 'unpaid')} lang={lang} />
        </div>
        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-100 text-[#6B7280]">
          <X size={16} />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

        {/* Order meta */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: lang === 'uz' ? 'Stol'      : lang === 'ru' ? 'Стол'      : 'Table',    value: order.table_name || '—' },
            { label: lang === 'uz' ? 'Ofitsiant' : lang === 'ru' ? 'Официант'  : 'Waiter',   value: order.waiter_name || '—' },
            { label: lang === 'uz' ? "To'lov"    : lang === 'ru' ? 'Оплата'    : 'Payment',  value: <PayBadge method={order.payment_method} lang={lang} /> },
            { label: lang === 'uz' ? 'Yaratildi' : lang === 'ru' ? 'Создан'    : 'Created',  value: fmtDate(order.created_at) },
            { label: lang === 'uz' ? "To'landi"  : lang === 'ru' ? 'Оплачен'   : 'Paid At',  value: fmtDate(order.paid_at) },
            { label: lang === 'uz' ? 'Holat'     : lang === 'ru' ? 'Статус'    : 'Status',   value: <StatusBadge status={order.payment_status || (isPaidOrder(order) ? 'paid' : 'unpaid')} lang={lang} /> },
          ].map(({ label, value }) => (
            <div key={label} className="bg-gray-50 rounded-xl p-3">
              <p className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wide mb-1">{label}</p>
              <div className="text-sm font-semibold text-[#1F2937]">{value}</div>
            </div>
          ))}
        </div>

        {/* Items */}
        <div>
          <p className="text-xs font-bold text-[#9CA3AF] uppercase tracking-widest mb-3">
            {lang === 'uz' ? 'Buyurtma qilingan' : lang === 'ru' ? 'Заказанные блюда' : 'Ordered Items'} ({items.length})
          </p>
          <div className="space-y-3">
            {items.map((item, i) => {
              const mi = menuItemMap[item.menu_item_id]
              return (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-xl overflow-hidden bg-orange-50 border border-gray-100 flex-shrink-0">
                    {(item.image_url || mi?.image_url) ? (
                      <img src={item.image_url || mi.image_url} alt={item.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <UtensilsCrossed size={14} className="text-orange-200" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-[#1F2937] truncate">{item.name || mi?.name_en || 'Item'}</p>
                    {item.notes && <p className="text-[11px] text-[#9CA3AF]">{item.notes}</p>}
                    <p className="text-[11px] text-[#6B7280] mt-0.5">
                      {lang === 'uz' ? 'Dona' : lang === 'ru' ? 'Кол' : 'Qty'} {item.quantity} × {formatCurrency(item.price || 0)}
                    </p>
                  </div>
                  <p className="font-bold text-sm text-[#1F2937] flex-shrink-0">
                    {formatCurrency((Number(item.price) || 0) * (Number(item.quantity) || 1))}
                  </p>
                </div>
              )
            })}
          </div>
        </div>

        {/* Payment summary */}
        <div>
          <p className="text-xs font-bold text-[#9CA3AF] uppercase tracking-widest mb-3">{lang === 'uz' ? "To'lov xulosasi" : lang === 'ru' ? 'Итог оплаты' : 'Payment Summary'}</p>
          <div className="bg-gray-50 rounded-2xl p-4 space-y-2.5">
            <SummaryRow label={lang === 'uz' ? 'Jami' : lang === 'ru' ? 'Подитог' : 'Subtotal'}                                      value={formatCurrency(subtotal)}   />
            {discAmt > 0 && (
              <SummaryRow label={`${lang === 'uz' ? 'Chegirma' : lang === 'ru' ? 'Скидка' : 'Discount'} (${discPct}%)`}              value={`− ${formatCurrency(discAmt)}`} valueClass="text-green-600" />
            )}
            <SummaryRow label={`${lang === 'uz' ? 'Xizmat' : lang === 'ru' ? 'Сервис' : 'Service'} (${servicePct}%)`}               value={formatCurrency(serviceAmt)} />
            <div className="border-t border-dashed border-gray-200 pt-2.5">
              <SummaryRow label={lang === 'uz' ? "To'lash kerak" : lang === 'ru' ? 'К оплате' : 'Total to Pay'}                      value={formatCurrency(total)} bold />
            </div>
            {received > 0 && <SummaryRow label={lang === 'uz' ? 'Qabul qilindi' : lang === 'ru' ? 'Получено' : 'Amount Received'}    value={formatCurrency(received)} />}
            {received > 0 && <SummaryRow label={lang === 'uz' ? 'Qaytim' : lang === 'ru' ? 'Сдача' : 'Change'}                       value={formatCurrency(change)} valueClass="text-green-600" />}
          </div>
        </div>
      </div>

      {/* Footer actions */}
      <div className="flex-shrink-0 px-5 py-4 border-t border-[#E5E7EB] bg-white grid grid-cols-2 gap-2">
        <button
          onClick={() => navigate(`/receipt/${order.id}`)}
          className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-[#E5E7EB] text-[12px] font-bold text-[#6B7280] hover:border-[#ff5a00] hover:text-[#ff5a00] hover:bg-orange-50 transition-colors"
        >
          <Eye size={14} />
          {lang === 'uz' ? 'Chek' : lang === 'ru' ? 'Чек' : 'View Check'}
        </button>
        <button
          onClick={() => { navigate(`/receipt/${order.id}`); setTimeout(() => window.print(), 800) }}
          className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-[#E5E7EB] text-[12px] font-bold text-[#6B7280] hover:border-[#ff5a00] hover:text-[#ff5a00] hover:bg-orange-50 transition-colors"
        >
          <Printer size={14} />
          {lang === 'uz' ? 'Bosish' : lang === 'ru' ? 'Печать' : 'Print'}
        </button>
      </div>
    </div>
  )
}

function OrderHistoryTab({ orders, allOrders, menuItemMap, lang, navigate, selectedOrder, onSelect }) {
  const [page,      setPage]      = useState(1)
  const [search,    setSearch]    = useState('')
  const [filterPay, setFilterPay] = useState('all')

  // Apply in-tab filters on top of the already date/table/waiter filtered orders
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return allOrders.filter(o => {
      const matchPay = filterPay === 'all' || (getPaymentMethod(o) || '').toLowerCase() === filterPay
      const matchQ   = !q ||
        (o.id          && String(o.id).toLowerCase().includes(q)) ||
        (o.table_name  && o.table_name.toLowerCase().includes(q)) ||
        (o.waiter_name && o.waiter_name.toLowerCase().includes(q)) ||
        getOrderItems(o).some(i => (i.name || '').toLowerCase().includes(q))
      return matchPay && matchQ
    })
  }, [allOrders, search, filterPay])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const pageOrders = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  function resetPage() { setPage(1) }

  return (
    <div>
      {/* In-tab filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
          <input
            type="text" value={search}
            onChange={e => { setSearch(e.target.value); resetPage() }}
            placeholder={lang === 'uz' ? 'Buyurtma, stol, ofitsiant...' : lang === 'ru' ? 'Заказ, стол, официант...' : 'Search by order, table, waiter...'}
            className="w-full pl-8 pr-3 py-2 bg-white border border-[#E5E7EB] rounded-xl text-sm placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#ff5a00]/20 focus:border-[#ff5a00] transition-all"
          />
        </div>
        <select value={filterPay} onChange={e => { setFilterPay(e.target.value); resetPage() }}
          className="bg-white border border-[#E5E7EB] rounded-xl px-3 py-2 text-sm text-[#6B7280] focus:outline-none cursor-pointer">
          <option value="all">{lang === 'uz' ? "Barcha to'lovlar" : lang === 'ru' ? 'Все методы' : 'All Payments'}</option>
          <option value="cash">{lang === 'uz' ? 'Naqd' : lang === 'ru' ? 'Наличные' : 'Cash'}</option>
          <option value="card">{lang === 'uz' ? 'Karta' : lang === 'ru' ? 'Карта' : 'Card'}</option>
          <option value="terminal">Terminal</option>
          <option value="qr">{lang === 'uz' ? 'QR Kod' : lang === 'ru' ? 'QR Код' : 'QR Code'}</option>
        </select>
      </div>

      {pageOrders.length === 0 ? (
        <EmptyState label={lang === 'uz' ? 'Buyurtmalar topilmadi' : lang === 'ru' ? 'Заказы не найдены' : 'No orders found'} lang={lang} />
      ) : (
        <div className="w-full overflow-x-auto rounded-2xl border border-[#E5E7EB] shadow-sm">
        <div className="bg-white rounded-2xl overflow-hidden min-w-[1050px]">
          {/* Desktop header */}
          <div className="hidden lg:grid grid-cols-[80px_90px_130px_150px_90px_110px_60px_60px_110px_100px] gap-2 px-4 py-3 bg-gray-50 border-b border-gray-100 text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">
            <span>{lang === 'uz' ? 'Buyurtma' : lang === 'ru' ? 'Заказ' : 'Order ID'}</span>
            <span>{lang === 'uz' ? 'Stol' : lang === 'ru' ? 'Стол' : 'Table'}</span>
            <span>{lang === 'uz' ? 'Ofitsiant' : lang === 'ru' ? 'Официант' : 'Waiter'}</span>
            <span>{lang === 'uz' ? 'Sana va vaqt' : lang === 'ru' ? 'Дата и время' : 'Date & Time'}</span>
            <span>{lang === 'uz' ? 'Holat' : lang === 'ru' ? 'Статус' : 'Status'}</span>
            <span>{lang === 'uz' ? "To'lov" : lang === 'ru' ? 'Оплата' : 'Payment'}</span>
            <span className="text-center">{lang === 'uz' ? 'Chegirma' : lang === 'ru' ? 'Скидка' : 'Disc%'}</span>
            <span className="text-center">{lang === 'uz' ? 'Xizmat' : lang === 'ru' ? 'Серв.' : 'Serv%'}</span>
            <span className="text-right">{lang === 'uz' ? 'Jami' : lang === 'ru' ? 'Итого' : 'Total'}</span>
            <span className="text-center">{lang === 'uz' ? 'Amal' : lang === 'ru' ? 'Действие' : 'Action'}</span>
          </div>

          <div className="divide-y divide-[#F9FAFB]">
            {pageOrders.map(order => {
              const orderNum    = order.id ? `#${String(order.id).slice(-4).toUpperCase()}` : '—'
              const sessionCnt  = order._orderCount || 1
              const discPct     = order.loyalty_discount_pct || order.discount_percent || 0
              const servicePct  = getOrderPaymentSummary(order, getOrderItems(order), 20).serviceRatePct
              const status      = order.payment_status || (isPaidOrder(order) ? 'paid' : 'unpaid')
              const isSelected  = selectedOrder?.id === order.id
              return (
                <div
                  key={order.id || orderNum}
                  onClick={() => onSelect(isSelected ? null : order)}
                  className={`px-4 py-3 transition-colors cursor-pointer ${isSelected ? 'bg-orange-50/60' : 'hover:bg-gray-50/60'}`}
                >
                  {/* Desktop row */}
                  <div className="hidden lg:grid grid-cols-[80px_90px_130px_150px_90px_110px_60px_60px_110px_100px] gap-2 items-center">
                    <span className="font-black text-[#ff5a00] text-sm flex items-center gap-1">
                      {orderNum}
                      {sessionCnt > 1 && (
                        <span className="text-[9px] font-black bg-orange-100 text-[#ff5a00] rounded px-1 py-0.5 leading-none">+{sessionCnt - 1}</span>
                      )}
                    </span>
                    <span className="text-sm font-medium text-[#1F2937] truncate">{order.table_name || '—'}</span>
                    <span className="text-sm text-[#6B7280] truncate">{(order.waiter_name || '—').split(' ')[0]}</span>
                    <span className="text-[12px] text-[#6B7280]">{fmtDate(getOrderDate(order))}</span>
                    <span><StatusBadge status={status} lang={lang} /></span>
                    <span><PayBadge method={order.payment_method} lang={lang} /></span>
                    <span className="text-center text-sm text-[#6B7280]">{discPct}%</span>
                    <span className="text-center text-sm text-[#6B7280]">{servicePct}%</span>
                    <span className="text-right font-black text-sm text-[#ff5a00]">{formatCurrency(getOrderTotal(order))}</span>
                    <div className="flex justify-center">
                      <button
                        onClick={e => { e.stopPropagation(); onSelect(isSelected ? null : order) }}
                        className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-bold transition-colors ${
                          isSelected
                            ? 'border-[#ff5a00] text-[#ff5a00] bg-orange-50'
                            : 'border-[#E5E7EB] text-[#6B7280] hover:border-[#ff5a00] hover:text-[#ff5a00] hover:bg-orange-50'
                        }`}
                      >
                        {isSelected ? (lang === 'uz' ? 'Yopish' : lang === 'ru' ? 'Закрыть' : 'Close') : (lang === 'uz' ? 'Batafsil' : lang === 'ru' ? 'Детали' : 'Details')}
                      </button>
                    </div>
                  </div>

                  {/* Mobile card */}
                  <div className="lg:hidden flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-black text-[#ff5a00] text-sm">{orderNum}</span>
                        <StatusBadge status={status} lang={lang} />
                      </div>
                      <p className="text-sm font-medium text-[#1F2937]">{order.table_name} · {(order.waiter_name || '').split(' ')[0]}</p>
                      <p className="text-[11px] text-[#9CA3AF] mt-0.5">{fmtDate(getOrderDate(order))}</p>
                      <div className="mt-1.5"><PayBadge method={order.payment_method} lang={lang} /></div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <span className="font-black text-[#ff5a00] text-base">{formatCurrency(getOrderTotal(order))}</span>
                      <button className="px-2.5 py-1 rounded-xl border border-[#E5E7EB] text-[11px] font-bold text-[#6B7280]">{lang === 'uz' ? 'Batafsil' : lang === 'ru' ? 'Детали' : 'Details'}</button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-t border-gray-100">
            <p className="text-xs text-[#9CA3AF]">
              {filtered.length === 0
                ? (lang === 'uz' ? "Buyurtma yo'q" : lang === 'ru' ? 'Нет заказов' : 'No orders')
                : `${lang === 'uz' ? "Ko'rsatilmoqda" : lang === 'ru' ? 'Показано' : 'Showing'} ${Math.min((page - 1) * PAGE_SIZE + 1, filtered.length)}–${Math.min(page * PAGE_SIZE, filtered.length)} ${lang === 'uz' ? 'dan' : lang === 'ru' ? 'из' : 'of'} ${filtered.length} ${lang === 'uz' ? 'ta buyurtma' : lang === 'ru' ? 'заказов' : 'orders'}`
              }
            </p>
            <div className="flex items-center gap-1">
              <PageBtn disabled={page <= 1}           onClick={() => setPage(p => p - 1)}><ChevronLeft  size={14} /></PageBtn>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                const n = totalPages <= 5 ? i + 1 : page <= 3 ? i + 1 : page >= totalPages - 2 ? totalPages - 4 + i : page - 2 + i
                return <PageBtn key={n} active={n === page} onClick={() => setPage(n)}>{n}</PageBtn>
              })}
              <PageBtn disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight size={14} /></PageBtn>
            </div>
          </div>
        </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────

export default function Reports() {
  const { state }    = useApp()
  const navigate     = useNavigate()
  const lang         = state.lang
  const serviceRatePct = Math.max(0, Math.min(100, Number(state.settings?.serviceRate) || 20))

  const [activeTab,     setActiveTab]     = useState('order_history')
  const [dateFrom, setDateFrom] = useState(todayStr())
  const [dateTo,   setDateTo]   = useState(todayStr())
  const [tableFilter,   setTableFilter]   = useState('all')
  const [waiterFilter,  setWaiterFilter]  = useState('all')
  const [selectedOrder, setSelectedOrder] = useState(null)

  // ── Lookups ────────────────────────────────────────────────────────────────

  const menuItemMap = useMemo(() => {
    const m = {}
    state.menuItems.forEach(mi => { m[mi.id] = mi })
    return m
  }, [state.menuItems])

  const uniqueWaiters = useMemo(() => {
    const s = new Set(state.orders.map(o => o.waiter_name).filter(Boolean))
    return [...s]
  }, [state.orders])

  // ── Base date-filtered order sets ─────────────────────────────────────────
  //
  // Grouping is applied once here. Both KPI cards and all tabs read from
  // these two lists so they are always in sync.

  const allDateFiltered = useMemo(() => {
    return groupOrdersBySession([...state.orders])
      .filter(o => {
        const matchDate   = matchesRange(o, dateFrom, dateTo)
        const matchTable  = tableFilter  === 'all' || o.table_id === tableFilter
        const matchWaiter = waiterFilter === 'all' || o.waiter_name === waiterFilter
        return matchDate && matchTable && matchWaiter
      })
      .sort((a, b) => new Date(getOrderDate(b) || 0) - new Date(getOrderDate(a) || 0))
  }, [state.orders, dateFrom, dateTo, tableFilter, waiterFilter])

  // Paid subset — used for KPI cards and all analytics tabs
  const filteredForAnalytics = useMemo(() =>
    allDateFiltered.filter(isPaidOrder),
    [allDateFiltered]
  )

  // ── KPI ───────────────────────────────────────────────────────────────────

  const kpiRevenue   = filteredForAnalytics.reduce((s, o) => s + getOrderTotal(o), 0)
  const kpiOrders    = filteredForAnalytics.length
  const kpiAvg       = kpiOrders > 0 ? Math.round(kpiRevenue / kpiOrders) : 0
  const kpiItemsSold = filteredForAnalytics.reduce(
    (s, o) => s + getOrderItems(o).reduce((a, i) => a + (Number(i.quantity) || 1), 0), 0
  )

  const showDrawer = !!selectedOrder

  const L = {
    uz: { title: 'Hisobotlar', sub: 'Savdo ko\'rsatkichlari va tahlil', totalRev: 'Jami daromad', numOrders: 'Buyurtmalar', avgOrder: 'O\'rtacha buyurtma', itemsSold: 'Sotilgan', allTables: 'Barcha stollar', allWaiters: 'Barcha ofitsiantlar', export: 'Eksport', today: 'Bugun', yesterday: 'Kecha', week: '7 kun', month: 'Oy', from: 'Dan', to: 'Gacha' },
    ru: { title: 'Отчёты',     sub: 'Обзор продаж и аналитика',         totalRev: 'Общая выручка',  numOrders: 'Заказов',     avgOrder: 'Средний чек',      itemsSold: 'Продано',   allTables: 'Все столы',         allWaiters: 'Все официанты',       export: 'Экспорт', today: 'Сегодня', yesterday: 'Вчера', week: '7 дней', month: 'Месяц', from: 'С', to: 'По' },
    en: { title: 'Reports',    sub: 'Sales overview and analytics',      totalRev: 'Total Revenue',  numOrders: 'Orders',      avgOrder: 'Avg Order Value',  itemsSold: 'Items Sold',allTables: 'All Tables',        allWaiters: 'All Waiters',         export: 'Export',  today: 'Today', yesterday: 'Yesterday', week: '7 Days', month: 'Month', from: 'From', to: 'To' },
  }
  const l = L[lang] || L.en

  return (
    <AppShell title={l.title}>
      <div className="flex h-full overflow-hidden bg-[#FAF7F0]">

        {/* ── Main content ── */}
        <div className={`flex-1 min-w-0 overflow-y-auto transition-all ${showDrawer ? 'lg:mr-[380px]' : ''}`}>
          <div className="max-w-[1200px] mx-auto px-5 py-6">

            {/* Heading + filters */}
            <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
              <div>
                <h1 className="text-2xl font-black text-[#1F2937]">{l.title}</h1>
                <p className="text-sm text-[#6B7280] mt-0.5">{l.sub}</p>
              </div>
              <div className="flex flex-col gap-2 w-full sm:w-auto">
                {/* Preset quick buttons */}
                <div className="flex gap-1.5 flex-wrap">
                  {[
                    { key: 'today',     label: l.today     },
                    { key: 'yesterday', label: l.yesterday },
                    { key: 'week',      label: l.week      },
                    { key: 'month',     label: l.month     },
                  ].map(({ key, label }) => {
                    const today = todayStr()
                    const isActive = (() => {
                      if (key === 'today')     return dateFrom === today && dateTo === today
                      if (key === 'yesterday') { const y = addDays(today, -1); return dateFrom === y && dateTo === y }
                      if (key === 'week')      return dateFrom === addDays(today, -6) && dateTo === today
                      if (key === 'month')     { const m = today.slice(0, 8) + '01'; return dateFrom === m && dateTo === today }
                      return false
                    })()
                    return (
                      <button
                        key={key}
                        onClick={() => {
                          const today = todayStr()
                          if (key === 'today')     { setDateFrom(today); setDateTo(today) }
                          if (key === 'yesterday') { const y = addDays(today, -1); setDateFrom(y); setDateTo(y) }
                          if (key === 'week')      { setDateFrom(addDays(today, -6)); setDateTo(today) }
                          if (key === 'month')     { setDateFrom(today.slice(0, 8) + '01'); setDateTo(today) }
                        }}
                        className={`px-3 py-1.5 rounded-xl text-[12px] font-bold transition-all border ${
                          isActive
                            ? 'bg-[#ff5a00] text-white border-[#ff5a00] shadow-sm'
                            : 'bg-white text-[#6B7280] border-[#E5E7EB] hover:border-orange-300 hover:text-[#ff5a00]'
                        }`}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
                {/* Date range inputs + other filters */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5 bg-white border border-[#E5E7EB] rounded-xl px-3 py-2 shadow-sm">
                    <span className="text-[11px] text-[#9CA3AF] font-semibold">{l.from}</span>
                    <input type="date" value={dateFrom}
                      onChange={e => setDateFrom(e.target.value)}
                      className="text-sm focus:outline-none cursor-pointer bg-transparent"
                    />
                    <span className="text-[11px] text-[#9CA3AF] font-semibold mx-1">—</span>
                    <span className="text-[11px] text-[#9CA3AF] font-semibold">{l.to}</span>
                    <input type="date" value={dateTo}
                      onChange={e => setDateTo(e.target.value)}
                      className="text-sm focus:outline-none cursor-pointer bg-transparent"
                    />
                  </div>
                  <select value={tableFilter} onChange={e => setTableFilter(e.target.value)}
                    className="bg-white border border-[#E5E7EB] rounded-xl px-3 py-2 text-sm text-[#6B7280] focus:outline-none shadow-sm cursor-pointer">
                    <option value="all">{l.allTables}</option>
                    {state.tables.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <select value={waiterFilter} onChange={e => setWaiterFilter(e.target.value)}
                    className="bg-white border border-[#E5E7EB] rounded-xl px-3 py-2 text-sm text-[#6B7280] focus:outline-none shadow-sm cursor-pointer">
                    <option value="all">{l.allWaiters}</option>
                    {uniqueWaiters.map(w => <option key={w} value={w}>{w}</option>)}
                  </select>
                  <button className="flex items-center gap-1.5 px-4 py-2 bg-white border border-[#E5E7EB] rounded-xl text-sm font-semibold text-[#6B7280] hover:bg-gray-50 shadow-sm">
                    <Download size={14} />{l.export}
                  </button>
                </div>
              </div>
            </div>

            {/* KPI cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <KpiCard icon={DollarSign}  iconCls="bg-green-50 text-green-600"   label={l.totalRev}  value={formatCurrency(kpiRevenue)} sub={`${kpiOrders} ${lang === 'uz' ? "ta to'langan" : lang === 'ru' ? 'оплаченных' : 'paid orders'}`} />
              <KpiCard icon={ShoppingBag} iconCls="bg-orange-50 text-[#ff5a00]"  label={l.numOrders} value={kpiOrders} />
              <KpiCard icon={BarChart2}   iconCls="bg-blue-50 text-blue-600"     label={l.avgOrder}  value={formatCurrency(kpiAvg)} />
              <KpiCard icon={Package}     iconCls="bg-purple-50 text-purple-600" label={l.itemsSold} value={kpiItemsSold} />
            </div>

            {/* Tab bar — scrolls horizontally when tabs don't fit */}
            <div className="flex gap-0 border-b border-[#E5E7EB] mb-5 overflow-x-auto scrollbar-none">
              {TABS.map(({ key, label, Icon }) => (
                <button key={key} onClick={() => setActiveTab(key)}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-3 text-sm font-bold transition-all border-b-2 whitespace-nowrap ${
                    activeTab === key
                      ? 'text-[#ff5a00] border-[#ff5a00]'
                      : 'text-[#6B7280] border-transparent hover:text-[#1F2937]'
                  }`}
                >
                  <Icon size={14} />
                  {label[lang] || label.en}
                </button>
              ))}
            </div>

            {/* Tab content — all use filteredForAnalytics (same as KPI) */}
            {activeTab === 'best_selling'       && (
              <BestSellingTab orders={filteredForAnalytics} menuItemMap={menuItemMap} categories={state.categories} lang={lang} />
            )}
            {activeTab === 'by_category'        && (
              <ByCategoryTab  orders={filteredForAnalytics} categories={state.categories} menuItemMap={menuItemMap} lang={lang} />
            )}
            {activeTab === 'by_hour'            && (
              <ByHourTab      orders={filteredForAnalytics} lang={lang} />
            )}
            {activeTab === 'payment_methods'    && (
              <PaymentMethodsTab orders={filteredForAnalytics} lang={lang} />
            )}
            {activeTab === 'waiter_performance' && (
              <WaiterPerformanceTab orders={filteredForAnalytics} lang={lang} />
            )}
            {activeTab === 'order_history'      && (
              <OrderHistoryTab
                orders={filteredForAnalytics}
                allOrders={filteredForAnalytics}
                menuItemMap={menuItemMap}
                lang={lang}
                navigate={navigate}
                selectedOrder={selectedOrder}
                onSelect={setSelectedOrder}
              />
            )}

          </div>
        </div>

        {/* ── Right drawer ── */}
        {showDrawer && (
          <>
            <div className="lg:hidden fixed inset-0 bg-black/40 z-30" onClick={() => setSelectedOrder(null)} />
            <div className="fixed top-0 right-0 h-full w-full sm:w-[400px] lg:w-[380px] bg-white border-l border-[#E5E7EB] shadow-2xl z-40 flex flex-col overflow-hidden">
              <OrderDrawer
                order={selectedOrder}
                menuItemMap={menuItemMap}
                onClose={() => setSelectedOrder(null)}
                navigate={navigate}
                lang={lang}
                serviceRatePct={serviceRatePct}
              />
            </div>
          </>
        )}
      </div>
    </AppShell>
  )
}
