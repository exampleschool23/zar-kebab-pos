import React, { useMemo, useEffect, useState } from 'react'
import {
  TrendingUp, ShoppingBag, Table2, UtensilsCrossed, Users,
  Clock, ChevronRight, ArrowUpRight, ArrowDownRight,
} from 'lucide-react'
import { useApp } from '../store/AppContext'
import { useAuth } from '../contexts/AuthContext'
import { getAllProfiles } from '../lib/supabase'
import { formatCurrency } from '../lib/formatCurrency'
import AppShell from '../components/AppShell'

// ── Localisation ──────────────────────────────────────────────────────────────
const L = {
  uz: {
    greeting:       (n) => `Xush kelibsiz, ${n}! 👋`,
    subtitle:       "Bugun Zar Kebab'da nima bo'layotganini ko'rishingiz mumkin.",
    todayRevenue:   'Bugungi daromad',
    orders:         'Buyurtmalar',
    totalTables:    'Jami stollar',
    menuItems:      'Menyu elementlari',
    activeStaff:    'Xodimlar',
    yesterday:      'Kecha',
    tableStatus:    'Stollar holati',
    viewAll:        "Barchasini ko'rish",
    available:      "Bo'sh",
    occupied:       'Band',
    needsBill:      'Hisob kerak',
    orderStats:     'Buyurtmalar statistikasi',
    total:          'Jami',
    recentOrders:   "So'nggi buyurtmalar",
    noRecentOrders: 'Hali buyurtmalar yo\'q',
    revenue7:       'Daromad statistikasi',
    days7:          '7 kun',
    weekTotal:      'Haftalik jami',
    bestSelling:    "Eng ko'p sotilgan taomlar",
    noSales:        'Savdo ma\'lumotlari yo\'q',
    staffActivity:  'Xodimlar faolligi',
    noStaff:        'Xodimlar ma\'lumotlari yuklanmagan',
    new:            'Yangi',
    preparing:      'Tayyorlanmoqda',
    ready:          'Tayyor',
    cancelled:      'Bekor',
    needsBillBadge: 'Hisob kerak',
    paid:           "To'langan",
    active:         'Faol',
    ordersUnit:     'buyurtma',
    pcs:            'ta',
    revenue:        'Daromad',
    categories:     'kategoriya',
    activeTables:   'faol',
    noOrders:       'Buyurtma yo\'q',
    vsYesterday:    'kechaga nisbatan',
    totalStaff:     'jami',
  },
  ru: {
    greeting:       (n) => `Добро пожаловать, ${n}! 👋`,
    subtitle:       'Вот что сегодня происходит в Zar Kebab.',
    todayRevenue:   'Доход сегодня',
    orders:         'Заказы',
    totalTables:    'Всего столов',
    menuItems:      'Позиций меню',
    activeStaff:    'Сотрудники',
    yesterday:      'Вчера',
    tableStatus:    'Статус столов',
    viewAll:        'Смотреть все',
    available:      'Свободен',
    occupied:       'Занят',
    needsBill:      'Нужен счёт',
    orderStats:     'Статистика заказов',
    total:          'Всего',
    recentOrders:   'Последние заказы',
    noRecentOrders: 'Заказов пока нет',
    revenue7:       'Статистика дохода',
    days7:          '7 дней',
    weekTotal:      'Итого за неделю',
    bestSelling:    'Самые продаваемые',
    noSales:        'Данных о продажах нет',
    staffActivity:  'Активность персонала',
    noStaff:        'Данные о персонале не загружены',
    new:            'Новый',
    preparing:      'Готовится',
    ready:          'Готово',
    cancelled:      'Отменён',
    needsBillBadge: 'Нужен счёт',
    paid:           'Оплачен',
    active:         'Активен',
    ordersUnit:     'заказов',
    pcs:            'шт',
    revenue:        'Доход',
    categories:     'категорий',
    activeTables:   'активных',
    noOrders:       'Нет заказов',
    vsYesterday:    'vs вчера',
    totalStaff:     'всего',
  },
  en: {
    greeting:       (n) => `Welcome back, ${n}! 👋`,
    subtitle:       "Here's what's happening at Zar Kebab today.",
    todayRevenue:   "Today's Revenue",
    orders:         'Orders',
    totalTables:    'Total Tables',
    menuItems:      'Menu Items',
    activeStaff:    'Staff',
    yesterday:      'Yesterday',
    tableStatus:    'Table Status',
    viewAll:        'View all',
    available:      'Available',
    occupied:       'Occupied',
    needsBill:      'Needs Bill',
    orderStats:     'Order Statistics',
    total:          'Total',
    recentOrders:   'Recent Orders',
    noRecentOrders: 'No recent orders yet',
    revenue7:       'Revenue Statistics',
    days7:          '7 days',
    weekTotal:      'Weekly total',
    bestSelling:    'Best-Selling Dishes',
    noSales:        'No sales data yet',
    staffActivity:  'Staff Activity',
    noStaff:        'Staff data will appear after users are connected',
    new:            'New',
    preparing:      'Preparing',
    ready:          'Ready',
    cancelled:      'Cancelled',
    needsBillBadge: 'Needs Bill',
    paid:           'Paid',
    active:         'Active',
    ordersUnit:     'orders',
    pcs:            'pcs',
    revenue:        'Revenue',
    categories:     'categories',
    activeTables:   'active',
    noOrders:       'No orders',
    vsYesterday:    'vs yesterday',
    totalStaff:     'total',
  },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function dateKey(isoOrDate) {
  return new Date(isoOrDate).toDateString()
}

function elapsedSince(iso) {
  if (!iso) return ''
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (diff < 1)  return '< 1 min'
  if (diff < 60) return `${diff} min`
  return `${Math.floor(diff / 60)}h ${diff % 60}m`
}

function last7DayKeys() {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    return d.toDateString()
  })
}

