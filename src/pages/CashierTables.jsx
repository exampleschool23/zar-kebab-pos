import React, { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Receipt, CreditCard, Menu as MenuIcon, Clock, Users, Search,
  ChevronDown, Table2, Banknote, Monitor, QrCode,
  UtensilsCrossed, ArrowUpDown, X, HelpCircle,
} from 'lucide-react'
import { useApp } from '../store/AppContext'
import { formatCurrency } from '../lib/formatCurrency'
import UnifiedSidebar from '../components/UnifiedSidebar'

// ── Helpers ───────────────────────────────────────────────────────────────────

function elapsedSince(iso) {
  if (!iso) return null
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (diff < 1) return '< 1 min'
  if (diff < 60) return `${diff} min`
  return `${Math.floor(diff / 60)}h ${diff % 60}m`
}

function timeLabel(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// ── Localisation ──────────────────────────────────────────────────────────────
const L = {
  uz: {
    title:           'Kassir',
    subtitle:        "To'lovlarni qayta ishlash va hisoblarni yopish",
    activeBills:     'Faol hisoblar',
    needsBill:       'Hisob kerak',
    paidToday:       "Bugun to'langan",
    todayRevenue:    'Bugungi daromad',
    payMethods:      "Bugungi to'lov usullari",
    tables:          'stol',
    waitingPay:      "To'lovni kutmoqda",
    completed:       'Yakunlangan',
    totalCollected:  "Jami yig'ilgan",
    activeBillsSec:  'Faol hisoblar',
    search:          'Stol, ofitsiant yoki mahsulot qidirish...',
    allWaiters:      'Barcha ofitsiantlar',
    allStatus:       'Barcha holat',
    occupied:        'Band',
    needsBillBadge:  'Hisob kerak',
    newestFirst:     'Yangi avval',
    oldestFirst:     'Eski avval',
    highestAmt:      "Yuqori summa",
    lowestAmt:       "Quyi summa",
    openBill:        'Hisobni ochish',
    moreItems:       'ta mahsulot ko\'proq',
    waiter:          'Ofitsiant',
    opened:          'Ochildi',
    items:           'mahsulot',
    noActiveBills:   'Faol hisoblar yo\'q',
    noActiveSub:     "Hech qanday stol to'lov kutmaydi",
    infoBar:         "Buyurtma tafsilotlarini ko'rish, to'lovni qayta ishlash va chek chiqarish uchun stol hisobini tanlang.",
    viewAllTables:   "Barcha stollarni ko'rish",
    noPayData:       "To'lov ma'lumotlari yo'q",
    waitingKitchen:  'Oshxona tayyorlayapti',
    waitingKitchenSub: 'Ofitsiant hisob so\'rashini kuting',
    payments:        n => `${n} ta to'lov`,
    ofTodayRev:      'bugungi daromaddan',
  },
  ru: {
    title:           'Кассир',
    subtitle:        'Обработка платежей и закрытие счетов',
    activeBills:     'Активные счета',
    needsBill:       'Нужен счёт',
    paidToday:       'Оплачено сегодня',
    todayRevenue:    'Доход за день',
    payMethods:      'Способы оплаты сегодня',
    tables:          'столов',
    waitingPay:      'Ожидают оплаты',
    completed:       'Завершённые',
    totalCollected:  'Всего собрано',
    activeBillsSec:  'Активные счета',
    search:          'Поиск по столу, официанту или блюду...',
    allWaiters:      'Все официанты',
    allStatus:       'Все статусы',
    occupied:        'Занят',
    needsBillBadge:  'Нужен счёт',
    newestFirst:     'Сначала новые',
    oldestFirst:     'Сначала старые',
    highestAmt:      'Высокая сумма',
    lowestAmt:       'Низкая сумма',
    openBill:        'Открыть счёт',
    moreItems:       'ещё позиций',
    waiter:          'Официант',
    opened:          'Открыт',
    items:           'позиций',
    noActiveBills:   'Нет активных счетов',
    noActiveSub:     'Ни один стол не ожидает оплаты',
    infoBar:         'Выберите счёт стола, чтобы просмотреть детали заказа, обработать оплату и распечатать чек.',
    viewAllTables:   'Все столы',
    noPayData:       'Нет данных об оплате',
    waitingKitchen:  'Готовится на кухне',
    waitingKitchenSub: 'Ожидайте запроса счёта от официанта',
    payments:        n => `${n} платёж${n === 1 ? '' : n < 5 ? 'а' : 'ей'}`,
    ofTodayRev:      'от дневной выручки',
  },
  en: {
    title:           'Cashier',
    subtitle:        'Process payments and close bills',
    activeBills:     'Active Bills',
    needsBill:       'Needs Bill',
    paidToday:       'Paid Today',
    todayRevenue:    'Today Revenue',
    payMethods:      'Payment Methods Today',
    tables:          'tables',
    waitingPay:      'Waiting for payment',
    completed:       'Completed orders',
    totalCollected:  'Total collected',
    activeBillsSec:  'Active Bills',
    search:          'Search by table, waiter or customer...',
    allWaiters:      'All Waiters',
    allStatus:       'All Status',
    occupied:        'Occupied',
    needsBillBadge:  'Needs Bill',
    newestFirst:     'Newest First',
    oldestFirst:     'Oldest First',
    highestAmt:      'Highest Amount',
    lowestAmt:       'Lowest Amount',
    openBill:        'Open Bill',
    moreItems:       'more items',
    waiter:          'Waiter',
    opened:          'Opened',
    items:           'items',
    noActiveBills:   'No active bills',
    noActiveSub:     'No tables need payment right now',
    infoBar:         'Select a table bill to view order details, process payment and print receipt.',
    viewAllTables:   'View All Tables',
    noPayData:       'No payments today yet',
    waitingKitchen:  'Waiting for kitchen',
    waitingKitchenSub: 'Waiter must request the bill first',
    payments:        n => `${n} payment${n === 1 ? '' : 's'}`,
    ofTodayRev:      "of today's revenue",
  },
}

const PAY_METHOD_CONFIG = [
  { key: 'cash',     icon: Banknote,    color: '#16A34A', labelEn: 'Cash',     labelUz: 'Naqd',      labelRu: 'Наличные'    },
  { key: 'card',     icon: CreditCard,  color: '#7C3AED', labelEn: 'Card',     labelUz: 'Karta',     labelRu: 'Карта'       },
  { key: 'terminal', icon: Monitor,     color: '#2563EB', labelEn: 'Terminal', labelUz: 'Terminal',  labelRu: 'Терминал'    },
  { key: 'qr',       icon: QrCode,      color: '#D97706', labelEn: 'QR Code',  labelUz: 'QR Code',   labelRu: 'QR Код'      },
  { key: 'unknown',  icon: HelpCircle,  color: '#9CA3AF', labelEn: 'Unknown',  labelUz: "Noma'lum",  labelRu: 'Неизвестно'  },
]

const SORT_OPTIONS = (l) => [
  { key: 'newest',  label: l.newestFirst },
  { key: 'oldest',  label: l.oldestFirst },
  { key: 'highest', label: l.highestAmt  },
  { key: 'lowest',  label: l.lowestAmt   },
]

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, accent, icon: Icon, iconBg, iconColor }) {
  return (
    <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm p-5">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
          <Icon size={18} className={iconColor} />
        </div>
      </div>
      <p className={`font-black text-2xl leading-none mb-1 ${accent}`}>{value}</p>
      <p className="text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wider">{label}</p>
      {sub && <p className="text-[11px] text-[#9CA3AF] mt-0.5">{sub}</p>}
    </div>
  )
}

