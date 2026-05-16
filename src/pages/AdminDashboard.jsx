import React, { useMemo, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  TrendingUp, ShoppingBag, DollarSign, Package, Receipt,
  Clock, ArrowUpRight, ArrowDownRight, Users, Loader2,
  Printer, ChevronRight, CreditCard,
} from 'lucide-react'
import { useApp } from '../store/AppContext'
import { useAuth } from '../contexts/AuthContext'
import { getAllProfiles } from '../lib/supabase'
import { formatCurrency } from '../lib/formatCurrency'
import {
  getOrderDate,
  getOrderItems,
  getOrderTotal,
  groupOrdersBySession,
  isPaidOrder,
  toLocalDateStr,
} from '../lib/analytics'
import AppShell from '../components/AppShell'

// ── Localisation ──────────────────────────────────────────────────────────────
const L = {
  uz: {
    greeting:       n => `Xush kelibsiz, ${n}! 👋`,
    subtitle:       "Bugun Zar Kebab'da nima bo'layotganini ko'rishingiz mumkin.",
    todayRevenue:   'Bugungi daromad',
    ordersToday:    'Bugungi buyurtmalar',
    avgOrder:       "O'rtacha buyurtma",
    itemsSold:      'Sotilgan taomlar',
    activeBills:    'Faol hisoblar',
    needAttention:  'DIQQAT TALAB QILADI',
    yesterday:      'Kecha',
    vsYesterday:    'kechaga nisbatan',
    revenueStats:   'Daromad statistikasi',
    today:          'Bugun',
    days7:          '7 kun',
    thisMonth:      'Bu oy',
    thisYear:       'Bu yil',
    prevPeriod:     'Oldingi davr',
    thisPeriod:     'Bu davr',
    growth:         'O\'sish',
    paymentMethods: "To'lov usullari",
    cash:           'Naqd',
    card:           'Karta',
    terminal:       'Terminal',
    qr:             'QR Kod',
    unknown:        "Noma'lum",
    salesByCategory:'Kategoriya bo\'yicha savdo',
    bestSelling:    "Eng ko'p sotilgan taomlar",
    noSales:        "Savdo ma'lumotlari yo'q",
    staffPerf:      'Xodimlar faolligi',
    noStaff:        "Xodimlar ma'lumoti yo'q",
    recentOrders:   "So'nggi buyurtmalar",
    recentOrdersSub:'Hisoblarni tez chop eting va to‘langan buyurtmalarni ko‘ring',
    needBillCount:  n => `${n} hisob kerak`,
    needsBillSection:'HISOB KERAK',
    paidSection:    "TO'LANGAN",
    printBill:      'Chop etish',
    view:           "Ko'rish",
    noOrders:       "Buyurtma yo'q",
    table:          'Stol',
    pcs:            'ta',
    orders:         'buyurtma',
    revenue:        'Daromad',
    avgOrderShort:  "O'rtacha",
    items:          'taom',
    paid:           "To'langan",
    new:            'Yangi',
    preparing:      'Tayyorlanmoqda',
    needsBill:      'Hisob kerak',
    ready:          'Tayyor',
    cancelled:      'Bekor',
    active:         'Faol',
    total:          'Jami',
    footer:         'Barcha ma\'lumotlar to\'langan buyurtmalarga asoslangan',
    loading:        'Yuklanmoqda...',
    noData:         "Ma'lumot yo'q",
  },
  ru: {
    greeting:       n => `Добро пожаловать, ${n}! 👋`,
    subtitle:       'Вот что сегодня происходит в Zar Kebab.',
    todayRevenue:   'Доход сегодня',
    ordersToday:    'Заказы сегодня',
    avgOrder:       'Средний заказ',
    itemsSold:      'Продано блюд',
    activeBills:    'Активные счета',
    needAttention:  'ТРЕБУЕТ ВНИМАНИЯ',
    yesterday:      'Вчера',
    vsYesterday:    'vs вчера',
    revenueStats:   'Статистика дохода',
    today:          'Сегодня',
    days7:          '7 дней',
    thisMonth:      'Этот месяц',
    thisYear:       'Этот год',
    prevPeriod:     'Предыдущий период',
    thisPeriod:     'Этот период',
    growth:         'Рост',
    paymentMethods: 'Способы оплаты',
    cash:           'Наличные',
    card:           'Карта',
    terminal:       'Терминал',
    qr:             'QR Код',
    unknown:        'Неизвестно',
    salesByCategory:'Продажи по категориям',
    bestSelling:    'Самые продаваемые',
    noSales:        'Данных о продажах нет',
    staffPerf:      'Активность персонала',
    noStaff:        'Данных о персонале нет',
    recentOrders:   'Последние заказы',
    recentOrdersSub:'Быстро печатайте счета и проверяйте оплаченные заказы',
    needBillCount:  n => `${n} требуют счёт`,
    needsBillSection:'НУЖЕН СЧЁТ',
    paidSection:    'ОПЛАЧЕНЫ',
    printBill:      'Печать счёта',
    view:           'Открыть',
    noOrders:       'Нет заказов',
    table:          'Стол',
    pcs:            'шт',
    orders:         'заказов',
    revenue:        'Доход',
    avgOrderShort:  'Средний',
    items:          'блюд',
    paid:           'Оплачен',
    new:            'Новый',
    preparing:      'Готовится',
    needsBill:      'Нужен счёт',
    ready:          'Готово',
    cancelled:      'Отменён',
    active:         'Активен',
    total:          'Всего',
    footer:         'Все данные основаны на оплаченных заказах',
    loading:        'Загрузка...',
    noData:         'Нет данных',
  },
  en: {
    greeting:       n => `Welcome back, ${n}! 👋`,
    subtitle:       "Here's what's happening at Zar Kebab today.",
    todayRevenue:   "Today's Revenue",
    ordersToday:    'Orders Today',
    avgOrder:       'Avg Order Value',
    itemsSold:      'Items Sold',
    activeBills:    'Active Bills',
    needAttention:  'NEED ATTENTION',
    yesterday:      'Yesterday',
    vsYesterday:    'vs yesterday',
    revenueStats:   'Revenue Statistics',
    today:          'Today',
    days7:          '7 Days',
    thisMonth:      'This Month',
    thisYear:       'This Year',
    prevPeriod:     'Previous Period',
    thisPeriod:     'This Period',
    growth:         'Growth',
    paymentMethods: 'Payment Methods',
    cash:           'Cash',
    card:           'Card',
    terminal:       'Terminal',
    qr:             'QR Code',
    unknown:        'Unknown',
    salesByCategory:'Sales by Category',
    bestSelling:    'Best-Selling Dishes',
    noSales:        'No sales data yet',
    staffPerf:      'Staff Performance',
    noStaff:        'No staff data yet',
    recentOrders:   'Recent Orders',
    recentOrdersSub:'Quickly print bills and review paid orders',
    needBillCount:  n => `${n} Need Bill`,
    needsBillSection:'NEEDS BILL',
    paidSection:    'PAID',
    printBill:      'Print Bill',
    view:           'View',
    noOrders:       'No orders yet',
    table:          'Table',
    pcs:            'pcs',
    orders:         'orders',
    revenue:        'Revenue',
    avgOrderShort:  'Avg',
    items:          'items',
    paid:           'Paid',
    new:            'New',
    preparing:      'Preparing',
    needsBill:      'Needs Bill',
    ready:          'Ready',
    cancelled:      'Cancelled',
    active:         'Active',
    total:          'Total',
    footer:         'All data is based on paid orders',
    loading:        'Loading...',
    noData:         'No data yet',
  },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function localDateStr(d) {
  return toLocalDateStr(d instanceof Date ? d.toISOString() : d)
}

function todayStr()     { return localDateStr(new Date()) }
function yesterdayStr() { const d = new Date(); d.setDate(d.getDate() - 1); return localDateStr(d) }

function elapsedSince(iso) {
  if (!iso) return ''
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (diff < 1)  return '< 1 min'
  if (diff < 60) return `${diff} min`
  return `${Math.floor(diff / 60)}h ${diff % 60}m`
}

function shortLabel(ds, mode) {
  const d = new Date(ds + 'T12:00:00')
  if (mode === 'today')  return `${ds.slice(11, 16)}` // hour label passed in directly
  if (mode === 'year')   return d.toLocaleDateString('en', { month: 'short' })
  return d.toLocaleDateString('en', { weekday: 'short', day: 'numeric' })
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, sub, subColor, badge, highlight }) {
  return (
    <div className={`bg-white rounded-2xl border shadow-sm p-4 flex flex-col gap-2 min-w-0 ${highlight ? 'border-red-200' : 'border-[#E5E7EB]'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${highlight ? 'bg-red-50' : 'bg-gray-50'}`}>
          <Icon size={17} className={highlight ? 'text-[#DC2626]' : 'text-[#6B7280]'} />
        </div>
        {badge && (
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5 whitespace-nowrap flex-shrink-0 ${badge.cls}`}>
            {badge.up !== null && (badge.up ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />)}
            {badge.text}
          </span>
        )}
      </div>
      <div>
        <p className={`font-black text-xl leading-tight break-words tabular-nums mb-1 ${highlight ? 'text-[#DC2626]' : 'text-[#1F2937]'}`}>{value}</p>
        <p className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider">{label}</p>
        {sub && <p className={`text-xs mt-0.5 leading-snug ${subColor || 'text-[#9CA3AF]'}`}>{sub}</p>}
      </div>
    </div>
  )
}

function OrderBadge({ status, lang }) {
  const l = L[lang] || L.en
  const map = {
    sent_to_kitchen: { cls: 'bg-blue-50 text-blue-600 border-blue-100',      label: l.new       },
    new:             { cls: 'bg-blue-50 text-blue-600 border-blue-100',      label: l.new       },
    preparing:       { cls: 'bg-orange-50 text-[#ff5a00] border-orange-100', label: l.preparing },
    needs_bill:      { cls: 'bg-red-50 text-[#DC2626] border-red-100',       label: l.needsBill },
    ready:           { cls: 'bg-green-50 text-[#16A34A] border-green-100',   label: l.ready     },
    paid:            { cls: 'bg-gray-100 text-[#6B7280] border-gray-200',    label: l.paid      },
    cancelled:       { cls: 'bg-gray-100 text-[#6B7280] border-gray-200',    label: l.cancelled },
  }
  const c = map[status] || map.new
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${c.cls}`}>{c.label}</span>
  )
}

function RecentStatusPill({ status, lang }) {
  const l = L[lang] || L.en
  const isNeedsBill = status === 'needs_bill'
  return (
    <span className={`text-[11px] font-black px-2.5 py-1 rounded-full border whitespace-nowrap ${
      isNeedsBill
        ? 'bg-[#FFF1F1] text-[#B42318] border-[#FFCDCA]'
        : 'bg-[#EEF7F1] text-[#157347] border-[#CDEBD6]'
    }`}>
      {isNeedsBill ? l.needsBill : l.paid}
    </span>
  )
}

function RecentSectionHeader({ title, count, urgent }) {
  return (
    <div className="flex items-center justify-between px-1 pt-1 mb-2">
      <p className="text-[11px] font-black tracking-[0.24em] text-[#8EA0BB]">
        {title}
      </p>
      <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-[#F1F5F9] text-[#8EA0BB]">
        {count}
      </span>
    </div>
  )
}

function RecentOrderRow({ order, lang, methodLabel, onPrintBill, onView }) {
  const l = L[lang] || L.en
  const isNeedsBill = order.status === 'needs_bill'
  const shortId = String(order.id).slice(-4).toUpperCase()

  return (
    <div className={`rounded-2xl border px-3 py-3 transition-all ${
      isNeedsBill
        ? 'bg-[#FFF8F8] border-[#FFD6D3]'
        : 'bg-white border-[#EDF1F5] hover:bg-[#FAFBFC]'
    }`}>
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
          isNeedsBill ? 'bg-white text-[#EF3D32]' : 'bg-[#FFF7ED] text-[#FF5A00]'
        }`}>
          <Receipt size={14} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-base font-black text-[#1F2937] leading-none">#{shortId}</p>
            <p className="text-sm text-[#718096] truncate max-w-[90px]">{order.table_name || l.table}</p>
            <RecentStatusPill status={isNeedsBill ? 'needs_bill' : 'paid'} lang={lang} />
          </div>

          <div className="mt-1.5 flex items-center gap-1.5 text-xs text-[#8EA0BB] min-w-0">
            <Clock size={13} className="flex-shrink-0" />
            <span className="whitespace-nowrap">{elapsedSince(getOrderDate(order) || order.created_at)}</span>
            {methodLabel && (
              <>
                <CreditCard size={13} className="ml-0.5 flex-shrink-0" />
                <span className="truncate font-semibold text-[#63738A]">{methodLabel}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <p className="text-[15px] font-black text-[#111827] tabular-nums whitespace-nowrap">
            {formatCurrency(getOrderTotal(order))}
          </p>
          {isNeedsBill ? (
            <button
              type="button"
              onClick={() => onPrintBill(order)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#0F3B2E] text-white text-[12px] font-black hover:bg-[#0A2A20] active:scale-[0.98] transition-all shadow-[0_3px_8px_rgba(15,59,46,0.22)]"
            >
              <Printer size={13} />
              {l.printBill}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onView(order)}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg text-[#7B8AA4] text-xs font-semibold hover:text-[#0F3B2E] transition-colors"
            >
              {l.view}
              <ChevronRight size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

const PAYMENT_COLORS = {
  cash:     '#16A34A',
  card:     '#7C3AED',
  terminal: '#2563EB',
  qr:       '#D97706',
  unknown:  '#D1D5DB',
}

const ROLE_BADGE = {
  owner:       'bg-orange-100 text-[#ff5a00] border-orange-200',
  admin:       'bg-blue-100 text-blue-700 border-blue-200',
  waiter:      'bg-green-100 text-green-700 border-green-200',
  cashier:     'bg-teal-100 text-teal-700 border-teal-200',
  kitchen:     'bg-yellow-100 text-yellow-700 border-yellow-200',
  stakeholder: 'bg-indigo-100 text-indigo-700 border-indigo-200',
}

const ROLE_LABEL = {
  owner: 'Owner', admin: 'Admin', waiter: 'Waiter',
  cashier: 'Cashier', kitchen: 'Kitchen', stakeholder: 'Stakeholder',
}

function DonutChart({ slices }) {
  const total = slices.reduce((s, x) => s + x.value, 0)
  if (total === 0) return (
    <svg viewBox="0 0 36 36" className="w-28 h-28">
      <circle cx="18" cy="18" r="15.9" fill="none" stroke="#F3F4F6" strokeWidth="3.8" />
    </svg>
  )
  const circ = 2 * Math.PI * 15.9
  let offset = 0
  return (
    <svg viewBox="0 0 36 36" className="w-28 h-28 -rotate-90">
      {slices.map((seg, i) => {
        const dash = (seg.value / total) * circ
        const el = (
          <circle key={i} cx="18" cy="18" r="15.9" fill="none"
            stroke={seg.color} strokeWidth="3.8"
            strokeDasharray={`${dash} ${circ - dash}`}
            strokeDashoffset={-offset}
          />
        )
        offset += dash
        return el
      })}
    </svg>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const { state }   = useApp()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const lang = state.lang
  const l    = L[lang] || L.en

  const displayName = profile?.full_name || state.user?.name || 'Admin'

  const [period, setPeriod]           = useState('7days')
  const [staffProfiles, setStaffProfiles] = useState(null)

  useEffect(() => {
    getAllProfiles()
      .then(({ data }) => setStaffProfiles(data || []))
      .catch(() => setStaffProfiles([]))
  }, [])

  // ── Core derived sets ─────────────────────────────────────────────────────
  const paidOrders = useMemo(
    () => groupOrdersBySession(state.orders).filter(isPaidOrder),
    [state.orders]
  )

  const menuItemMap = useMemo(
    () => Object.fromEntries(state.menuItems.map(m => [m.id, m])),
    [state.menuItems]
  )

  const categoryMap = useMemo(
    () => Object.fromEntries(state.categories.filter(c => c.id !== 'all').map(c => [c.id, c])),
    [state.categories]
  )

  // ── KPI: Today's revenue & orders ─────────────────────────────────────────
  const {
    todayRevenue, yesterdayRevenue, revenueChange,
    todayOrderCount, yesterdayOrderCount, orderChange,
    avgOrderValue, avgYesterday, avgChange,
    itemsSoldToday,
  } = useMemo(() => {
    const today     = todayStr()
    const yesterday = yesterdayStr()

    const todayPaid = paidOrders.filter(o => localDateStr(getOrderDate(o)) === today)
    const yestPaid  = paidOrders.filter(o => localDateStr(getOrderDate(o)) === yesterday)
    const todayRevenue     = todayPaid.reduce((s, o) => s + getOrderTotal(o), 0)
    const yesterdayRevenue = yestPaid.reduce((s, o) => s + getOrderTotal(o), 0)
    const revenueChange    = yesterdayRevenue > 0
      ? Math.round(((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100)
      : null

    const todayOrderCount     = todayPaid.length
    const yesterdayOrderCount = yestPaid.length
    const orderChange         = yesterdayOrderCount > 0
      ? Math.round(((todayOrderCount - yesterdayOrderCount) / yesterdayOrderCount) * 100)
      : null

    const avgOrderValue = todayPaid.length > 0 ? Math.round(todayRevenue / todayPaid.length) : 0
    const avgYesterday  = yestPaid.length  > 0 ? Math.round(yesterdayRevenue / yestPaid.length) : 0
    const avgChange     = avgYesterday > 0
      ? Math.round(((avgOrderValue - avgYesterday) / avgYesterday) * 100)
      : null

    const itemsSoldToday = todayPaid
      .flatMap(o => getOrderItems(o))
      .reduce((s, i) => s + (Number(i.quantity) || 1), 0)

    return {
      todayRevenue, yesterdayRevenue, revenueChange,
      todayOrderCount, yesterdayOrderCount, orderChange,
      avgOrderValue, avgYesterday, avgChange,
      itemsSoldToday,
    }
  }, [paidOrders, state.orders])

  const activeBills = useMemo(
    () => state.tables.filter(t => t.status === 'needs_bill').length,
    [state.tables]
  )

  // ── Revenue chart & period comparison ─────────────────────────────────────
  const { chartBars, currentPeriodTotal, previousPeriodTotal } = useMemo(() => {
    const now = new Date()

    if (period === 'today') {
      const today = todayStr()
      const yesterday = yesterdayStr()
      const todayPaid = paidOrders.filter(o => localDateStr(getOrderDate(o)) === today)
      const yestPaid  = paidOrders.filter(o => localDateStr(getOrderDate(o)) === yesterday)
      const currentHour = now.getHours()
      const bars = Array.from({ length: currentHour + 1 }, (_, h) => ({
        label:   `${h}:00`,
        revenue: todayPaid
          .filter(o => new Date(getOrderDate(o)).getHours() === h)
          .reduce((s, o) => s + getOrderTotal(o), 0),
        isToday: h === currentHour,
      }))
      return {
        chartBars: bars,
        currentPeriodTotal:  todayPaid.reduce((s, o) => s + getOrderTotal(o), 0),
        previousPeriodTotal: yestPaid.reduce((s, o) => s + getOrderTotal(o), 0),
      }
    }

    if (period === '7days') {
      const days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(); d.setDate(d.getDate() - (6 - i)); return localDateStr(d)
      })
      const prev = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(); d.setDate(d.getDate() - (13 - i)); return localDateStr(d)
      })
      const todayDs = todayStr()
      const bars = days.map(ds => ({
        label:   new Date(ds + 'T12:00:00').toLocaleDateString('en', { weekday: 'short', day: 'numeric' }),
        revenue: paidOrders.filter(o => localDateStr(getOrderDate(o)) === ds).reduce((s, o) => s + getOrderTotal(o), 0),
        isToday: ds === todayDs,
      }))
      const prevTotal = prev.reduce((s, ds) =>
        s + paidOrders.filter(o => localDateStr(getOrderDate(o)) === ds).reduce((s2, o) => s2 + getOrderTotal(o), 0), 0)
      return {
        chartBars: bars,
        currentPeriodTotal:  bars.reduce((s, b) => s + b.revenue, 0),
        previousPeriodTotal: prevTotal,
      }
    }

    if (period === 'month') {
      const year  = now.getFullYear()
      const month = now.getMonth()
      const daysInMonth = new Date(year, month + 1, 0).getDate()
      const todayDs = todayStr()
      const bars = Array.from({ length: daysInMonth }, (_, i) => {
        const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`
        return {
          label:   String(i + 1),
          revenue: paidOrders.filter(o => localDateStr(getOrderDate(o)) === ds).reduce((s, o) => s + getOrderTotal(o), 0),
          isToday: ds === todayDs,
        }
      })
      // Previous month
      const prevMonth     = month === 0 ? 11 : month - 1
      const prevYear      = month === 0 ? year - 1 : year
      const daysInPrevMonth = new Date(prevYear, prevMonth + 1, 0).getDate()
      const prevTotal = Array.from({ length: daysInPrevMonth }, (_, i) => {
        const ds = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`
        return paidOrders.filter(o => localDateStr(getOrderDate(o)) === ds).reduce((s, o) => s + getOrderTotal(o), 0)
      }).reduce((s, v) => s + v, 0)
      return {
        chartBars: bars,
        currentPeriodTotal:  bars.reduce((s, b) => s + b.revenue, 0),
        previousPeriodTotal: prevTotal,
      }
    }

    // year
    const year = now.getFullYear()
    const todayDs = todayStr()
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    const bars = Array.from({ length: 12 }, (_, m) => {
      const prefix = `${year}-${String(m + 1).padStart(2, '0')}-`
      return {
        label:   monthNames[m],
        revenue: paidOrders.filter(o => localDateStr(getOrderDate(o)).startsWith(prefix)).reduce((s, o) => s + getOrderTotal(o), 0),
        isToday: localDateStr(new Date()).startsWith(prefix),
      }
    })
    return {
      chartBars: bars,
      currentPeriodTotal:  bars.reduce((s, b) => s + b.revenue, 0),
      previousPeriodTotal: 0, // prior year data not loaded
    }
  }, [paidOrders, period])

  const periodGrowth = useMemo(() => {
    if (previousPeriodTotal === 0) return null
    return Math.round(((currentPeriodTotal - previousPeriodTotal) / previousPeriodTotal) * 100)
  }, [currentPeriodTotal, previousPeriodTotal])

  // ── Payment methods breakdown ─────────────────────────────────────────────
  const paymentMethods = useMemo(() => {
    const KNOWN = { cash: l.cash, card: l.card, terminal: l.terminal, qr: l.qr }
    const map = {}
    paidOrders.forEach(o => {
      const raw    = (o.payment_method || '').toLowerCase().trim()
      const key    = ['cash','card','terminal','qr'].includes(raw) ? raw : 'unknown'
      const amount = getOrderTotal(o)
      map[key] = (map[key] || 0) + amount
    })
    const total = Object.values(map).reduce((s, v) => s + v, 0)
    return Object.entries(map)
      .map(([key, amount]) => ({
        key,
        label:  KNOWN[key] || l.unknown,
        amount,
        pct:    total > 0 ? Math.round((amount / total) * 100) : 0,
        color:  PAYMENT_COLORS[key] || PAYMENT_COLORS.unknown,
      }))
      .sort((a, b) => b.amount - a.amount)
  }, [paidOrders, l])

  // ── Sales by category ─────────────────────────────────────────────────────
  const salesByCategory = useMemo(() => {
    const map = {}
    paidOrders.forEach(o => {
      getOrderItems(o).forEach(item => {
        const mi    = menuItemMap[item.menu_item_id]
        const cat   = mi ? categoryMap[mi.category_id] : null
        const name  = cat
          ? (cat[`name_${lang}`] || cat.name_en || cat.name_uz || 'Other')
          : 'Other'
        const rev = (Number(item.price) || 0) * (Number(item.quantity) || 1)
        if (!map[name]) map[name] = { name, revenue: 0, qty: 0 }
        map[name].revenue += rev
        map[name].qty     += Number(item.quantity) || 1
      })
    })
    const rows  = Object.values(map).sort((a, b) => b.revenue - a.revenue)
    const total = rows.reduce((s, r) => s + r.revenue, 0)
    return rows.map(r => ({ ...r, pct: total > 0 ? Math.round((r.revenue / total) * 100) : 0 }))
  }, [paidOrders, menuItemMap, categoryMap, lang])

  // ── Best-selling dishes ───────────────────────────────────────────────────
  const bestSelling = useMemo(() => {
    const map = {}
    paidOrders.forEach(o => {
      getOrderItems(o).forEach(item => {
        const key = item.menu_item_id || item.name
        if (!map[key]) map[key] = { menuItemId: item.menu_item_id, name: item.name, qty: 0, revenue: 0 }
        map[key].qty     += Number(item.quantity) || 1
        map[key].revenue += (Number(item.price) || 0) * (Number(item.quantity) || 1)
      })
    })
    return Object.values(map)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5)
      .map(row => ({ ...row, image_url: menuItemMap[row.menuItemId]?.image_url || '' }))
  }, [paidOrders, menuItemMap])

  // ── Staff performance ─────────────────────────────────────────────────────
  const staffPerformance = useMemo(() => {
    const map = {}
    paidOrders.forEach(o => {
      const name = o.waiter_name || 'Unknown'
      if (!map[name]) map[name] = { name, orders: 0, revenue: 0, items: 0 }
      map[name].orders++
      map[name].revenue += getOrderTotal(o)
      map[name].items   += getOrderItems(o).reduce((s, i) => s + (Number(i.quantity) || 1), 0)
    })
    return Object.values(map)
      .map(s => {
        const profile = (staffProfiles || []).find(p =>
          p.full_name === s.name || p.email === s.name
        )
        return { ...s, avgOrder: s.orders > 0 ? Math.round(s.revenue / s.orders) : 0, role: profile?.role || null }
      })
      .sort((a, b) => b.revenue - a.revenue)
  }, [paidOrders, staffProfiles])

  // ── Recent orders: action-needed bills first, paid history second ─────────
  const recentOrderGroups = useMemo(() => {
    const grouped = groupOrdersBySession(state.orders)
      .filter(o => o.status === 'needs_bill' || isPaidOrder(o))
      .sort((a, b) => new Date(getOrderDate(b) || b.created_at) - new Date(getOrderDate(a) || a.created_at))

    const needsBill = grouped.filter(o => o.status === 'needs_bill')
    const paid = grouped.filter(o => o.status !== 'needs_bill' && isPaidOrder(o))
    const visibleNeedsBill = needsBill.slice(0, 8)
    const visiblePaid = paid.slice(0, Math.max(0, 8 - visibleNeedsBill.length))

    return { needsBill: visibleNeedsBill, paid: visiblePaid, needsBillTotal: needsBill.length }
  }, [state.orders])

  const recentOrdersCount = recentOrderGroups.needsBill.length + recentOrderGroups.paid.length

  function getMethodLabel(order) {
    const method = (order.payment_method || '').toLowerCase()
    return { cash: l.cash, card: l.card, terminal: l.terminal, qr: l.qr }[method] || ''
  }

  function printRecentBill(order) {
    navigate(`/receipt/table/${order.table_id}?print=1`)
  }

  function viewRecentOrder(order) {
    navigate(`/receipt/${order.id}`)
  }

  // ── KPI badges ────────────────────────────────────────────────────────────
  function pctBadge(change) {
    if (change === null) return null
    return {
      text: `${change > 0 ? '+' : ''}${change}%`,
      cls:  change >= 0 ? 'bg-green-50 text-[#16A34A]' : 'bg-red-50 text-[#DC2626]',
      up:   change >= 0,
    }
  }

  const chartMax = Math.max(...chartBars.map(b => b.revenue), 1)
  const now      = new Date()
  const lastUpdated = `${now.getDate().toString().padStart(2,'0')}/${(now.getMonth()+1).toString().padStart(2,'0')}/${now.getFullYear()} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`

  if (!state.loaded) {
    return (
      <AppShell title="Dashboard">
        <div className="flex flex-col items-center justify-center h-64 gap-3">
          <Loader2 size={28} className="animate-spin text-[#ff5a00]" />
          <p className="text-sm text-gray-400">{l.loading}</p>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell title={l.greeting(displayName)}>
      <div className="p-5 xl:p-6 max-w-[1500px] mx-auto">

        {/* Header */}
        <div className="mb-6 flex items-start justify-between flex-wrap gap-2">
          <div>
            <h2 className="font-black text-[#1F2937] text-2xl leading-tight">{l.greeting(displayName)}</h2>
            <p className="text-sm text-[#6B7280] mt-1">{l.subtitle}</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-[#6B7280] bg-white border border-gray-200 px-3 py-2 rounded-xl">
            <Clock size={13} />
            {lastUpdated}
          </div>
        </div>

        {/* ── KPI cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
          <KpiCard
            icon={TrendingUp}
            label={l.todayRevenue}
            value={formatCurrency(todayRevenue)}
            sub={`${l.yesterday}: ${formatCurrency(yesterdayRevenue)}`}
            badge={pctBadge(revenueChange)}
          />
          <KpiCard
            icon={ShoppingBag}
            label={l.ordersToday}
            value={todayOrderCount}
            sub={`${l.yesterday}: ${yesterdayOrderCount}`}
            badge={pctBadge(orderChange)}
          />
          <KpiCard
            icon={DollarSign}
            label={l.avgOrder}
            value={formatCurrency(avgOrderValue)}
            sub={`${l.yesterday}: ${formatCurrency(avgYesterday)}`}
            badge={pctBadge(avgChange)}
          />
          <KpiCard
            icon={Package}
            label={l.itemsSold}
            value={itemsSoldToday}
            sub={todayStr()}
          />
          <KpiCard
            icon={Receipt}
            label={l.activeBills}
            value={activeBills}
            sub={activeBills > 0 ? l.needAttention : '—'}
            subColor={activeBills > 0 ? 'text-[#DC2626] font-semibold' : 'text-[#9CA3AF]'}
            highlight={activeBills > 0}
          />
        </div>

        {/* ── Row 2: Revenue Statistics + Payment Methods ── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">

          {/* Revenue Statistics — left 2 cols */}
          <div className="xl:col-span-2 bg-white rounded-2xl border border-[#E5E7EB] shadow-sm p-5">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h3 className="font-bold text-[#1F2937] text-base">{l.revenueStats}</h3>
              <div className="flex gap-1">
                {[
                  { key: 'today',  label: l.today    },
                  { key: '7days',  label: l.days7    },
                  { key: 'month',  label: l.thisMonth },
                  { key: 'year',   label: l.thisYear  },
                ].map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setPeriod(tab.key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                      period === tab.key
                        ? 'bg-[#ff5a00] text-white'
                        : 'bg-gray-100 text-[#6B7280] hover:bg-gray-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Bar chart — bars use h-full so they fill it properly */}
            <div className="relative h-36 mb-1">
              <div className="flex items-end gap-[3px] h-full">
                {chartBars.map((bar, i) => {
                  const pct = Math.round((bar.revenue / chartMax) * 100)
                  return (
                    <div key={i} className="flex-1 flex items-end h-full group relative min-w-[6px]">
                      {bar.revenue > 0 && (
                        <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-[#1F2937] text-white text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                          {formatCurrency(bar.revenue)}
                        </div>
                      )}
                      <div
                        className={`w-full rounded-t-md transition-all ${
                          bar.isToday ? 'bg-[#ff5a00]' : bar.revenue > 0 ? 'bg-[#FED7AA] group-hover:bg-[#FDBA74]' : 'bg-[#F3F4F6]'
                        }`}
                        style={{ height: `${Math.max(pct, 3)}%` }}
                      />
                    </div>
                  )
                })}
              </div>
            </div>

            {/* X-axis labels — show max 10 evenly, rest hidden */}
            <div className="flex gap-[3px] mb-4">
              {chartBars.map((bar, i) => {
                const show = chartBars.length <= 10 || i % Math.ceil(chartBars.length / 10) === 0
                return (
                  <p key={i} className={`flex-1 text-center text-[10px] font-semibold truncate min-w-[6px] ${
                    bar.isToday ? 'text-[#ff5a00]' : 'text-[#9CA3AF]'
                  } ${!show ? 'opacity-0 pointer-events-none' : ''}`}>
                    {bar.label}
                  </p>
                )
              })}
            </div>

            {/* Period comparison */}
            <div className="grid grid-cols-3 gap-3 pt-3 border-t border-[#F3F4F6]">
              <div>
                <p className="text-xs text-[#9CA3AF] mb-1">{l.prevPeriod}</p>
                <p className="font-bold text-[#1F2937] text-sm">{formatCurrency(previousPeriodTotal)}</p>
              </div>
              <div>
                <p className="text-xs text-[#9CA3AF] mb-1">{l.thisPeriod}</p>
                <p className="font-bold text-[#1F2937] text-sm">{formatCurrency(currentPeriodTotal)}</p>
              </div>
              <div>
                <p className="text-xs text-[#9CA3AF] mb-1">{l.growth}</p>
                {periodGrowth !== null ? (
                  <p className={`font-bold text-sm flex items-center gap-0.5 ${periodGrowth >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'}`}>
                    {periodGrowth >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                    {periodGrowth > 0 ? '+' : ''}{periodGrowth}%
                  </p>
                ) : (
                  <p className="font-bold text-[#9CA3AF] text-sm">—</p>
                )}
              </div>
            </div>
          </div>

          {/* Payment Methods */}
          <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm p-5">
            <h3 className="font-black text-[#1F2937] text-base mb-4">{l.paymentMethods}</h3>
            {paymentMethods.length === 0 ? (
              <p className="text-sm text-[#9CA3AF] text-center py-4">{l.noData}</p>
            ) : (
              <div className="flex items-center gap-4">
                <div className="relative flex-shrink-0">
                  <DonutChart slices={paymentMethods.map(p => ({ value: p.amount, color: p.color }))} />
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <p className="font-black text-[#1F2937] text-xs leading-none">{formatCurrency(paymentMethods.reduce((s, p) => s + p.amount, 0)).split(' ')[0]}</p>
                  </div>
                </div>
                <div className="flex-1 space-y-1.5 min-w-0">
                  {paymentMethods.map(p => (
                    <div key={p.key} className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
                      <span className="text-xs text-[#6B7280] flex-1 truncate">{p.label}</span>
                      <span className="text-xs font-bold text-[#1F2937] flex-shrink-0">{p.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Row 3: Sales by Category + Best-Selling + Recent Orders ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">

          {/* Sales by Category */}
          <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm p-5">
            <h3 className="font-black text-[#1F2937] text-base mb-4">{l.salesByCategory}</h3>
            {salesByCategory.length === 0 ? (
              <p className="text-sm text-[#9CA3AF] text-center py-6">{l.noSales}</p>
            ) : (
              <div className="space-y-3">
                {salesByCategory.map(cat => (
                  <div key={cat.name}>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-semibold text-[#1F2937] truncate flex-1 mr-2">{cat.name}</p>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <p className="text-xs font-bold text-[#1F2937]">{formatCurrency(cat.revenue)}</p>
                        <p className="text-xs text-[#9CA3AF] w-8 text-right">{cat.pct}%</p>
                      </div>
                    </div>
                    <div className="h-1.5 bg-[#F3F4F6] rounded-full overflow-hidden">
                      <div className="h-full bg-[#ff5a00] rounded-full" style={{ width: `${cat.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Best-selling */}
          <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm p-5">
            <h3 className="font-black text-[#1F2937] text-base mb-4">{l.bestSelling}</h3>
            {bestSelling.length === 0 ? (
              <p className="text-sm text-[#9CA3AF] text-center py-6">{l.noSales}</p>
            ) : (
              <div className="space-y-2">
                {bestSelling.map((item, i) => (
                  <div key={item.menuItemId || i} className="flex items-center gap-2.5 py-1.5 border-b border-[#F9FAFB] last:border-0">
                    <span className="w-5 text-center text-xs font-black text-[#9CA3AF] flex-shrink-0">
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                    </span>
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.name} className="w-9 h-9 rounded-xl object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-9 h-9 rounded-xl bg-gray-100 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#1F2937] truncate">{item.name}</p>
                      <p className="text-xs text-[#9CA3AF]">{item.qty} {l.pcs}</p>
                    </div>
                    <p className="text-xs font-black text-[#1F2937] flex-shrink-0">{formatCurrency(item.revenue)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Orders */}
          <div className="bg-white rounded-[24px] border border-[#E5E7EB] shadow-[0_2px_8px_rgba(15,23,42,0.05)] p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="min-w-0">
                <h3 className="font-black text-[#1F2937] text-xl leading-tight">{l.recentOrders}</h3>
                <p className="text-sm text-[#8EA0BB] mt-2 leading-snug">{l.recentOrdersSub}</p>
              </div>
              <div className="w-20 h-16 rounded-2xl bg-[#0F3B2E] text-white flex flex-col items-center justify-center shadow-[0_6px_14px_rgba(15,59,46,0.18)] flex-shrink-0">
                <span className="text-xl font-black leading-none">{recentOrderGroups.needsBillTotal}</span>
                <span className="text-[10px] font-bold tracking-wider uppercase text-[#C9DCD5] mt-1">{l.needsBill}</span>
              </div>
            </div>

            {recentOrdersCount === 0 ? (
              <p className="text-sm text-[#9CA3AF] text-center py-4">{l.noOrders}</p>
            ) : (
              <div className="space-y-4 max-h-[520px] overflow-y-auto pr-0.5">
                {recentOrderGroups.needsBill.length > 0 && (
                  <div>
                    <RecentSectionHeader title={l.needsBillSection} count={recentOrderGroups.needsBill.length} urgent />
                    <div className="space-y-2.5">
                    {recentOrderGroups.needsBill.map(order => (
                      <RecentOrderRow
                        key={order.id}
                        order={order}
                        lang={lang}
                        methodLabel={getMethodLabel(order)}
                        onPrintBill={printRecentBill}
                        onView={viewRecentOrder}
                      />
                    ))}
                    </div>
                  </div>
                )}

                {recentOrderGroups.paid.length > 0 && (
                  <div>
                    <RecentSectionHeader title={l.paidSection} count={recentOrderGroups.paid.length} />
                    <div className="space-y-2.5">
                    {recentOrderGroups.paid.map(order => (
                      <RecentOrderRow
                        key={order.id}
                        order={order}
                        lang={lang}
                        methodLabel={getMethodLabel(order)}
                        onPrintBill={printRecentBill}
                        onView={viewRecentOrder}
                      />
                    ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Row 4: Staff Performance ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">

          {/* Staff Performance */}
          <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm p-5">
            <h3 className="font-black text-[#1F2937] text-base mb-4">{l.staffPerf}</h3>
            {staffPerformance.length === 0 ? (
              <p className="text-sm text-[#9CA3AF] text-center py-6">{l.noStaff}</p>
            ) : (
              <div className="divide-y divide-[#F9FAFB]">
                {staffPerformance.map((s, idx) => {
                  const maxRev = staffPerformance[0]?.revenue || 1
                  const pct    = Math.round((s.revenue / maxRev) * 100)
                  return (
                    <div key={s.name} className="py-3 first:pt-0 last:pb-0">
                      {/* Avatar + name + role */}
                      <div className="flex items-center gap-2.5 mb-2">
                        <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center flex-shrink-0">
                          <span className="text-[#ff5a00] text-sm font-black">{(s.name || '?')[0].toUpperCase()}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-bold text-[#1F2937]">{s.name}</p>
                            {s.role && (
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border leading-none ${ROLE_BADGE[s.role] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                                {ROLE_LABEL[s.role] || s.role}
                              </span>
                            )}
                          </div>
                        </div>
                        {idx === 0 && (
                          <span className="text-base flex-shrink-0">🥇</span>
                        )}
                      </div>
                      {/* Stats row */}
                      <div className="grid grid-cols-3 gap-2 mb-2 ml-10">
                        <div>
                          <p className="text-[10px] text-[#9CA3AF] font-semibold uppercase mb-0.5">{l.orders}</p>
                          <p className="text-sm font-bold text-[#1F2937]">{s.orders}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-[#9CA3AF] font-semibold uppercase mb-0.5">{l.avgOrderShort}</p>
                          <p className="text-sm font-bold text-[#1F2937] tabular-nums">{formatCurrency(s.avgOrder)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-[#9CA3AF] font-semibold uppercase mb-0.5">{l.items}</p>
                          <p className="text-sm font-bold text-[#1F2937]">{s.items}</p>
                        </div>
                      </div>
                      {/* Revenue + progress */}
                      <div className="ml-10">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-[10px] text-[#9CA3AF] font-semibold uppercase">{l.revenue}</p>
                          <p className="text-xs font-black text-[#ff5a00] tabular-nums">{formatCurrency(s.revenue)}</p>
                        </div>
                        <div className="h-1.5 bg-[#F3F4F6] rounded-full overflow-hidden">
                          <div className="h-full bg-[#ff5a00] rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-[#9CA3AF] mt-6">
          {l.footer} • {lang === 'uz' ? 'Oxirgi yangilanish' : lang === 'ru' ? 'Последнее обновление' : 'Last updated'}: {lastUpdated}
        </p>

      </div>
    </AppShell>
  )
}
