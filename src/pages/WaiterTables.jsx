import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../store/AppContext'
import { useAuth } from '../contexts/AuthContext'
import { formatCurrency } from '../lib/formatCurrency'
import AppShell from '../components/AppShell'
import {
  UtensilsCrossed, Clock, ChefHat, CheckCircle2,
  Receipt, Coffee, RefreshCw, Layers,
} from 'lucide-react'

// ── Localization ──────────────────────────────────────────────────────────────

const L = {
  en: {
    tables: 'Tables',
    welcome: 'Welcome back',
    refresh: 'Refresh',
    all: 'All',
    available: 'Available',
    waitingKitchen: 'Waiting',
    preparing: 'Preparing',
    readyFromKitchen: 'Ready',
    occupied: 'Occupied',
    needsBill: 'Needs Bill',
    tapToStart: 'Tap to start order',
    itemsNew: n => `${n} new`,
    itemsPreparing: n => `${n} preparing`,
    itemsReady: n => `${n} ready`,
    viewOrder: 'View Order',
    requestBill: 'Request Bill',
    statusGuide: 'Table Status Guide',
    guideAvailable: 'Table is free — tap to take a new order',
    guideWaiting: 'Order sent, kitchen not yet started',
    guidePreparing: 'Kitchen is preparing items',
    guideReady: 'All items ready — confirm delivery',
    guideOccupied: 'Order delivered and eating',
    guideNeedsBill: 'Guest requested the bill',
  },
  ru: {
    tables: 'Столы',
    welcome: 'Добро пожаловать',
    refresh: 'Обновить',
    all: 'Все',
    available: 'Свободен',
    waitingKitchen: 'Ожидание',
    preparing: 'Готовится',
    readyFromKitchen: 'Готово',
    occupied: 'Занят',
    needsBill: 'Счёт',
    tapToStart: 'Нажмите для заказа',
    itemsNew: n => `${n} новых`,
    itemsPreparing: n => `${n} готовится`,
    itemsReady: n => `${n} готово`,
    viewOrder: 'Посмотреть',
    requestBill: 'Запросить счёт',
    statusGuide: 'Статусы столов',
    guideAvailable: 'Стол свободен — нажмите для нового заказа',
    guideWaiting: 'Заказ отправлен, кухня ещё не начала',
    guidePreparing: 'Кухня готовит блюда',
    guideReady: 'Всё готово — подтвердите доставку',
    guideOccupied: 'Заказ доставлен, гость ест',
    guideNeedsBill: 'Гость попросил счёт',
  },
  uz: {
    tables: 'Stollar',
    welcome: 'Xush kelibsiz',
    refresh: 'Yangilash',
    all: 'Hammasi',
    available: 'Bo\'sh',
    waitingKitchen: 'Kutilmoqda',
    preparing: 'Tayyorlanmoqda',
    readyFromKitchen: 'Tayyor',
    occupied: 'Band',
    needsBill: 'Hisob',
    tapToStart: 'Buyurtma boshlash uchun bosing',
    itemsNew: n => `${n} yangi`,
    itemsPreparing: n => `${n} tayyorlanmoqda`,
    itemsReady: n => `${n} tayyor`,
    viewOrder: 'Ko\'rish',
    requestBill: 'Hisob so\'rash',
    statusGuide: 'Stol holatlari',
    guideAvailable: 'Stol bo\'sh — yangi buyurtma boshlash uchun bosing',
    guideWaiting: 'Buyurtma yuborildi, oshxona hali boshlamadi',
    guidePreparing: 'Oshxona tayyorlamoqda',
    guideReady: 'Hammasi tayyor — yetkazib berishni tasdiqlang',
    guideOccupied: 'Buyurtma yetkazildi, mehmon ovqatlanmoqda',
    guideNeedsBill: 'Mehmon hisob so\'radi',
  },
}

