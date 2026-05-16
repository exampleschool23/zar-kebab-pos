import React, { useMemo, useEffect, useState } from 'react'
import {
  TrendingUp, ShoppingBag, DollarSign, Package, Receipt,
  Clock, ArrowUpRight, ArrowDownRight, Users, Loader2,
} from 'lucide-react'
import { useApp } from '../store/AppContext'
import { useAuth } from '../contexts/AuthContext'
import { getAllProfiles } from '../lib/supabase'
import { formatCurrency } from '../lib/formatCurrency'
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

function isPaid(o) {
  return o.payment_status === 'paid' || o.status === 'paid'
}

function getOrderTotal(o) {
  if (o.total && Number(o.total) > 0) return Number(o.total)
  return (o.items || []).reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0)
}

function localDateStr(d) {
  const dt = d instanceof Date ? d : new Date(d)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
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
    <div className={`bg-white rounded-2xl border shadow-sm p-5 flex flex-col gap-3 min-w-0 ${highlight ? 'border-red-200' : 'border-[#E5E7EB]'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${highlight ? 'bg-red-50' : 'bg-gray-50'}`}>
          <Icon size={18} className={highlight ? 'text-[#DC2626]' : 'text-[#6B7280]'} />
        </div>
        {badge && (
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5 whitespace-nowrap ${badge.cls}`}>
            {badge.up !== null && (badge.up ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />)}
            {badge.text}
          </span>
        )}
      </div>
      <div>
        <p className={`font-black text-2xl leading-none mb-1 truncate ${highlight ? 'text-[#DC2626]' : 'text-[#1F2937]'}`}>{value}</p>
        <p className="text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wider">{label}</p>
        {sub && <p className={`text-[11px] mt-0.5 ${subColor || 'text-[#9CA3AF]'}`}>{sub}</p>}
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
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${c.cls}`}>{c.label}</span>
  )
}