function shortDay(dateString) {
  return new Date(dateString).toLocaleDateString('en', { weekday: 'short' })
}

// ── Sub-components ────────────────────────────────────────────────────────────

const ROLE_LABELS = {
  owner:       { uz: 'Egasi',      ru: 'Владелец',      en: 'Owner'       },
  admin:       { uz: 'Admin',      ru: 'Администратор', en: 'Admin'       },
  waiter:      { uz: 'Ofitsiant',  ru: 'Официант',      en: 'Waiter'      },
  cashier:     { uz: 'Kassir',     ru: 'Кассир',        en: 'Cashier'     },
  kitchen:     { uz: 'Oshxona',    ru: 'Кухня',         en: 'Kitchen'     },
  stakeholder: { uz: 'Stakeholder', ru: 'Стейкхолдер',  en: 'Stakeholder' },
}

function KpiCard({ icon: Icon, label, value, sub, subColor, iconBg, iconColor, badge }) {
  return (
    <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm p-5 flex flex-col gap-3 min-w-0">
      <div className="flex items-start justify-between gap-2">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
          <Icon size={18} className={iconColor} />
        </div>
        {badge && (
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5 whitespace-nowrap ${badge.cls}`}>
            {badge.up ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
            {badge.text}
          </span>
        )}
      </div>
      <div>
        <p className="font-black text-[#1F2937] text-2xl leading-none mb-1 truncate">{value}</p>
        <p className="text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wider">{label}</p>
        {sub !== undefined && (
          <p className={`text-[11px] mt-0.5 ${subColor || 'text-[#9CA3AF]'}`}>{sub}</p>
        )}
      </div>
    </div>
  )
}

function TableChip({ table, lang }) {
  const l = L[lang] || L.en
  const cfg = {
    available:  { bg: 'bg-green-50',  border: 'border-green-100',  text: 'text-[#16A34A]', dot: 'bg-[#16A34A]', label: l.available  },
    occupied:   { bg: 'bg-orange-50', border: 'border-orange-100', text: 'text-[#ff5a00]', dot: 'bg-[#ff5a00]', label: l.occupied   },
    needs_bill: { bg: 'bg-red-50',    border: 'border-red-100',    text: 'text-[#DC2626]', dot: 'bg-[#DC2626]', label: l.needsBill  },
  }
  const c = cfg[table.status] || cfg.available
  return (
    <div className={`${c.bg} border ${c.border} rounded-xl p-2.5 flex flex-col items-center gap-1 min-w-[58px]`}>
      <p className={`font-black text-sm leading-none ${c.text}`}>
        {table.name.replace(/table\s*/i, '').trim() || table.name}
      </p>
      <div className="flex items-center gap-1">
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${c.dot}`} />
        <p className={`text-[9px] font-semibold ${c.text} truncate max-w-[52px]`}>{c.label}</p>
      </div>
    </div>
  )
}

function OrderStatusBar({ label, count, total, colorClass }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2 w-32 flex-shrink-0">
        <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${colorClass}`} />
        <span className="text-[12px] text-[#6B7280] font-medium truncate">{label}</span>
      </div>
      <div className="flex-1 bg-[#F3F4F6] rounded-full h-2">
        <div className={`h-2 rounded-full transition-all ${colorClass}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center gap-1 w-16 justify-end flex-shrink-0">
        <span className="text-[12px] font-bold text-[#1F2937]">{count}</span>
        <span className="text-[10px] text-[#9CA3AF]">({pct}%)</span>
      </div>
    </div>
  )
}