function tr(lang, key, ...args) {
  const v = (L[lang] || L.en)[key]
  if (typeof v === 'function') return v(...args)
  return v ?? key
}

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_CFG = {
  available: {
    border: 'border-emerald-200',
    hoverBorder: 'hover:border-emerald-400',
    bg: 'bg-emerald-50',
    badge: 'bg-emerald-100 text-emerald-700',
    dot: 'bg-emerald-400',
    icon: Coffee,
    chipBg: 'bg-emerald-100 text-emerald-700',
    chipActiveBg: 'bg-emerald-500 text-white',
  },
  waiting_kitchen: {
    border: 'border-amber-200',
    hoverBorder: 'hover:border-amber-400',
    bg: 'bg-amber-50',
    badge: 'bg-amber-100 text-amber-700',
    dot: 'bg-amber-400',
    icon: Clock,
    chipBg: 'bg-amber-100 text-amber-700',
    chipActiveBg: 'bg-amber-500 text-white',
  },
  preparing: {
    border: 'border-orange-200',
    hoverBorder: 'hover:border-orange-400',
    bg: 'bg-orange-50',
    badge: 'bg-orange-100 text-orange-700',
    dot: 'bg-orange-400',
    icon: ChefHat,
    chipBg: 'bg-orange-100 text-orange-700',
    chipActiveBg: 'bg-orange-500 text-white',
  },
  ready: {
    border: 'border-green-300',
    hoverBorder: 'hover:border-green-500',
    bg: 'bg-green-50',
    badge: 'bg-green-100 text-green-700',
    dot: 'bg-green-500',
    icon: CheckCircle2,
    chipBg: 'bg-green-100 text-green-700',
    chipActiveBg: 'bg-green-600 text-white',
  },
  occupied: {
    border: 'border-blue-200',
    hoverBorder: 'hover:border-blue-400',
    bg: 'bg-blue-50',
    badge: 'bg-blue-100 text-blue-700',
    dot: 'bg-blue-400',
    icon: UtensilsCrossed,
    chipBg: 'bg-blue-100 text-blue-700',
    chipActiveBg: 'bg-blue-500 text-white',
  },
  needs_bill: {
    border: 'border-red-300',
    hoverBorder: 'hover:border-red-500',
    bg: 'bg-red-50',
    badge: 'bg-red-100 text-red-700',
    dot: 'bg-red-500',
    icon: Receipt,
    chipBg: 'bg-red-100 text-red-700',
    chipActiveBg: 'bg-red-500 text-white',
  },
}

// ── Status derivation ─────────────────────────────────────────────────────────

function deriveStatus(tableId, orders) {
  const active = orders.filter(o => o.table_id === tableId && o.payment_status !== 'paid')
  if (active.length === 0) return 'available'

  // needs_bill takes top priority
  if (active.some(o => o.status === 'needs_bill')) return 'needs_bill'
  // delivered = waiter confirmed → occupied (eating)
  if (active.every(o => o.status === 'delivered')) return 'occupied'

  const allItems = active.flatMap(o => o.items || [])
  if (allItems.length === 0) return 'waiting_kitchen'

  const statuses = allItems.map(i => i.status || 'new')
  const hasNew = statuses.some(s => s === 'new')
  const hasPreparing = statuses.some(s => s === 'preparing')
  const hasReady = statuses.some(s => s === 'ready')
  const allServed = statuses.every(s => s === 'served')

  if (allServed) return 'occupied'
  if (hasReady && !hasNew && !hasPreparing) return 'ready'
  if (hasPreparing) return 'preparing'
  if (hasNew && !hasPreparing && !hasReady) return 'waiting_kitchen'
  if (hasReady || hasPreparing) return 'preparing'

  return 'waiting_kitchen'
}

function getKitchenCounts(tableId, orders) {
  const active = orders.filter(o => o.table_id === tableId && o.payment_status !== 'paid')
  const items = active.flatMap(o => o.items || [])
  return {
    newCount: items.filter(i => (i.status || 'new') === 'new').length,
    preparingCount: items.filter(i => i.status === 'preparing').length,
    readyCount: items.filter(i => i.status === 'ready').length,
    total: items.reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0),
    createdAt: active.reduce((earliest, o) =>
      new Date(o.created_at) < new Date(earliest) ? o.created_at : earliest,
      active[0]?.created_at
    ),
  }
}

function elapsedSince(isoString) {
  if (!isoString) return null
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 60000)
  if (diff < 1) return '< 1 min'
  if (diff < 60) return `${diff} min`
  return `${Math.floor(diff / 60)}h ${diff % 60}m`
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FilterChip({ label, count, active, cfg, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap
        ${active ? cfg.chipActiveBg : cfg.chipBg + ' hover:opacity-80'}`}
    >
      {label}
      <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold
        ${active ? 'bg-white/30 text-inherit' : 'bg-white/60 text-inherit'}`}>
        {count}
      </span>
    </button>
  )
}

