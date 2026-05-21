import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../store/AppContext'
import { useAuth } from '../contexts/AuthContext'
import { formatCurrency } from '../lib/formatCurrency'
import AppShell from '../components/AppShell'
import {
  UtensilsCrossed, Clock, ChefHat, CheckCircle2,
  Receipt, Coffee, RefreshCw, Layers, Plus,
  Search, CreditCard, Settings, CalendarClock, Phone,
} from 'lucide-react'
import { getReservationSummary, getWaiterTableStatus } from '../lib/tableManagement'

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
    reserved: 'Reserved',
    needsBill: 'Needs Bill',
    tapToStart: 'Tap to start order',
    reservedFor: 'Reserved for',
    seatReserved: 'Seat guest',
    itemsNew: n => `${n} new`,
    itemsPreparing: n => `${n} preparing`,
    itemsReady: n => `${n} ready`,
    viewOrder: 'View Order',
    requestBill: 'Request Bill',
    tableSingular: 'table',
    tablePlural: 'tables',
    searchPlaceholder: 'Search table...',
    confirmServed: 'Confirm served',
    viewKitchen: 'View kitchen',
    viewTable: 'View table',
    takePayment: 'Take payment',
    statusGuide: 'Table Status Guide',
    guideAvailable: 'Table is free — tap to take a new order',
    guideWaiting: 'Order sent, kitchen not yet started',
    guidePreparing: 'Kitchen is preparing items',
    guideReady: 'All items ready — confirm delivery',
    guideOccupied: 'Order delivered and eating',
    guideReserved: 'Reserved for an upcoming guest',
    guideNeedsBill: 'Guest requested the bill',
    takeAwayOrder: 'Take Away Order',
    manageTables: 'Manage tables',
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
    reserved: 'Бронь',
    needsBill: 'Счёт',
    tapToStart: 'Нажмите для заказа',
    reservedFor: 'Бронь на',
    seatReserved: 'Посадить гостя',
    itemsNew: n => `${n} новых`,
    itemsPreparing: n => `${n} готовится`,
    itemsReady: n => `${n} готово`,
    viewOrder: 'Посмотреть',
    requestBill: 'Запросить счёт',
    tableSingular: 'стол',
    tablePlural: 'столов',
    searchPlaceholder: 'Поиск стола...',
    confirmServed: 'Подтвердить подачу',
    viewKitchen: 'Кухня',
    viewTable: 'Открыть стол',
    takePayment: 'Оплата',
    statusGuide: 'Статусы столов',
    guideAvailable: 'Стол свободен — нажмите для нового заказа',
    guideWaiting: 'Заказ отправлен, кухня ещё не начала',
    guidePreparing: 'Кухня готовит блюда',
    guideReady: 'Всё готово — подтвердите доставку',
    guideOccupied: 'Заказ доставлен, гость ест',
    guideReserved: 'Забронировано для гостя',
    guideNeedsBill: 'Гость попросил счёт',
    takeAwayOrder: 'Заказ с собой',
    manageTables: 'Управление столами',
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
    reserved: 'Band qilingan',
    needsBill: 'Hisob',
    tapToStart: 'Buyurtma boshlash uchun bosing',
    reservedFor: 'Bron',
    seatReserved: 'Mehmonni joylashtirish',
    itemsNew: n => `${n} yangi`,
    itemsPreparing: n => `${n} tayyorlanmoqda`,
    itemsReady: n => `${n} tayyor`,
    viewOrder: 'Ko\'rish',
    requestBill: 'Hisob so\'rash',
    tableSingular: 'stol',
    tablePlural: 'stol',
    searchPlaceholder: 'Stol qidirish...',
    confirmServed: 'Yetkazildi',
    viewKitchen: 'Oshxona',
    viewTable: 'Stolni ko‘rish',
    takePayment: 'To‘lov olish',
    statusGuide: 'Stol holatlari',
    guideAvailable: 'Stol bo\'sh — yangi buyurtma boshlash uchun bosing',
    guideWaiting: 'Buyurtma yuborildi, oshxona hali boshlamadi',
    guidePreparing: 'Oshxona tayyorlamoqda',
    guideReady: 'Hammasi tayyor — yetkazib berishni tasdiqlang',
    guideOccupied: 'Buyurtma yetkazildi, mehmon ovqatlanmoqda',
    guideReserved: 'Keladigan mehmon uchun bron qilingan',
    guideNeedsBill: 'Mehmon hisob so\'radi',
    takeAwayOrder: 'Olib ketish buyurtmasi',
    manageTables: 'Stollarni boshqarish',
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
    badge: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
    dot: 'bg-emerald-400',
    icon: Coffee,
    chipBg: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
    chipActiveBg: 'bg-emerald-500 text-white',
  },
  waiting_kitchen: {
    border: 'border-yellow-200',
    hoverBorder: 'hover:border-yellow-400',
    bg: 'bg-yellow-50',
    badge: 'bg-yellow-100 text-yellow-700 border border-yellow-200',
    dot: 'bg-yellow-400',
    icon: Clock,
    chipBg: 'bg-yellow-100 text-yellow-700 border border-yellow-200',
    chipActiveBg: 'bg-yellow-500 text-white',
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
    border: 'border-blue-200',
    hoverBorder: 'hover:border-blue-400',
    bg: 'bg-blue-50',
    badge: 'bg-blue-100 text-blue-700 border border-blue-200',
    dot: 'bg-blue-500',
    icon: CheckCircle2,
    chipBg: 'bg-blue-100 text-blue-700 border border-blue-200',
    chipActiveBg: 'bg-blue-500 text-white',
  },
  occupied: {
    border: 'border-indigo-200',
    hoverBorder: 'hover:border-indigo-400',
    bg: 'bg-indigo-50',
    badge: 'bg-indigo-100 text-indigo-700',
    dot: 'bg-indigo-500',
    icon: UtensilsCrossed,
    chipBg: 'bg-indigo-100 text-indigo-700',
    chipActiveBg: 'bg-indigo-500 text-white',
  },
  reserved: {
    border: 'border-purple-200',
    hoverBorder: 'hover:border-purple-400',
    bg: 'bg-purple-50',
    badge: 'bg-purple-100 text-purple-700 border border-purple-200',
    dot: 'bg-purple-500',
    icon: CalendarClock,
    chipBg: 'bg-purple-100 text-purple-700 border border-purple-200',
    chipActiveBg: 'bg-purple-500 text-white',
  },
  needs_bill: {
    border: 'border-red-300',
    hoverBorder: 'hover:border-red-500',
    bg: 'bg-red-50',
    badge: 'bg-red-100 text-red-700 border border-red-200',
    dot: 'bg-red-500',
    icon: Receipt,
    chipBg: 'bg-red-100 text-red-700 border border-red-200',
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

function deriveStatusForTable(table, orders) {
  const active = orders.filter(o => o.table_id === table.id && o.payment_status !== 'paid')
  return getWaiterTableStatus(table, active, () => deriveStatus(table.id, orders))
}

function getKitchenCounts(tableId, orders) {
  const active = orders.filter(o => o.table_id === tableId && o.payment_status !== 'paid')
  const items = active.flatMap(o => o.items || [])
  return {
    newCount: items.filter(i => (i.status || 'new') === 'new').length,
    preparingCount: items.filter(i => i.status === 'preparing').length,
    readyCount: items.filter(i => i.status === 'ready').length,
    itemCount: items.reduce((s, i) => s + (Number(i.quantity) || 1), 0),
    total: active.reduce((s, o) => s + (Number(o.total) || 0), 0) || items.reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0),
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

function tableCountLabel(lang, count) {
  return `${count} ${count === 1 ? tr(lang, 'tableSingular') : tr(lang, 'tablePlural')}`
}

function statusLabel(lang, status) {
  return status === 'available'       ? tr(lang, 'available')        :
         status === 'waiting_kitchen' ? tr(lang, 'waitingKitchen')   :
         status === 'preparing'       ? tr(lang, 'preparing')         :
         status === 'ready'           ? tr(lang, 'readyFromKitchen')  :
         status === 'reserved'        ? tr(lang, 'reserved')          :
         status === 'occupied'        ? tr(lang, 'occupied')          :
                                        tr(lang, 'needsBill')
}

function actionForStatus(lang, status) {
  if (status === 'ready') return { label: tr(lang, 'confirmServed'), Icon: CheckCircle2, cls: 'bg-blue-600 text-white hover:bg-blue-700' }
  if (status === 'preparing') return { label: tr(lang, 'viewKitchen'), Icon: ChefHat, cls: 'bg-orange-500 text-white hover:bg-orange-600' }
  if (status === 'waiting_kitchen') return { label: tr(lang, 'viewOrder'), Icon: Clock, cls: 'bg-yellow-500 text-white hover:bg-yellow-600' }
  if (status === 'needs_bill') return { label: tr(lang, 'takePayment'), Icon: CreditCard, cls: 'bg-red-600 text-white hover:bg-red-700' }
  if (status === 'reserved') return { label: tr(lang, 'seatReserved'), Icon: CalendarClock, cls: 'bg-purple-600 text-white hover:bg-purple-700' }
  if (status === 'occupied') return { label: tr(lang, 'requestBill'), Icon: Receipt, cls: 'bg-indigo-600 text-white hover:bg-indigo-700' }
  return null
}

function TableCard({ table, status, counts, lang, onClick, onAction }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.available
  const StatusIcon = cfg.icon
  const elapsed = counts?.createdAt ? elapsedSince(counts.createdAt) : null
  const action = actionForStatus(lang, status)
  const ActionIcon = action?.Icon
  const reservation = getReservationSummary(table)

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onClick()}
      className={`group relative flex min-h-[172px] w-full cursor-pointer flex-col rounded-2xl border border-[#E5E7EB] border-l-4 bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${cfg.border} ${cfg.hoverBorder}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-black text-gray-900 text-lg leading-none">{table.name}</p>
          {elapsed && status !== 'available' && (
            <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-gray-400">
              <Clock size={11} />
              {elapsed} ago
            </p>
          )}
        </div>
        <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${cfg.badge}`}>
          <StatusIcon size={10} />
          {statusLabel(lang, status)}
        </span>
      </div>

      {/* State-specific content */}
      {status === 'available' && (
        <p className="text-xs text-gray-400 mt-auto">{tr(lang, 'tapToStart')}</p>
      )}

      {status === 'reserved' && reservation && (
        <div className="mt-1 space-y-1.5">
          <p className="text-sm font-black text-purple-700">{tr(lang, 'reservedFor')}: {reservation.name || '-'}</p>
          {reservation.startsAt && (
            <p className="flex items-center gap-1 text-xs font-semibold text-gray-500">
              <Clock size={12} />
              {new Date(reservation.startsAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
            </p>
          )}
          {reservation.phone && (
            <p className="flex items-center gap-1 text-xs font-semibold text-gray-500">
              <Phone size={12} />
              {reservation.phone}
            </p>
          )}
        </div>
      )}

      {(status === 'waiting_kitchen') && (
        <div className="flex flex-wrap gap-1 mt-1">
          {counts.newCount > 0 && (
            <KitchenChip label={tr(lang, 'itemsNew', counts.newCount)} color="bg-yellow-100 text-yellow-700 border border-yellow-200" />
          )}
          <div className="mt-2 flex w-full items-center justify-between gap-2">
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-bold text-gray-600">×{counts.itemCount}</span>
            <p className="text-[#ff5a00] font-black text-sm">{formatCurrency(counts.total)}</p>
          </div>
        </div>
      )}

      {(status === 'preparing') && (
        <div className="flex flex-wrap gap-1 mt-1">
          {counts.newCount > 0 && (
            <KitchenChip label={tr(lang, 'itemsNew', counts.newCount)} color="bg-yellow-100 text-yellow-700 border border-yellow-200" />
          )}
          {counts.preparingCount > 0 && (
            <KitchenChip label={tr(lang, 'itemsPreparing', counts.preparingCount)} color="bg-orange-100 text-orange-700" />
          )}
          {counts.readyCount > 0 && (
            <KitchenChip label={tr(lang, 'itemsReady', counts.readyCount)} color="bg-blue-100 text-blue-700 border border-blue-200" />
          )}
          <div className="mt-2 flex w-full items-center justify-between gap-2">
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-bold text-gray-600">×{counts.itemCount}</span>
            <p className="text-[#ff5a00] font-black text-sm">{formatCurrency(counts.total)}</p>
          </div>
        </div>
      )}

      {status === 'ready' && (
        <div className="mt-1">
          {counts.readyCount > 0 && (
            <KitchenChip label={tr(lang, 'itemsReady', counts.readyCount)} color="bg-blue-100 text-blue-700 border border-blue-200" />
          )}
          <div className="mt-2 flex w-full items-center justify-between gap-2">
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-bold text-gray-600">×{counts.itemCount}</span>
            <p className="text-[#ff5a00] font-black text-sm">{formatCurrency(counts.total)}</p>
          </div>
        </div>
      )}

      {status === 'occupied' && (
        <div className="mt-auto flex items-center justify-between gap-2">
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-bold text-gray-600">×{counts.itemCount}</span>
          <p className="text-[#ff5a00] font-black text-sm">{formatCurrency(counts.total)}</p>
        </div>
      )}

      {status === 'needs_bill' && (
        <div className="mt-auto flex items-center justify-between gap-2">
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-bold text-gray-600">×{counts.itemCount}</span>
          <p className="text-[#ff5a00] font-black text-sm">{formatCurrency(counts.total)}</p>
        </div>
      )}

      {action && (
        <button
          type="button"
          onClick={e => {
            e.stopPropagation()
            onAction?.(status, table)
          }}
          className={`mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-xl px-3 text-sm font-black transition-all active:scale-[0.98] ${action.cls}`}
        >
          <ActionIcon size={15} />
          {action.label}
        </button>
      )}
    </div>
  )
}

const STATUS_GUIDE_ITEMS = [
  { status: 'available',       guideKey: 'guideAvailable' },
  { status: 'waiting_kitchen', guideKey: 'guideWaiting'   },
  { status: 'preparing',       guideKey: 'guidePreparing'  },
  { status: 'ready',           guideKey: 'guideReady'      },
  { status: 'occupied',        guideKey: 'guideOccupied'   },
  { status: 'reserved',        guideKey: 'guideReserved'   },
  { status: 'needs_bill',      guideKey: 'guideNeedsBill'  },
]

function StatusGuide({ lang }) {
  return (
    <div className="mt-8 bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <Layers size={15} className="text-gray-400" />
        <p className="text-sm font-bold text-gray-700">{tr(lang, 'statusGuide')}</p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {STATUS_GUIDE_ITEMS.map(({ status, guideKey }) => {
          const cfg = STATUS_CFG[status]
          const Icon = cfg.icon
          const label =
            status === 'available'       ? tr(lang, 'available')        :
            status === 'waiting_kitchen' ? tr(lang, 'waitingKitchen')   :
            status === 'preparing'       ? tr(lang, 'preparing')         :
            status === 'ready'           ? tr(lang, 'readyFromKitchen')  :
            status === 'reserved'        ? tr(lang, 'reserved')          :
            status === 'occupied'        ? tr(lang, 'occupied')          :
                                           tr(lang, 'needsBill')
          return (
            <div key={status} className="flex items-center gap-2.5">
              <span className={`flex items-center justify-center w-6 h-6 rounded-lg ${cfg.badge} flex-shrink-0`}>
                <Icon size={12} />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-bold text-gray-800">{label}</p>
                <p className="truncate text-[11px] text-gray-400">{tr(lang, guideKey)}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

const FILTER_ORDER = ['all', 'available', 'reserved', 'waiting_kitchen', 'preparing', 'ready', 'needs_bill', 'occupied']
const SECTION_ORDER = ['ready', 'preparing', 'waiting_kitchen', 'needs_bill', 'reserved', 'occupied', 'available']

export default function WaiterTables() {
  const { state, dispatch } = useApp()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const lang = state.lang || 'en'
  const [activeFilter, setActiveFilter] = useState('all')
  const [search, setSearch] = useState('')

  const waiterName = profile?.full_name || state.user?.name || 'Waiter'
  const canManageTables = ['owner', 'admin'].includes((profile?.role || state.user?.role || '').toLowerCase())

  const tableInfos = useMemo(() =>
    state.tables
      .filter(table => table.is_active !== false)
      .sort((a, b) =>
        (Number(a.sort_order) || 9999) - (Number(b.sort_order) || 9999) ||
        String(a.name || '').localeCompare(String(b.name || ''))
      )
      .map(table => {
        const status = deriveStatusForTable(table, state.orders)
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return tableInfos.filter(({ table, status }) => {
      const matchStatus = activeFilter === 'all' || status === activeFilter
      const matchSearch = !q || table.name.toLowerCase().includes(q)
      return matchStatus && matchSearch
    })
  }, [tableInfos, activeFilter, search])

  const sections = useMemo(() =>
    SECTION_ORDER
      .map(status => ({
        status,
        items: filtered.filter(info => info.status === status),
      }))
      .filter(section => section.items.length > 0),
    [filtered]
  )

  function handleTable(table, status) {
    dispatch({ type: 'SET_TABLE', payload: table.id })
    dispatch({ type: 'CLEAR_CART' })
    navigate(`/waiter/order/${table.id}`)
  }

  function handleCardAction(status, table) {
    if (status === 'ready') {
      dispatch({ type: 'CONFIRM_ORDER_DELIVERED', payload: table.id })
      return
    }
    if (status === 'preparing') {
      navigate('/kitchen')
      return
    }
    if (status === 'needs_bill') {
      navigate(`/cashier/bill/${table.id}`)
      return
    }
    if (status === 'occupied') {
      dispatch({ type: 'MARK_TABLE_NEEDS_BILL', payload: table.id })
      return
    }
    if (status === 'reserved') {
      dispatch({
        type: 'UPDATE_TABLE',
        payload: {
          ...table,
          status: 'available',
          reserved_for_name: '',
          reserved_for_phone: '',
          reserved_at: null,
          reserved_until: null,
          reservation_notes: '',
        },
      })
    }
    handleTable(table, status)
  }

  function handleTakeAway() {
    dispatch({ type: 'SET_TABLE', payload: null })
    dispatch({ type: 'CLEAR_CART' })
    navigate('/waiter/take-away')
  }

  const allCfg = {
    chipBg: 'bg-gray-100 text-gray-600',
    chipActiveBg: 'bg-gray-800 text-white',
  }

  return (
    <AppShell title={tr(lang, 'tables')}>
      <div className="min-h-screen bg-[#faf9f7] pb-10">
        <div className="p-4 md:p-5 max-w-[1440px] mx-auto">

          {/* Header */}
          <div className="mb-5 flex flex-col gap-4 rounded-[28px] border border-[#E5E7EB] bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-2xl font-black text-gray-900">{tr(lang, 'tables')}</h2>
              <p className="text-sm text-gray-400 mt-0.5">{tr(lang, 'welcome')}, {waiterName}</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative min-w-0 sm:w-[280px]">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder={tr(lang, 'searchPlaceholder')}
                  className="h-10 w-full rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] pl-9 pr-3 text-sm text-[#1F2937] outline-none transition-all focus:border-[#ff5a00] focus:bg-white focus:ring-2 focus:ring-[#ff5a00]/15"
                />
              </div>
              <button
                onClick={() => window.location.reload()}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors shadow-sm"
              >
                <RefreshCw size={14} />
                {tr(lang, 'refresh')}
              </button>
              <button
                onClick={handleTakeAway}
                className="flex items-center gap-2 px-4 py-2 bg-[#ff5a00] text-white rounded-xl text-sm font-black hover:bg-[#cc4800] transition-colors shadow-sm shadow-orange-200"
              >
                <Plus size={15} />
                {tr(lang, 'takeAwayOrder')}
              </button>
              {canManageTables && (
                <button
                  onClick={() => navigate('/admin/tables')}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-black hover:bg-black transition-colors shadow-sm"
                >
                  <Settings size={15} />
                  {tr(lang, 'manageTables')}
                </button>
              )}
            </div>
          </div>

          {/* Filter chips */}
          <div className="mb-6 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
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
              const cfg = STATUS_CFG[status]
              return (
                <FilterChip
                  key={status}
                  label={statusLabel(lang, status)}
                  count={cnt}
                  active={activeFilter === status}
                  cfg={cfg}
                  onClick={() => setActiveFilter(status)}
                />
              )
            })}
          </div>

          {/* Status sections */}
          <div className="space-y-9">
            {sections.map(({ status, items }) => {
              const cfg = STATUS_CFG[status]
              const Icon = cfg.icon
              return (
                <section key={status} className="border-t border-[#E5E7EB] pt-5 first:border-t-0 first:pt-0">
                  <div className="sticky top-0 z-10 -mx-1 mb-3 flex items-center gap-3 rounded-2xl bg-[#faf9f7]/95 px-1 py-2 backdrop-blur">
                    <span className={`flex h-10 w-10 items-center justify-center rounded-2xl ${cfg.badge}`}>
                      <Icon size={18} />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-lg font-black uppercase tracking-tight text-[#1F2937]">{statusLabel(lang, status)}</h3>
                      <p className="text-xs font-semibold text-[#8A94A6]">{tableCountLabel(lang, items.length)}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {items.map(({ table, status: itemStatus, counts }) => (
                      <TableCard
                        key={table.id}
                        table={table}
                        status={itemStatus}
                        counts={counts}
                        lang={lang}
                        onClick={() => itemStatus === 'reserved' ? handleCardAction(itemStatus, table) : handleTable(table, itemStatus)}
                        onAction={handleCardAction}
                      />
                    ))}
                  </div>
                </section>
              )
            })}

            {sections.length === 0 && (
              <div className="rounded-2xl border border-[#E5E7EB] bg-white p-10 text-center shadow-sm">
                <Search size={34} className="mx-auto mb-3 text-gray-200" />
                <p className="text-sm font-bold text-gray-500">
                  {lang === 'uz' ? 'Stol topilmadi' : lang === 'ru' ? 'Стол не найден' : 'No tables found'}
                </p>
              </div>
            )}
          </div>

          {/* Status guide */}
          <StatusGuide lang={lang} />
        </div>
      </div>
    </AppShell>
  )
}