const PAYMENT_COLORS = {
  cash:     '#16A34A',
  card:     '#7C3AED',
  terminal: '#2563EB',
  qr:       '#D97706',
  unknown:  '#D1D5DB',
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
  const paidOrders = useMemo(() => state.orders.filter(isPaid), [state.orders])

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

    const todayPaid = paidOrders.filter(o => localDateStr(o.created_at) === today)
    const yestPaid  = paidOrders.filter(o => localDateStr(o.created_at) === yesterday)
    const todayAll  = state.orders.filter(o => localDateStr(o.created_at) === today)
    const yestAll   = state.orders.filter(o => localDateStr(o.created_at) === yesterday)

    const todayRevenue     = todayPaid.reduce((s, o) => s + getOrderTotal(o), 0)
    const yesterdayRevenue = yestPaid.reduce((s, o) => s + getOrderTotal(o), 0)
    const revenueChange    = yesterdayRevenue > 0
      ? Math.round(((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100)
      : null

    const todayOrderCount     = todayAll.length
    const yesterdayOrderCount = yestAll.length
    const orderChange         = yesterdayOrderCount > 0
      ? Math.round(((todayOrderCount - yesterdayOrderCount) / yesterdayOrderCount) * 100)
      : null

    const avgOrderValue = todayPaid.length > 0 ? Math.round(todayRevenue / todayPaid.length) : 0
    const avgYesterday  = yestPaid.length  > 0 ? Math.round(yesterdayRevenue / yestPaid.length) : 0
    const avgChange     = avgYesterday > 0
      ? Math.round(((avgOrderValue - avgYesterday) / avgYesterday) * 100)
      : null

    const itemsSoldToday = todayPaid
      .flatMap(o => o.items || [])
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
      const todayPaid = paidOrders.filter(o => localDateStr(o.created_at) === today)
      const yestPaid  = paidOrders.filter(o => localDateStr(o.created_at) === yesterday)
      const bars = Array.from({ length: 24 }, (_, h) => ({
        label:   `${h}:00`,
        revenue: todayPaid
          .filter(o => new Date(o.created_at).getHours() === h)
          .reduce((s, o) => s + getOrderTotal(o), 0),
        isToday: new Date().getHours() === h,
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
        revenue: paidOrders.filter(o => localDateStr(o.created_at) === ds).reduce((s, o) => s + getOrderTotal(o), 0),
        isToday: ds === todayDs,
      }))
      const prevTotal = prev.reduce((s, ds) =>
        s + paidOrders.filter(o => localDateStr(o.created_at) === ds).reduce((s2, o) => s2 + getOrderTotal(o), 0), 0)
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
          revenue: paidOrders.filter(o => localDateStr(o.created_at) === ds).reduce((s, o) => s + getOrderTotal(o), 0),
          isToday: ds === todayDs,
        }
      })
      // Previous month
      const prevMonth     = month === 0 ? 11 : month - 1
      const prevYear      = month === 0 ? year - 1 : year
      const daysInPrevMonth = new Date(prevYear, prevMonth + 1, 0).getDate()
      const prevTotal = Array.from({ length: daysInPrevMonth }, (_, i) => {
        const ds = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`
        return paidOrders.filter(o => localDateStr(o.created_at) === ds).reduce((s, o) => s + getOrderTotal(o), 0)
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
        revenue: paidOrders.filter(o => localDateStr(o.created_at).startsWith(prefix)).reduce((s, o) => s + getOrderTotal(o), 0),
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
      ;(o.items || []).forEach(item => {
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
      ;(o.items || []).forEach(item => {
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
      map[name].items   += (o.items || []).reduce((s, i) => s + (Number(i.quantity) || 1), 0)
    })
    return Object.values(map)
      .map(s => ({ ...s, avgOrder: s.orders > 0 ? Math.round(s.revenue / s.orders) : 0 }))
      .sort((a, b) => b.revenue - a.revenue)
  }, [paidOrders])

  // ── Recent orders (latest 8, not grouped) ─────────────────────────────────
  const recentOrders = useMemo(() => {
    return [...state.orders]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 8)
  }, [state.orders])

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
            <h2 className="font-black text-[#1F2937] text-xl leading-tight">{l.greeting(displayName)}</h2>
            <p className="text-sm text-[#6B7280] mt-0.5">{l.subtitle}</p>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-[#6B7280] bg-white border border-gray-200 px-3 py-2 rounded-xl">
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

        {/* ── Main grid: Left 2/3 + Right 1/3 ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">

          {/* Revenue Statistics — left 2 cols */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-[#E5E7EB] shadow-sm p-5">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h3 className="font-black text-[#1F2937] text-[14px]">{l.revenueStats}</h3>
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
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${
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

            {/* Bar chart */}
            <div className="flex items-end gap-[2px] h-32 mb-2" style={{ overflowX: chartBars.length > 16 ? 'auto' : 'visible' }}>
              {chartBars.map((bar, i) => {
                const pct = Math.round((bar.revenue / chartMax) * 100)
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-0.5 group relative min-w-[8px]">
                    {bar.revenue > 0 && (
                      <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-[#1F2937] text-white text-[8px] font-semibold px-1 py-0.5 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                        {formatCurrency(bar.revenue)}
                      </div>
                    )}
                    <div className="w-full flex items-end" style={{ height: '104px' }}>
                      <div
                        className={`w-full rounded-t transition-all min-h-[2px] ${
                          bar.isToday ? 'bg-[#ff5a00]' : bar.revenue > 0 ? 'bg-[#FED7AA] group-hover:bg-[#FDBA74]' : 'bg-[#F3F4F6]'
                        }`}
                        style={{ height: `${Math.max(pct, 2)}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
            {/* X-axis labels: show max 8 evenly distributed */}
            <div className="flex gap-[2px] mb-4">
              {chartBars.map((bar, i) => {
                const show = chartBars.length <= 8 || i % Math.ceil(chartBars.length / 8) === 0
                return (
                  <p key={i} className={`flex-1 text-center text-[9px] font-semibold truncate min-w-[8px] ${
                    bar.isToday ? 'text-[#ff5a00]' : 'text-[#9CA3AF]'
                  } ${!show ? 'opacity-0' : ''}`}>
                    {bar.label}
                  </p>
                )
              })}
            </div>

            {/* Period comparison */}
            <div className="grid grid-cols-3 gap-3 pt-3 border-t border-[#F3F4F6]">
              <div>
                <p className="text-[10px] text-[#9CA3AF] mb-0.5">{l.prevPeriod}</p>
                <p className="font-black text-[#1F2937] text-[13px]">{formatCurrency(previousPeriodTotal)}</p>
              </div>
              <div>
                <p className="text-[10px] text-[#9CA3AF] mb-0.5">{l.thisPeriod}</p>
                <p className="font-black text-[#1F2937] text-[13px]">{formatCurrency(currentPeriodTotal)}</p>
              </div>
              <div>
                <p className="text-[10px] text-[#9CA3AF] mb-0.5">{l.growth}</p>
                {periodGrowth !== null ? (
                  <p className={`font-black text-[13px] flex items-center gap-0.5 ${periodGrowth >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'}`}>
                    {periodGrowth >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                    {periodGrowth > 0 ? '+' : ''}{periodGrowth}%
                  </p>
                ) : (
                  <p className="font-black text-[#9CA3AF] text-[13px]">—</p>
                )}
              </div>
            </div>
          </div>

          {/* Payment Methods + Recent Orders — right col */}
          <div className="flex flex-col gap-4">

            {/* Payment Methods */}
            <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm p-5">
              <h3 className="font-black text-[#1F2937] text-[14px] mb-4">{l.paymentMethods}</h3>
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
                        <span className="text-[11px] text-[#6B7280] flex-1 truncate">{p.label}</span>
                        <span className="text-[11px] font-bold text-[#1F2937] flex-shrink-0">{p.pct}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Recent Orders */}
            <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm p-5 flex-1">
              <h3 className="font-black text-[#1F2937] text-[14px] mb-3">{l.recentOrders}</h3>
              {recentOrders.length === 0 ? (
                <p className="text-sm text-[#9CA3AF] text-center py-4">{l.noOrders}</p>
              ) : (
                <div className="space-y-2">
                  {recentOrders.map(order => {
                    const shortId = String(order.id).slice(-4).toUpperCase()
                    const method  = (order.payment_method || '').toLowerCase()
                    const methodLabel = { cash: l.cash, card: l.card, terminal: l.terminal, qr: l.qr }[method] || ''
                    return (
                      <div key={order.id} className="flex items-center gap-2.5 py-1.5 border-b border-[#F9FAFB] last:border-0">
                        <div className="w-7 h-7 rounded-lg bg-orange-50 flex items-center justify-center flex-shrink-0">
                          <ShoppingBag size={12} className="text-[#ff5a00]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                            <p className="text-[11px] font-bold text-[#1F2937]">#{shortId}</p>
                            <p className="text-[11px] text-[#6B7280]">{order.table_name}</p>
                            <OrderBadge status={order.status} lang={lang} />
                          </div>
                          <div className="flex items-center gap-1 text-[10px] text-[#9CA3AF]">
                            <Clock size={8} />
                            {elapsedSince(order.created_at)}
                            {methodLabel && <span className="ml-1 font-semibold">{methodLabel}</span>}
                          </div>
                        </div>
                        <p className="text-[11px] font-black text-[#1F2937] flex-shrink-0">{formatCurrency(getOrderTotal(order))}</p>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Bottom 3-col: Category / Best-selling / Staff ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* Sales by Category */}
          <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm p-5">
            <h3 className="font-black text-[#1F2937] text-[14px] mb-4">{l.salesByCategory}</h3>
            {salesByCategory.length === 0 ? (
              <p className="text-sm text-[#9CA3AF] text-center py-6">{l.noSales}</p>
            ) : (
              <div className="space-y-3">
                {salesByCategory.map(cat => (
                  <div key={cat.name}>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[12px] font-semibold text-[#1F2937] truncate flex-1 mr-2">{cat.name}</p>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <p className="text-[11px] font-bold text-[#1F2937]">{formatCurrency(cat.revenue)}</p>
                        <p className="text-[10px] text-[#9CA3AF] w-8 text-right">{cat.pct}%</p>
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
            <h3 className="font-black text-[#1F2937] text-[14px] mb-4">{l.bestSelling}</h3>
            {bestSelling.length === 0 ? (
              <p className="text-sm text-[#9CA3AF] text-center py-6">{l.noSales}</p>
            ) : (
              <div className="space-y-2">
                {bestSelling.map((item, i) => (
                  <div key={item.menuItemId || i} className="flex items-center gap-2.5 py-1.5 border-b border-[#F9FAFB] last:border-0">
                    <span className="w-5 text-center text-[11px] font-black text-[#9CA3AF] flex-shrink-0">
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                    </span>
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.name} className="w-9 h-9 rounded-xl object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-9 h-9 rounded-xl bg-gray-100 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-semibold text-[#1F2937] truncate">{item.name}</p>
                      <p className="text-[10px] text-[#9CA3AF]">{item.qty} {l.pcs}</p>
                    </div>
                    <p className="text-[11px] font-black text-[#1F2937] flex-shrink-0">{formatCurrency(item.revenue)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Staff Performance */}
          <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm p-5">
            <h3 className="font-black text-[#1F2937] text-[14px] mb-4">{l.staffPerf}</h3>
            {staffPerformance.length === 0 ? (
              <p className="text-sm text-[#9CA3AF] text-center py-6">{l.noStaff}</p>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-4 gap-1 mb-1">
                  <p className="text-[9px] font-bold text-[#9CA3AF] uppercase col-span-1">Staff</p>
                  <p className="text-[9px] font-bold text-[#9CA3AF] uppercase text-right">Orders</p>
                  <p className="text-[9px] font-bold text-[#9CA3AF] uppercase text-right">Revenue</p>
                  <p className="text-[9px] font-bold text-[#9CA3AF] uppercase text-right">Items</p>
                </div>
                {staffPerformance.map(s => (
                  <div key={s.name} className="grid grid-cols-4 gap-1 items-center">
                    <div className="col-span-1 flex items-center gap-1.5 min-w-0">
                      <div className="w-6 h-6 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-[#6B7280] text-[9px] font-black">{(s.name || '?')[0].toUpperCase()}</span>
                      </div>
                      <p className="text-[11px] font-semibold text-[#1F2937] truncate">{s.name.split(' ')[0]}</p>
                    </div>
                    <p className="text-[11px] font-bold text-[#1F2937] text-right">{s.orders}</p>
                    <p className="text-[10px] font-bold text-[#1F2937] text-right">{formatCurrency(s.revenue)}</p>
                    <p className="text-[11px] font-bold text-[#1F2937] text-right">{s.items}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-[10px] text-[#9CA3AF] mt-6">
          {l.footer} • {lang === 'uz' ? 'Oxirgi yangilanish' : lang === 'ru' ? 'Последнее обновление' : 'Last updated'}: {lastUpdated}
        </p>

      </div>
    </AppShell>
  )
}