function KitchenChip({ label, color }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${color}`}>
      {label}
    </span>
  )
}

function TableCard({ table, status, counts, lang, onClick }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.available
  const StatusIcon = cfg.icon
  const elapsed = counts?.createdAt ? elapsedSince(counts.createdAt) : null

  return (
    <button
      onClick={onClick}
      className={`group relative flex flex-col bg-white border-2 ${cfg.border} ${cfg.hoverBorder} rounded-2xl p-4 text-left transition-all active:scale-95 hover:shadow-lg w-full`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-black text-gray-900 text-base leading-none">{table.name}</p>
          {elapsed && status !== 'available' && (
            <p className="text-[10px] text-gray-400 mt-0.5">{elapsed} ago</p>
          )}
        </div>
        <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${cfg.badge}`}>
          <StatusIcon size={10} />
          {status === 'available'      ? tr(lang, 'available')       :
           status === 'waiting_kitchen'? tr(lang, 'waitingKitchen')  :
           status === 'preparing'      ? tr(lang, 'preparing')        :
           status === 'ready'          ? tr(lang, 'readyFromKitchen') :
           status === 'occupied'       ? tr(lang, 'occupied')         :
                                         tr(lang, 'needsBill')}
        </span>
      </div>

      {/* State-specific content */}
      {status === 'available' && (
        <p className="text-xs text-gray-400 mt-auto">{tr(lang, 'tapToStart')}</p>
      )}

      {(status === 'waiting_kitchen') && (
        <div className="flex flex-wrap gap-1 mt-1">
          {counts.newCount > 0 && (
            <KitchenChip label={tr(lang, 'itemsNew', counts.newCount)} color="bg-amber-100 text-amber-700" />
          )}
          <p className="w-full text-[#ff5a00] font-bold text-sm mt-1">{formatCurrency(counts.total)}</p>
        </div>
      )}

      {(status === 'preparing') && (
        <div className="flex flex-wrap gap-1 mt-1">
          {counts.newCount > 0 && (
            <KitchenChip label={tr(lang, 'itemsNew', counts.newCount)} color="bg-amber-100 text-amber-700" />
          )}
          {counts.preparingCount > 0 && (
            <KitchenChip label={tr(lang, 'itemsPreparing', counts.preparingCount)} color="bg-orange-100 text-orange-700" />
          )}
          {counts.readyCount > 0 && (
            <KitchenChip label={tr(lang, 'itemsReady', counts.readyCount)} color="bg-green-100 text-green-700" />
          )}
          <p className="w-full text-[#ff5a00] font-bold text-sm mt-1">{formatCurrency(counts.total)}</p>
        </div>
      )}

      {status === 'ready' && (
        <div className="mt-1">
          {counts.readyCount > 0 && (
            <KitchenChip label={tr(lang, 'itemsReady', counts.readyCount)} color="bg-green-100 text-green-700" />
          )}
          <p className="text-[#ff5a00] font-bold text-sm mt-1">{formatCurrency(counts.total)}</p>
        </div>
      )}

      {status === 'occupied' && (
        <p className="text-[#ff5a00] font-bold text-sm mt-auto">{formatCurrency(counts.total)}</p>
      )}

      {status === 'needs_bill' && (
        <p className="text-[#ff5a00] font-bold text-sm mt-auto">{formatCurrency(counts.total)}</p>
      )}

      {/* Active indicator dot */}
      {status !== 'available' && (
        <span className={`absolute top-3 right-3 w-2 h-2 rounded-full ${cfg.dot} opacity-0 group-hover:opacity-100 transition-opacity`} />
      )}
    </button>
  )
}

const STATUS_GUIDE_ITEMS = [
  { status: 'available',       guideKey: 'guideAvailable' },
  { status: 'waiting_kitchen', guideKey: 'guideWaiting'   },
  { status: 'preparing',       guideKey: 'guidePreparing'  },
  { status: 'ready',           guideKey: 'guideReady'      },
  { status: 'occupied',        guideKey: 'guideOccupied'   },
  { status: 'needs_bill',      guideKey: 'guideNeedsBill'  },
]