function OrderBadge({ status, lang }) {
  const l = L[lang] || L.en
  const map = {
    sent_to_kitchen: { cls: 'bg-blue-50 text-blue-600 border-blue-100',      label: l.new            },
    new:             { cls: 'bg-blue-50 text-blue-600 border-blue-100',      label: l.new            },
    preparing:       { cls: 'bg-orange-50 text-[#ff5a00] border-orange-100', label: l.preparing      },
    needs_bill:      { cls: 'bg-red-50 text-[#DC2626] border-red-100',       label: l.needsBillBadge },
    ready:           { cls: 'bg-green-50 text-[#16A34A] border-green-100',   label: l.ready          },
    paid:            { cls: 'bg-gray-100 text-[#6B7280] border-gray-200',    label: l.paid           },
    cancelled:       { cls: 'bg-gray-100 text-[#6B7280] border-gray-200',    label: l.cancelled      },
  }
  const c = map[status] || map.new
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${c.cls}`}>
      {c.label}
    </span>
  )
}

// Pure-CSS bar chart from real 7-day data
function RevenueChart({ weekData, lang }) {
  const l = L[lang] || L.en
  const maxVal = Math.max(...weekData.map(d => d.revenue), 1)
  const weekTotal = weekData.reduce((s, d) => s + d.revenue, 0)
  const todayKey  = new Date().toDateString()

  return (
    <div>
      <div className="flex items-end gap-1.5 h-28">
        {weekData.map((d, i) => {
          const pct    = Math.round((d.revenue / maxVal) * 100)
          const isToday = d.dateKey === todayKey
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
              <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-[#1F2937] text-white text-[9px] font-semibold px-1.5 py-0.5 rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                {d.revenue > 0 ? `${(d.revenue / 1000).toFixed(0)}K` : '0'}
              </div>
              <div className="w-full flex items-end" style={{ height: '96px' }}>
                <div
                  className={`w-full rounded-t-lg transition-all min-h-[3px] ${
                    isToday ? 'bg-[#ff5a00]' : d.revenue > 0 ? 'bg-[#FED7AA] group-hover:bg-[#FDBA74]' : 'bg-[#F3F4F6]'
                  }`}
                  style={{ height: `${Math.max(pct, 3)}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex gap-1.5 mt-2">
        {weekData.map((d, i) => (
          <p key={i} className={`flex-1 text-center text-[10px] font-semibold ${
            d.dateKey === todayKey ? 'text-[#ff5a00]' : 'text-[#9CA3AF]'
          }`}>
            {shortDay(d.dateKey)}
          </p>
        ))}
      </div>
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#F3F4F6]">
        <p className="text-[11px] text-[#6B7280]">{l.weekTotal}</p>
        <p className="text-[13px] font-black text-[#1F2937]">{formatCurrency(weekTotal)}</p>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const { state }  = useApp()
  const { profile } = useAuth()
  const lang = state.lang
  const l    = L[lang] || L.en

  const displayName = profile?.full_name || state.user?.name || 'Admin'

  // ── Staff: fetch real profiles from Supabase ──────────────────────────────
  const [staffProfiles, setStaffProfiles] = useState(null) // null = loading, [] = empty

  useEffect(() => {
    getAllProfiles()
      .then(({ data }) => setStaffProfiles(data || []))
      .catch(() => setStaffProfiles([]))
  }, [])

  // ── Date keys ─────────────────────────────────────────────────────────────
  const todayKey     = new Date().toDateString()
  const yesterdayKey = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toDateString() })()

  // ── Revenue KPI ───────────────────────────────────────────────────────────
  const { todayRevenue, yesterdayRevenue, revenueChange } = useMemo(() => {
    const paidOrders = state.orders.filter(o => o.payment_status === 'paid')
    const today = paidOrders
      .filter(o => dateKey(o.created_at) === todayKey)
      .reduce((s, o) => s + (o.total || 0), 0)
    const yesterday = paidOrders
      .filter(o => dateKey(o.created_at) === yesterdayKey)
      .reduce((s, o) => s + (o.total || 0), 0)
    const change = yesterday > 0
      ? Math.round(((today - yesterday) / yesterday) * 100)
      : null
    return { todayRevenue: today, yesterdayRevenue: yesterday, revenueChange: change }
  }, [state.orders, todayKey, yesterdayKey])

  // ── Orders KPI ────────────────────────────────────────────────────────────
  const { todayOrderCount, activeOrderCount } = useMemo(() => {
    const todayAll  = state.orders.filter(o => dateKey(o.created_at) === todayKey)
    const active    = state.orders.filter(o => o.payment_status !== 'paid' && o.status !== 'cancelled')
    return { todayOrderCount: todayAll.length, activeOrderCount: active.length }
  }, [state.orders, todayKey])

  // ── Table stats ───────────────────────────────────────────────────────────
  const tableStats = useMemo(() => ({
    total:     state.tables.length,
    available: state.tables.filter(t => t.status === 'available').length,
    occupied:  state.tables.filter(t => t.status === 'occupied').length,
    needsBill: state.tables.filter(t => t.status === 'needs_bill').length,
  }), [state.tables])

  // ── Menu KPI ──────────────────────────────────────────────────────────────
  const realCategoryCount = useMemo(
    () => state.categories.filter(c => c.id !== 'all').length,
    [state.categories]
  )

  // ── Order status breakdown ────────────────────────────────────────────────
  const statusCounts = useMemo(() => {
    const active = state.orders.filter(o => o.payment_status !== 'paid' && o.status !== 'cancelled')
    return {
      new:       active.filter(o => ['sent_to_kitchen', 'new'].includes(o.status)).length,
      preparing: active.filter(o => o.status === 'preparing').length,
      ready:     active.filter(o => o.status === 'ready').length,
      cancelled: state.orders.filter(o => o.status === 'cancelled').length,
    }
  }, [state.orders])
  const totalStatusCount = Object.values(statusCounts).reduce((a, b) => a + b, 0)

  // ── Recent orders — grouped by table session (same as cashier) ────────────
  const recentOrders = useMemo(() => {
    const byTable = {}
    state.orders.forEach(o => {
      const isPaid = o.payment_status === 'paid' || o.status === 'paid' || o.status === 'completed'
      const key = isPaid
        ? `${o.table_id}::${(o.paid_at || o.created_at || '').slice(0, 16)}`
        : o.table_id
      if (!byTable[key]) {
        byTable[key] = { ...o, items: [...(o.items || [])], _total: Number(o.total) || 0 }
      } else {
        byTable[key].items  = [...byTable[key].items, ...(o.items || [])]
        byTable[key]._total += Number(o.total) || 0
        if (new Date(o.created_at) > new Date(byTable[key].created_at)) {
          byTable[key].created_at = o.created_at
        }
        const priority = ['needs_bill', 'preparing', 'sent_to_kitchen', 'delivered', 'paid']
        for (const p of priority) {
          if (byTable[key].status === p) break
          if (o.status === p) { byTable[key].status = p; break }
        }
      }
    })
    return Object.values(byTable)
      .map(o => ({ ...o, total: o._total }))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 5)
  }, [state.orders])

  // ── 7-day revenue chart from real paid orders ─────────────────────────────
  const weekData = useMemo(() => {
    const days = last7DayKeys()
    const paidOrders = state.orders.filter(o => o.payment_status === 'paid')
    return days.map(dk => ({
      dateKey: dk,
      revenue: paidOrders
        .filter(o => dateKey(o.created_at) === dk)
        .reduce((s, o) => s + (o.total || 0), 0),
    }))
  }, [state.orders])

  // ── Best-selling: computed from real order items ──────────────────────────
  const bestSelling = useMemo(() => {
    const totals = {} // menu_item_id → { name, qty, revenue, menuItemId }
    state.orders.forEach(order => {
      ;(order.items || []).forEach(item => {
        const key = item.menu_item_id || item.name
        if (!totals[key]) {
          totals[key] = { menuItemId: item.menu_item_id, name: item.name, qty: 0, revenue: 0 }
        }
        totals[key].qty     += item.quantity || 1
        totals[key].revenue += (item.price || 0) * (item.quantity || 1)
      })
    })
    // Enrich with menuItems image
    const menuItemMap = Object.fromEntries(state.menuItems.map(m => [m.id, m]))
    return Object.values(totals)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5)
      .map(row => ({
        ...row,
        image_url: menuItemMap[row.menuItemId]?.image_url || '',
      }))
  }, [state.orders, state.menuItems])

  // ── Staff activity: profiles + order count by waiter_name ────────────────
  const staffActivity = useMemo(() => {
    if (!staffProfiles || staffProfiles.length === 0) return []
    // Count orders per waiter_name (case-insensitive match against full_name)
    const ordersByName = {}
    state.orders.forEach(o => {
      if (o.waiter_name) {
        const key = o.waiter_name.toLowerCase()
        ordersByName[key] = (ordersByName[key] || 0) + 1
      }
    })
    return staffProfiles
      .filter(p => p.status === 'active')
      .map(p => ({
        id:       p.id,
        name:     p.full_name || p.email || 'Unknown',
        role:     p.role || 'staff',
        initial:  (p.full_name || p.email || '?')[0].toUpperCase(),
        orders:   ordersByName[(p.full_name || '').toLowerCase()] || 0,
        status:   p.status,
      }))
      .sort((a, b) => b.orders - a.orders)
      .slice(0, 5)
  }, [staffProfiles, state.orders])

  // ── Revenue badge ─────────────────────────────────────────────────────────
  const revenueBadge = revenueChange !== null
    ? {
        text: `${revenueChange > 0 ? '+' : ''}${revenueChange}% ${l.vsYesterday}`,
        cls:  revenueChange >= 0 ? 'bg-green-50 text-[#16A34A]' : 'bg-red-50 text-[#DC2626]',
        up:   revenueChange >= 0,
      }
    : null

  // ── Donut chart segments ──────────────────────────────────────────────────
  const donutSegments = [
    { count: statusCounts.new,       color: '#3B82F6' },
    { count: statusCounts.preparing, color: '#ff5a00' },
    { count: statusCounts.ready,     color: '#16A34A' },
    { count: statusCounts.cancelled, color: '#D1D5DB' },
  ]

  return (
    <AppShell title={l.greeting(displayName)}>
      <div className="p-5 xl:p-6 max-w-[1400px] mx-auto">

        {/* Page header */}
        <div className="mb-6">
          <h2 className="font-black text-[#1F2937] text-xl leading-tight">{l.greeting(displayName)}</h2>
          <p className="text-sm text-[#6B7280] mt-0.5">{l.subtitle}</p>
        </div>

        {/* ── KPI cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
          <KpiCard
            icon={TrendingUp}
            label={l.todayRevenue}
            value={formatCurrency(todayRevenue)}
            sub={`${l.yesterday}: ${formatCurrency(yesterdayRevenue)}`}
            badge={revenueBadge}
            iconBg="bg-green-50"
            iconColor="text-[#16A34A]"
          />
          <KpiCard
            icon={ShoppingBag}
            label={l.orders}
            value={todayOrderCount}
            sub={`${activeOrderCount} ${l.activeTables}`}
            subColor={activeOrderCount > 0 ? 'text-[#ff5a00]' : 'text-[#9CA3AF]'}
            iconBg="bg-orange-50"
            iconColor="text-[#ff5a00]"
          />
          <KpiCard
            icon={Table2}
            label={l.totalTables}
            value={tableStats.total}
            sub={`${tableStats.available} ${l.available}`}
            subColor="text-[#16A34A]"
            iconBg="bg-blue-50"
            iconColor="text-blue-600"
          />
          <KpiCard
            icon={UtensilsCrossed}
            label={l.menuItems}
            value={state.menuItems.length}
            sub={`${realCategoryCount} ${l.categories}`}
            iconBg="bg-purple-50"
            iconColor="text-purple-600"
          />
          <KpiCard
            icon={Users}
            label={l.activeStaff}
            value={staffProfiles === null ? '…' : staffProfiles.filter(p => p.status === 'active').length}
            sub={staffProfiles === null ? '' : `${staffProfiles.length} ${l.totalStaff}`}
            iconBg="bg-pink-50"
            iconColor="text-pink-600"
          />
        </div>

        {/* ── Main grid ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* LEFT (2 cols) */}
          <div className="lg:col-span-2 flex flex-col gap-4">

            {/* Table status */}
            <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm p-5">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h3 className="font-black text-[#1F2937] text-[14px]">{l.tableStatus}</h3>
                <div className="flex items-center gap-3 text-[10px] text-[#6B7280]">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-[#16A34A]" />
                    {l.available} ({tableStats.available})
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-[#ff5a00]" />
                    {l.occupied} ({tableStats.occupied})
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-[#DC2626]" />
                    {l.needsBill} ({tableStats.needsBill})
                  </span>
                </div>
              </div>
              {state.tables.length === 0 ? (
                <p className="text-sm text-[#9CA3AF] text-center py-4">{l.noOrders}</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {state.tables.map(table => (
                    <TableChip key={table.id} table={table} lang={lang} />
                  ))}
                </div>
              )}
            </div>

            {/* Revenue chart */}
            <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-black text-[#1F2937] text-[14px]">{l.revenue7}</h3>
                <span className="text-[11px] text-[#6B7280] bg-gray-50 px-2 py-1 rounded-lg font-semibold">{l.days7}</span>
              </div>
              <RevenueChart weekData={weekData} lang={lang} />
            </div>

            {/* Best-selling */}
            <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm p-5">
              <h3 className="font-black text-[#1F2937] text-[14px] mb-4">{l.bestSelling}</h3>
              {bestSelling.length === 0 ? (
                <p className="text-sm text-[#9CA3AF] text-center py-6">{l.noSales}</p>
              ) : (
                <div className="space-y-1">
                  {bestSelling.map((item, i) => (
                    <div key={item.menuItemId || i} className="flex items-center gap-3 py-2 border-b border-[#F3F4F6] last:border-0">
                      <span className="w-6 text-center text-[12px] font-black text-[#9CA3AF] flex-shrink-0">
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                      </span>
                      {item.image_url ? (
                        <img
                          src={item.image_url}
                          alt={item.name}
                          className="w-10 h-10 rounded-xl object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-xl bg-gray-100 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-[#1F2937] truncate">{item.name}</p>
                        <p className="text-[11px] text-[#9CA3AF]">{item.qty} {l.pcs}</p>
                      </div>
                      <p className="text-[13px] font-black text-[#1F2937] flex-shrink-0">{formatCurrency(item.revenue)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT col */}
          <div className="flex flex-col gap-4">

            {/* Order statistics */}
            <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-black text-[#1F2937] text-[14px]">{l.orderStats}</h3>
                <span className="text-[11px] text-[#6B7280] font-semibold">{l.total}: {totalStatusCount}</span>
              </div>

              {/* SVG donut */}
              <div className="flex items-center justify-center mb-4">
                <div className="relative w-28 h-28">
                  <svg viewBox="0 0 36 36" className="w-28 h-28 -rotate-90">
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="#F3F4F6" strokeWidth="3" />
                    {(() => {
                      const circumference = 2 * Math.PI * 15.9
                      let offset = 0
                      return donutSegments.map((seg, i) => {
                        const pct  = totalStatusCount > 0 ? seg.count / totalStatusCount : 0
                        const dash = pct * circumference
                        const el   = (
                          <circle key={i} cx="18" cy="18" r="15.9" fill="none"
                            stroke={seg.color} strokeWidth="3"
                            strokeDasharray={`${dash} ${circumference - dash}`}
                            strokeDashoffset={-offset}
                          />
                        )
                        offset += dash
                        return el
                      })
                    })()}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <p className="font-black text-[#1F2937] text-xl leading-none">{totalStatusCount}</p>
                    <p className="text-[9px] text-[#9CA3AF] font-semibold">{l.total}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2.5">
                <OrderStatusBar label={l.new}       count={statusCounts.new}       total={totalStatusCount} colorClass="bg-blue-500"    />
                <OrderStatusBar label={l.preparing} count={statusCounts.preparing} total={totalStatusCount} colorClass="bg-[#ff5a00]"   />
                <OrderStatusBar label={l.ready}     count={statusCounts.ready}     total={totalStatusCount} colorClass="bg-[#16A34A]"   />
                <OrderStatusBar label={l.cancelled} count={statusCounts.cancelled} total={totalStatusCount} colorClass="bg-gray-300"    />
              </div>
            </div>

            {/* Recent orders */}
            <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm p-5">
              <h3 className="font-black text-[#1F2937] text-[14px] mb-4">{l.recentOrders}</h3>
              {recentOrders.length === 0 ? (
                <p className="text-sm text-[#9CA3AF] text-center py-6">{l.noRecentOrders}</p>
              ) : (
                <div className="space-y-2.5">
                  {recentOrders.map(order => {
                    const items    = order.items || []
                    const summary  = items.slice(0, 2).map(i => i.name).join(', ')
                    const more     = items.length > 2 ? ` +${items.length - 2}` : ''
                    return (
                      <div key={order.id} className="flex items-start gap-3 py-2 border-b border-[#F3F4F6] last:border-0">
                        <div className="w-8 h-8 rounded-xl bg-orange-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <ShoppingBag size={14} className="text-[#ff5a00]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                            <p className="text-[13px] font-bold text-[#1F2937]">{order.table_name}</p>
                            <OrderBadge status={order.status} lang={lang} />
                          </div>
                          <p className="text-[11px] text-[#9CA3AF] truncate">{summary}{more}</p>
                          <p className="text-[10px] text-[#9CA3AF] flex items-center gap-1 mt-0.5">
                            <Clock size={9} />{elapsedSince(order.created_at)}
                          </p>
                        </div>
                        <p className="text-[12px] font-black text-[#1F2937] flex-shrink-0">{formatCurrency(order.total)}</p>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Staff activity */}
            <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-black text-[#1F2937] text-[14px]">{l.staffActivity}</h3>
                {staffProfiles !== null && staffProfiles.length > 0 && (
                  <span className="text-[11px] text-[#6B7280] font-semibold">{staffProfiles.length} {l.totalStaff}</span>
                )}
              </div>

              {staffProfiles === null ? (
                /* Loading */
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="flex items-center gap-3 animate-pulse">
                      <div className="w-8 h-8 rounded-xl bg-gray-100 flex-shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-2.5 bg-gray-100 rounded w-2/3" />
                        <div className="h-2 bg-gray-100 rounded w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : staffActivity.length === 0 ? (
                <p className="text-sm text-[#9CA3AF] text-center py-6 leading-snug">{l.noStaff}</p>
              ) : (
                <div className="space-y-2.5">
                  {staffActivity.map(staff => (
                    <div key={staff.id} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-[#6B7280] text-xs font-black">{staff.initial}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-bold text-[#1F2937] truncate">{staff.name}</p>
                        <p className="text-[10px] text-[#9CA3AF]">{(ROLE_LABELS[staff.role]?.[lang] || ROLE_LABELS[staff.role]?.en) ?? staff.role} · {staff.orders} {l.ordersUnit}</p>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-green-50 text-[#16A34A] border-green-100">
                        {l.active}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    </AppShell>
  )
}