function TableStatusBadge({ status, lang }) {
  const l = L[lang] || L.en
  if (status === 'needs_bill') {
    return (
      <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-red-50 text-[#DC2626] border border-red-100">
        {l.needsBillBadge}
      </span>
    )
  }
  return (
    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-orange-50 text-[#ff5a00] border border-orange-100">
      {l.occupied}
    </span>
  )
}

function BillCard({ order, table, menuItemMap, lang, onOpen }) {
  const l = L[lang] || L.en

  // Group same menu items together and sum quantities
  const items = useMemo(() => {
    const map = {}
    ;(order.items || []).forEach(item => {
      const key = item.menu_item_id || item.name
      if (!map[key]) {
        map[key] = { ...item }
      } else {
        map[key] = { ...map[key], quantity: (map[key].quantity || 1) + (item.quantity || 1) }
      }
    })
    return Object.values(map)
  }, [order.items])

  const preview   = items.slice(0, 4)
  const moreCount = items.length - preview.length
  const readyForCashier = order.status === 'needs_bill'

  return (
    <div className={`rounded-2xl border flex flex-col transition-all ${
      readyForCashier
        ? 'bg-white border-[#E5E7EB] shadow-sm hover:shadow-md'
        : 'bg-[#FAFAFA] border-[#E5E7EB] opacity-60'
    }`}>

      {/* Card header */}
      <div className="px-5 pt-5 pb-4 border-b border-[#F3F4F6]">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
              readyForCashier ? 'bg-gray-100' : 'bg-gray-50'
            }`}>
              <Users size={16} className="text-[#6B7280]" />
            </div>
            <div className="min-w-0">
              <h3 className="font-black text-[#1F2937] text-[16px] leading-tight">{order.table_name}</h3>
              {order.waiter_name && (
                <p className="text-[11px] text-[#9CA3AF]">{l.waiter}: {order.waiter_name}</p>
              )}
            </div>
          </div>
          <TableStatusBadge status={table?.status || order.status} lang={lang} />
        </div>

        <div className="flex items-center gap-4 mt-3 text-[11px] text-[#9CA3AF]">
          <span className="flex items-center gap-1">
            <Clock size={11} />
            {l.opened} {elapsedSince(order.created_at)}
            {order.created_at && <span className="text-[#D1D5DB]">({timeLabel(order.created_at)})</span>}
          </span>
          <span>{items.length} {l.items}</span>
        </div>
      </div>

      {/* Total */}
      <div className="px-5 pt-4 pb-3">
        <p className={`font-black text-[26px] leading-none mb-4 ${readyForCashier ? 'text-[#ff5a00]' : 'text-[#9CA3AF]'}`}>
          {formatCurrency(order.total)}
        </p>

        {/* Item preview */}
        <div className="space-y-2.5">
          {preview.map((item, i) => {
            const mi = menuItemMap[item.menu_item_id]
            const lineTotal = (item.price || 0) * (item.quantity || 1)
            return (
              <div key={i} className="flex items-center gap-3">
                {mi?.image_url ? (
                  <img
                    src={mi.image_url}
                    alt={item.name}
                    className="w-8 h-8 rounded-lg object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <UtensilsCrossed size={12} className="text-gray-300" />
                  </div>
                )}
                <p className="flex-1 text-[13px] text-[#1F2937] font-medium truncate">{item.name}</p>
                <span className="text-[12px] text-[#9CA3AF] flex-shrink-0 w-8 text-center">×{item.quantity}</span>
                <span className="text-[13px] font-semibold text-[#1F2937] flex-shrink-0 w-24 text-right">
                  {formatCurrency(lineTotal)}
                </span>
              </div>
            )
          })}
          {moreCount > 0 && (
            <p className="text-[12px] text-[#ff5a00] font-semibold pt-0.5">
              +{moreCount} {l.moreItems}
            </p>
          )}
        </div>
      </div>

      {/* Open bill button */}
      <div className="px-5 pb-5 mt-auto pt-3">
        {readyForCashier ? (
          <button
            onClick={() => onOpen(order.table_id)}
            className="w-full flex items-center justify-center gap-2 bg-[#ff5a00] text-white rounded-xl py-3 text-[14px] font-bold hover:bg-[#cc4800] active:scale-[0.98] transition-all shadow-sm shadow-orange-200"
          >
            <Receipt size={16} />
            {l.openBill}
          </button>
        ) : (
          <div className="w-full flex flex-col items-center justify-center gap-1 bg-gray-100 rounded-xl py-3 px-4 text-center">
            <p className="text-[13px] font-bold text-[#9CA3AF]">{l.waitingKitchen}</p>
            <p className="text-[11px] text-[#9CA3AF]">{l.waitingKitchenSub}</p>
          </div>
        )}
      </div>
    </div>
  )
}

// Simple native-looking dropdown
function FilterSelect({ value, onChange, options, placeholder }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="appearance-none bg-white border border-[#E5E7EB] rounded-xl px-3 py-2 pr-8 text-[13px] text-[#1F2937] font-medium focus:outline-none focus:ring-2 focus:ring-[#ff5a00]/20 focus:border-[#ff5a00] cursor-pointer"
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9CA3AF] pointer-events-none" />
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function CashierTables() {
  const { state, dispatch } = useApp()
  const navigate            = useNavigate()
  const lang                = state.lang
  const l                   = L[lang] || L.en

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [search,      setSearch]      = useState('')
  const [filterWaiter,setFilterWaiter]= useState('all')
  const [filterStatus,setFilterStatus]= useState('all')
  const [sortKey,     setSortKey]     = useState('newest')

  const today = new Date().toDateString()

  // ── Menu item lookup map ────────────────────────────────────────────────────
  const menuItemMap = useMemo(() =>
    Object.fromEntries(state.menuItems.map(m => [m.id, m])),
    [state.menuItems]
  )

  // ── Derive active bills — one merged entry per table ──────────────────────
  const activeBills = useMemo(() => {
    const raw = state.orders.filter(o => o.payment_status !== 'paid' && o.status !== 'cancelled')
    const grouped = {}
    raw.forEach(order => {
      const key = order.table_id
      if (!grouped[key]) {
        grouped[key] = {
          ...order,
          items: [...(order.items || [])],
          total: order.total || 0,
        }
      } else {
        grouped[key].items  = [...grouped[key].items, ...(order.items || [])]
        grouped[key].total  = (grouped[key].total || 0) + (order.total || 0)
        // Keep earliest created_at
        if (new Date(order.created_at) < new Date(grouped[key].created_at)) {
          grouped[key].created_at = order.created_at
        }
        // Escalate to needs_bill if any sub-order is needs_bill
        if (order.status === 'needs_bill') grouped[key].status = 'needs_bill'
      }
    })
    return Object.values(grouped)
  }, [state.orders])

  const paidTodayOrders = useMemo(() =>
    state.orders.filter(o =>
      o.payment_status === 'paid' && new Date(o.created_at).toDateString() === today
    ),
    [state.orders]
  )

  // ── KPI values ─────────────────────────────────────────────────────────────
  const needsBillCount = activeBills.filter(o => o.status === 'needs_bill').length
  const paidTodayCount = useMemo(() => {
    // Count unique tables paid today, not raw order rows
    return new Set(paidTodayOrders.map(o => o.table_id)).size
  }, [paidTodayOrders])
  const todayRevenue   = paidTodayOrders.reduce((s, o) => s + (o.total || 0), 0)

  // Payment method breakdown — tracks { amount, count } per method
  const payMethodTotals = useMemo(() => {
    const KNOWN = ['cash', 'card', 'terminal', 'qr']
    const map = {}
    paidTodayOrders.forEach(o => {
      const raw = (o.payment_method || '').toLowerCase().trim()
      const key = KNOWN.includes(raw) ? raw : 'unknown'
      if (!map[key]) map[key] = { amount: 0, count: 0 }
      map[key].amount += o.total || 0
      map[key].count++
    })
    return map
  }, [paidTodayOrders])

  // ── Unique waiters for dropdown ────────────────────────────────────────────
  const waiterOptions = useMemo(() => {
    const names = [...new Set(activeBills.map(o => o.waiter_name).filter(Boolean))]
    return [
      { value: 'all', label: l.allWaiters },
      ...names.map(n => ({ value: n, label: n })),
    ]
  }, [activeBills, l])

  const statusOptions = [
    { value: 'all',        label: l.allStatus      },
    { value: 'occupied',   label: l.occupied       },
    { value: 'needs_bill', label: l.needsBillBadge },
  ]

  const sortOptions = SORT_OPTIONS(l).map(o => ({ value: o.key, label: o.label }))

  // ── Filtered + sorted bills ────────────────────────────────────────────────
  const filteredBills = useMemo(() => {
    const q = search.toLowerCase().trim()
    let result = activeBills

    // Search
    if (q) {
      result = result.filter(o => {
        const matchTable  = o.table_name?.toLowerCase().includes(q)
        const matchWaiter = o.waiter_name?.toLowerCase().includes(q)
        const matchItems  = (o.items || []).some(i => i.name?.toLowerCase().includes(q))
        return matchTable || matchWaiter || matchItems
      })
    }

    // Waiter filter
    if (filterWaiter !== 'all') {
      result = result.filter(o => o.waiter_name === filterWaiter)
    }

    // Status filter
    if (filterStatus !== 'all') {
      result = result.filter(o => {
        if (filterStatus === 'needs_bill') return o.status === 'needs_bill'
        return o.status !== 'needs_bill' // occupied = everything else active
      })
    }

    // Sort
    return [...result].sort((a, b) => {
      if (sortKey === 'newest')  return new Date(b.created_at) - new Date(a.created_at)
      if (sortKey === 'oldest')  return new Date(a.created_at) - new Date(b.created_at)
      if (sortKey === 'highest') return (b.total || 0) - (a.total || 0)
      if (sortKey === 'lowest')  return (a.total || 0) - (b.total || 0)
      return 0
    })
  }, [activeBills, search, filterWaiter, filterStatus, sortKey])

  // Table lookup
  const tableMap = useMemo(() =>
    Object.fromEntries(state.tables.map(t => [t.id, t])),
    [state.tables]
  )

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

      {/* Main */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

        {/* Header */}
        <header className="flex-shrink-0 bg-white border-b border-[#E5E7EB] px-5 py-3 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 -ml-1 rounded-xl hover:bg-gray-100 transition-colors"
            >
              <MenuIcon size={20} className="text-[#6B7280]" />
            </button>
            <div>
              <p className="font-black text-[#1F2937] text-[16px] leading-tight">{l.title}</p>
              <p className="text-[11px] text-[#6B7280] font-medium">{l.subtitle}</p>
            </div>
          </div>
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
            {['uz', 'ru', 'en'].map(lg => (
              <button
                key={lg}
                onClick={() => dispatch({ type: 'SET_LANG', payload: lg })}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase transition-colors ${
                  lang === lg ? 'bg-white text-[#1F2937] shadow-sm' : 'text-[#6B7280] hover:text-[#1F2937]'
                }`}
              >
                {lg}
              </button>
            ))}
          </div>
        </header>

        {/* Scrollable content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-5">

          {/* ── KPI cards — 4 columns ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <KpiCard
              label={l.activeBills}
              value={activeBills.length}
              sub={`${activeBills.length} ${l.tables}`}
              accent="text-[#ff5a00]"
              icon={Receipt}
              iconBg="bg-orange-50"
              iconColor="text-[#ff5a00]"
            />
            <KpiCard
              label={l.needsBill}
              value={needsBillCount}
              sub={l.waitingPay}
              accent="text-[#DC2626]"
              icon={CreditCard}
              iconBg="bg-red-50"
              iconColor="text-[#DC2626]"
            />
            <KpiCard
              label={l.paidToday}
              value={paidTodayCount}
              sub={l.completed}
              accent="text-[#16A34A]"
              icon={Users}
              iconBg="bg-green-50"
              iconColor="text-[#16A34A]"
            />
            <KpiCard
              label={l.todayRevenue}
              value={formatCurrency(todayRevenue)}
              sub={l.totalCollected}
              accent="text-[#2563EB]"
              icon={Table2}
              iconBg="bg-blue-50"
              iconColor="text-blue-600"
            />
          </div>

          {/* ── Active Bills section ── */}
          <div className="mb-4 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <h2 className="font-black text-[#1F2937] text-[16px]">{l.activeBillsSec}</h2>
              <span className="bg-[#ff5a00] text-white text-[10px] font-black px-2 py-0.5 rounded-full">
                {filteredBills.length}
              </span>
            </div>
          </div>

          {/* ── Filter bar ── */}
          <div className="flex flex-wrap items-center gap-2 mb-5">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={l.search}
                className="w-full pl-9 pr-8 py-2 bg-white border border-[#E5E7EB] rounded-xl text-[13px] text-[#1F2937] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#ff5a00]/20 focus:border-[#ff5a00] transition-all"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#6B7280]">
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Waiter filter */}
            <FilterSelect
              value={filterWaiter}
              onChange={setFilterWaiter}
              options={waiterOptions}
            />

            {/* Status filter */}
            <FilterSelect
              value={filterStatus}
              onChange={setFilterStatus}
              options={statusOptions}
            />

            {/* Sort */}
            <div className="flex items-center gap-1.5">
              <ArrowUpDown size={14} className="text-[#9CA3AF]" />
              <FilterSelect
                value={sortKey}
                onChange={setSortKey}
                options={sortOptions}
              />
            </div>
          </div>

          {/* ── Bill cards ── */}
          {filteredBills.length === 0 ? (
            <div className="max-w-sm mx-auto mt-12">
              <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm p-10 flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-orange-50 rounded-2xl flex items-center justify-center mb-4">
                  <CreditCard size={28} className="text-orange-300" />
                </div>
                <p className="font-black text-[#1F2937] text-base mb-1">{l.noActiveBills}</p>
                <p className="text-sm text-[#6B7280] leading-snug">{l.noActiveSub}</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredBills.map(order => (
                <BillCard
                  key={order.id}
                  order={order}
                  table={tableMap[order.table_id]}
                  menuItemMap={menuItemMap}
                  lang={lang}
                  onOpen={tableId => navigate(`/cashier/bill/${tableId}`)}
                />
              ))}
            </div>
          )}

          {/* ── Bottom info bar ── */}
          <div className="mt-6 bg-white border border-[#E5E7EB] rounded-2xl px-5 py-4 flex items-center justify-between gap-4 shadow-sm">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-orange-50 flex items-center justify-center flex-shrink-0">
                <Receipt size={15} className="text-[#ff5a00]" />
              </div>
              <p className="text-[13px] text-[#6B7280] leading-snug">{l.infoBar}</p>
            </div>
            <button
              onClick={() => navigate('/waiter/tables')}
              className="flex items-center gap-1.5 px-4 py-2 bg-gray-50 border border-[#E5E7EB] rounded-xl text-[13px] text-[#1F2937] font-semibold hover:bg-gray-100 transition-colors flex-shrink-0"
            >
              <Table2 size={14} />
              {l.viewAllTables}
            </button>
          </div>

        </main>
      </div>
    </div>
  )
}