function StatusGuide({ lang }) {
  return (
    <div className="mt-8 bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <Layers size={15} className="text-gray-400" />
        <p className="text-sm font-bold text-gray-700">{tr(lang, 'statusGuide')}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {STATUS_GUIDE_ITEMS.map(({ status, guideKey }) => {
          const cfg = STATUS_CFG[status]
          const Icon = cfg.icon
          const label =
            status === 'available'       ? tr(lang, 'available')        :
            status === 'waiting_kitchen' ? tr(lang, 'waitingKitchen')   :
            status === 'preparing'       ? tr(lang, 'preparing')         :
            status === 'ready'           ? tr(lang, 'readyFromKitchen')  :
            status === 'occupied'        ? tr(lang, 'occupied')          :
                                           tr(lang, 'needsBill')
          return (
            <div key={status} className="flex items-start gap-2.5">
              <span className={`flex items-center justify-center w-7 h-7 rounded-lg ${cfg.badge} flex-shrink-0 mt-0.5`}>
                <Icon size={13} />
              </span>
              <div>
                <p className="text-xs font-bold text-gray-800">{label}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">{tr(lang, guideKey)}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

const FILTER_ORDER = ['all', 'available', 'waiting_kitchen', 'preparing', 'ready', 'occupied', 'needs_bill']

export default function WaiterTables() {
  const { state, dispatch } = useApp()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const lang = state.lang || 'en'
  const [activeFilter, setActiveFilter] = useState('all')

  const waiterName = profile?.full_name || state.user?.name || 'Waiter'

  const tableInfos = useMemo(() =>
    state.tables.map(table => {
      const status = deriveStatus(table.id, state.orders)
      const active = state.orders.filter(o => o.table_id === table.id && o.payment_status !== 'paid')
      const counts = active.length > 0 ? getKitchenCounts(table.id, state.orders) : null
      return { table, status, counts }
    }),
    [state.tables, state.orders]
  )

  const countsPerStatus = useMemo(() => {
    const c = { all: tableInfos.length }
    tableInfos.forEach(({ status }) => { c[status] = (c[status] || 0) + 1 })
    return c
  }, [tableInfos])

  const filtered = useMemo(() =>
    activeFilter === 'all'
      ? tableInfos
      : tableInfos.filter(({ status }) => status === activeFilter),
    [tableInfos, activeFilter]
  )

  function handleTable(table, status) {
    dispatch({ type: 'SET_TABLE', payload: table.id })
    dispatch({ type: 'CLEAR_CART' })
    navigate(`/waiter/order/${table.id}`)
  }

  const allCfg = {
    chipBg: 'bg-gray-100 text-gray-600',
    chipActiveBg: 'bg-gray-800 text-white',
  }

  return (
    <AppShell title={tr(lang, 'tables')}>
      <div className="min-h-screen bg-[#faf9f7] pb-10">
        <div className="p-5 max-w-5xl mx-auto">

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-black text-gray-900">{tr(lang, 'tables')}</h2>
              <p className="text-sm text-gray-400 mt-0.5">{tr(lang, 'welcome')}, {waiterName}</p>
            </div>
            <button
              onClick={() => {}}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors shadow-sm"
            >
              <RefreshCw size={14} />
              {tr(lang, 'refresh')}
            </button>
          </div>

          {/* Filter chips */}
          <div className="flex gap-2 mb-6 overflow-x-auto pb-1 scrollbar-hide">
            {/* All chip */}
            <button
              onClick={() => setActiveFilter('all')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap
                ${activeFilter === 'all' ? allCfg.chipActiveBg : allCfg.chipBg + ' hover:opacity-80'}`}
            >
              {tr(lang, 'all')}
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold bg-white/30">
                {countsPerStatus.all}
              </span>
            </button>

            {FILTER_ORDER.filter(s => s !== 'all').map(status => {
              const cnt = countsPerStatus[status] || 0
              if (cnt === 0) return null
              const cfg = STATUS_CFG[status]
              const label =
                status === 'available'       ? tr(lang, 'available')        :
                status === 'waiting_kitchen' ? tr(lang, 'waitingKitchen')   :
                status === 'preparing'       ? tr(lang, 'preparing')         :
                status === 'ready'           ? tr(lang, 'readyFromKitchen')  :
                status === 'occupied'        ? tr(lang, 'occupied')          :
                                               tr(lang, 'needsBill')
              return (
                <FilterChip
                  key={status}
                  label={label}
                  count={cnt}
                  active={activeFilter === status}
                  cfg={cfg}
                  onClick={() => setActiveFilter(status)}
                />
              )
            })}
          </div>

          {/* Table grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {filtered.map(({ table, status, counts }) => (
              <TableCard
                key={table.id}
                table={table}
                status={status}
                counts={counts}
                lang={lang}
                onClick={() => handleTable(table, status)}
              />
            ))}
          </div>

          {/* Status guide */}
          <StatusGuide lang={lang} />
        </div>
      </div>
    </AppShell>
  )
}
