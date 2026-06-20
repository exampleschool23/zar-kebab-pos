import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../store/AppContext'
import { useAuth } from '../contexts/AuthContext'
import { formatCurrency } from '../lib/formatCurrency'
import AppShell from '../components/AppShell'
import {
  UtensilsCrossed, Clock, CheckCircle2,
  Receipt, Coffee, Plus,
  Search, CreditCard, Settings, CalendarClock, Phone,
} from 'lucide-react'
import { getOrderTotal } from '../lib/analytics'
import { getReservationSummary, getWaiterTableStatus } from '../lib/tableManagement'
import { clearReservationPatch, getTodaysReservations } from '../lib/tableActivity'
import { formatDateTime, formatTime } from '../lib/dateFormat'

// ── Localization ──────────────────────────────────────────────────────────────

const L = {
  en: {
    tables: 'Tables',
    welcome: 'Welcome back',
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
    manageOrder: 'Manage order',
    requestBill: 'Request Bill',
    tableSingular: 'table',
    tablePlural: 'tables',
    confirmServed: 'Confirm served',
    viewKitchen: 'View orders',
    viewTable: 'View table',
    takePayment: 'Take payment',
    takeAwayOrder: 'Take Away Order',
    deliveryOrder: 'Delivery Order',
    manageTables: 'Manage tables',
    todaysReservations: 'Today’s Reservations',
    seat: 'Seat',
    cancelReservation: 'Cancel',
    call: 'Call',
    lessThanMinuteAgo: '< 1 min ago',
    minutesAgo: n => `${n} min ago`,
    hoursMinutesAgo: (h, m) => `${h}h ${m}m ago`,
  },
  ru: {
    tables: 'Столы',
    welcome: 'Добро пожаловать',
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
    manageOrder: 'Управлять',
    requestBill: 'Запросить счёт',
    tableSingular: 'стол',
    tablePlural: 'столов',
    confirmServed: 'Подтвердить подачу',
    viewKitchen: 'Заказы',
    viewTable: 'Открыть стол',
    takePayment: 'Оплата',
    takeAwayOrder: 'Заказ с собой',
    deliveryOrder: 'Доставка',
    manageTables: 'Управление столами',
    todaysReservations: 'Брони сегодня',
    seat: 'Посадить',
    cancelReservation: 'Отменить',
    call: 'Позвонить',
    lessThanMinuteAgo: '< 1 мин назад',
    minutesAgo: n => `${n} мин назад`,
    hoursMinutesAgo: (h, m) => `${h}ч ${m}м назад`,
  },
  uz: {
    tables: 'Stollar',
    welcome: 'Xush kelibsiz',
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
    manageOrder: 'Buyurtma',
    requestBill: 'Hisob so\'rash',
    tableSingular: 'stol',
    tablePlural: 'stol',
    confirmServed: 'Yetkazildi',
    viewKitchen: 'Buyurtmalar',
    viewTable: 'Stolni ko‘rish',
    takePayment: 'To‘lov olish',
    takeAwayOrder: 'Olib ketish buyurtmasi',
    deliveryOrder: 'Yetkazib berish',
    manageTables: 'Stollarni boshqarish',
    todaysReservations: 'Bugungi bronlar',
    seat: 'Joylashtirish',
    cancelReservation: 'Bekor qilish',
    call: 'Qo‘ng‘iroq',
    lessThanMinuteAgo: '< 1 daqiqa oldin',
    minutesAgo: n => `${n} daqiqa oldin`,
    hoursMinutesAgo: (h, m) => `${h} soat ${m} daqiqa oldin`,
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
    icon: Clock,
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

function getVisibleActiveOrdersForTable(tableId, orders) {
  return orders.filter(o =>
    o.table_id === tableId &&
    o.payment_status !== 'paid' &&
    o.status !== 'cancelled' &&
    getOrderTotal(o) > 0
  )
}

function deriveStatus(tableId, orders) {
  const active = getVisibleActiveOrdersForTable(tableId, orders)
  if (active.length === 0) return 'available'

  // needs_bill takes top priority
  if (active.some(o => o.status === 'needs_bill')) return 'needs_bill'
  // delivered = waiter confirmed → occupied (eating)
  if (active.every(o => o.status === 'delivered')) return 'occupied'

  const allItems = active.flatMap(o => o.items || []).filter(i => i.status !== 'cancelled')
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
  const active = getVisibleActiveOrdersForTable(table.id, orders)
  return getWaiterTableStatus(table, active, () => deriveStatus(table.id, orders))
}

function getPreparationCounts(tableId, orders) {
  const active = getVisibleActiveOrdersForTable(tableId, orders)
  const items = active.flatMap(o => o.items || []).filter(i => i.status !== 'cancelled')
  const pendingItemTimes = active.flatMap(o => (o.items || [])
    .filter(i => i.status !== 'cancelled' && i.status !== 'served')
    .map(i => i.submitted_at || i.submittedAt || i.created_at || i.createdAt || o.created_at)
    .filter(Boolean)
  )
  const billableItemTimes = active.flatMap(o => (o.items || [])
    .filter(i => i.status !== 'cancelled')
    .map(i => i.submitted_at || i.submittedAt || i.created_at || i.createdAt || o.created_at)
    .filter(Boolean)
  )
  const orderTimes = active.map(o => o.created_at).filter(Boolean)
  const earliestTime = times => times.reduce((earliest, time) =>
    !earliest || new Date(time) < new Date(earliest) ? time : earliest,
    null
  )
  return {
    newCount: items.filter(i => (i.status || 'new') === 'new').length,
    preparingCount: items.filter(i => i.status === 'preparing').length,
    readyCount: items.filter(i => i.status === 'ready').length,
    itemCount: items.reduce((s, i) => s + (Number(i.quantity) || 1), 0),
    total: active.reduce((s, o) => s + getOrderTotal(o), 0),
    createdAt: earliestTime(pendingItemTimes) || earliestTime(billableItemTimes) || earliestTime(orderTimes),
  }
}

function elapsedSince(isoString, lang) {
  if (!isoString) return null
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 60000)
  if (diff < 1) return tr(lang, 'lessThanMinuteAgo')
  if (diff < 60) return tr(lang, 'minutesAgo', diff)
  return tr(lang, 'hoursMinutesAgo', Math.floor(diff / 60), diff % 60)
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

function StatusChip({ label, color }) {
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
  if (status === 'preparing') return { label: tr(lang, 'viewKitchen'), Icon: Clock, cls: 'bg-orange-500 text-white hover:bg-orange-600' }
  if (status === 'waiting_kitchen') return { label: tr(lang, 'requestBill'), Icon: Receipt, cls: 'bg-yellow-500 text-white hover:bg-yellow-600' }
  if (status === 'needs_bill') return { label: tr(lang, 'takePayment'), Icon: CreditCard, cls: 'bg-red-600 text-white hover:bg-red-700' }
  if (status === 'reserved') return { label: tr(lang, 'seatReserved'), Icon: CalendarClock, cls: 'bg-purple-600 text-white hover:bg-purple-700' }
  if (status === 'occupied') return { label: tr(lang, 'requestBill'), Icon: Receipt, cls: 'bg-indigo-600 text-white hover:bg-indigo-700' }
  return null
}

function TableCard({ table, status, counts, lang, onClick, onAction, onManage }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.available
  const StatusIcon = cfg.icon
  const elapsed = counts?.createdAt ? elapsedSince(counts.createdAt, lang) : null
  const action = actionForStatus(lang, status)
  const ActionIcon = action?.Icon
  const reservation = getReservationSummary(table)
  const canManageActiveOrder = ['waiting_kitchen', 'preparing'].includes(status)

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onClick()}
      className={`group relative flex min-h-[116px] w-full cursor-pointer flex-col rounded-xl border border-[#E5E7EB] border-l-4 bg-white p-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${cfg.border} ${cfg.hoverBorder}`}
    >
      {/* Header */}
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-base font-black leading-none text-gray-900">{table.name}</p>
          {elapsed && status !== 'available' && (
            <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-gray-400">
              <Clock size={11} />
              {elapsed}
            </p>
          )}
        </div>
        <span className={`flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${cfg.badge}`}>
          <StatusIcon size={10} />
          {statusLabel(lang, status)}
        </span>
      </div>

      {/* State-specific content */}
      {status === 'available' && (
        <p className="mt-auto text-[11px] text-gray-400">{tr(lang, 'tapToStart')}</p>
      )}

      {status === 'reserved' && reservation && (
        <div className="mt-1 space-y-1.5">
          <p className="text-sm font-black text-purple-700">{tr(lang, 'reservedFor')}: {reservation.name || '-'}</p>
          {reservation.startsAt && (
            <p className="flex items-center gap-1 text-xs font-semibold text-gray-500">
              <Clock size={12} />
              {formatDateTime(reservation.startsAt)}
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
            <StatusChip label={tr(lang, 'itemsNew', counts.newCount)} color="bg-yellow-100 text-yellow-700 border border-yellow-200" />
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
            <StatusChip label={tr(lang, 'itemsNew', counts.newCount)} color="bg-yellow-100 text-yellow-700 border border-yellow-200" />
          )}
          {counts.preparingCount > 0 && (
            <StatusChip label={tr(lang, 'itemsPreparing', counts.preparingCount)} color="bg-orange-100 text-orange-700" />
          )}
          {counts.readyCount > 0 && (
            <StatusChip label={tr(lang, 'itemsReady', counts.readyCount)} color="bg-blue-100 text-blue-700 border border-blue-200" />
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
            <StatusChip label={tr(lang, 'itemsReady', counts.readyCount)} color="bg-blue-100 text-blue-700 border border-blue-200" />
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

      {(action || canManageActiveOrder) && (
        <div className="mt-4 grid grid-cols-1 gap-2">
          {canManageActiveOrder && (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation()
                onManage?.(table)
              }}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 text-sm font-black text-gray-700 transition-all hover:bg-gray-50 active:scale-[0.98]"
            >
              <Search size={15} />
              {tr(lang, 'manageOrder')}
            </button>
          )}
          {action && (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation()
                onAction?.(status, table)
              }}
              className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl px-3 text-sm font-black transition-all active:scale-[0.98] ${action.cls}`}
            >
              <ActionIcon size={15} />
              {action.label}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function ReservationStrip({ reservations, lang, onSeat, onCancel, onCall }) {
  if (reservations.length === 0) {
    return null
  }

  return (
    <div className="mb-5 rounded-2xl border border-purple-100 bg-white p-3 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
            <CalendarClock size={17} />
          </span>
          <div>
            <p className="text-sm font-black text-[#1F2937]">{tr(lang, 'todaysReservations')}</p>
            <p className="text-xs font-semibold text-gray-400">{tableCountLabel(lang, reservations.length)}</p>
          </div>
        </div>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {reservations.map(({ table, reservation }) => (
          <div key={table.id} className="min-w-[260px] rounded-2xl border border-purple-100 bg-purple-50/50 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-[#1F2937]">{table.name}</p>
                <p className="truncate text-xs font-bold text-purple-700">{reservation.name || '-'}</p>
              </div>
              <span className="rounded-full bg-white px-2 py-1 text-xs font-black text-purple-700">
                {formatTime(reservation.startsAt)}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-1.5">
              <button onClick={() => onSeat(table)} className="h-8 rounded-lg bg-purple-600 text-[11px] font-black text-white">
                {tr(lang, 'seat')}
              </button>
              <button onClick={() => onCancel(table)} className="h-8 rounded-lg border border-purple-100 bg-white text-[11px] font-black text-purple-700">
                {tr(lang, 'cancelReservation')}
              </button>
              <button
                onClick={() => onCall(reservation.phone)}
                disabled={!reservation.phone}
                className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-purple-100 bg-white text-[11px] font-black text-purple-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Phone size={12} />
                {tr(lang, 'call')}
              </button>
            </div>
          </div>
        ))}
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
        const active = getVisibleActiveOrdersForTable(table.id, state.orders)
        const counts = active.length > 0 ? getPreparationCounts(table.id, state.orders) : null
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
    return tableInfos.filter(({ status }) => {
      const matchStatus = activeFilter === 'all' || status === activeFilter
      return matchStatus
    })
  }, [tableInfos, activeFilter])

  const sections = useMemo(() =>
    SECTION_ORDER
      .map(status => ({
        status,
        items: filtered.filter(info => info.status === status),
      }))
      .filter(section => section.items.length > 0),
    [filtered]
  )

  const todaysReservations = useMemo(() =>
    getTodaysReservations(state.tables.filter(table => table.is_active !== false), new Date()),
    [state.tables]
  )

  function handleTable(table, status) {
    dispatch({ type: 'SET_TABLE', payload: table.id })
    dispatch({ type: 'CLEAR_CART' })
    navigate(`/waiter/order/${table.id}`)
  }

  function handleManageOrder(table) {
    dispatch({ type: 'SET_TABLE', payload: table.id })
    dispatch({ type: 'CLEAR_CART' })
    navigate(`/waiter/order/${table.id}?panel=order`)
  }

  function handleCardAction(status, table) {
    if (status === 'ready') {
      dispatch({ type: 'CONFIRM_ORDER_DELIVERED', payload: table.id })
      return
    }
    if (status === 'preparing') return
    if (status === 'needs_bill') {
      navigate(`/cashier/bill/${table.id}`)
      return
    }
    if (status === 'waiting_kitchen') {
      dispatch({ type: 'MARK_TABLE_NEEDS_BILL', payload: table.id })
      return
    }
    if (status === 'occupied') {
      dispatch({ type: 'MARK_TABLE_NEEDS_BILL', payload: table.id })
      return
    }
    if (status === 'reserved') {
      dispatch({ type: 'UPDATE_TABLE', payload: clearReservationPatch(table) })
    }
    handleTable(table, status)
  }

  function seatReservation(table) {
    dispatch({ type: 'UPDATE_TABLE', payload: clearReservationPatch(table) })
    handleTable(table, 'reserved')
  }

  function cancelReservation(table) {
    dispatch({ type: 'UPDATE_TABLE', payload: clearReservationPatch(table) })
  }

  function callReservation(phone) {
    if (!phone) return
    window.location.href = `tel:${phone}`
  }

  function handleTakeAway() {
    dispatch({ type: 'SET_TABLE', payload: null })
    dispatch({ type: 'CLEAR_CART' })
    navigate('/waiter/take-away')
  }

  function handleDelivery() {
    dispatch({ type: 'SET_TABLE', payload: null })
    dispatch({ type: 'CLEAR_CART' })
    navigate('/waiter/take-away?orderType=delivery')
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
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
              <button
                onClick={handleTakeAway}
                className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#ff5a00] px-4 text-sm font-black text-white shadow-sm shadow-orange-200 transition-colors hover:bg-[#cc4800]"
              >
                <Plus size={15} className="shrink-0" />
                <span className="truncate whitespace-nowrap">{tr(lang, 'takeAwayOrder')}</span>
              </button>
              <button
                onClick={handleDelivery}
                className="flex h-11 items-center justify-center gap-2 rounded-xl bg-purple-600 px-4 text-sm font-black text-white shadow-sm shadow-purple-100 transition-colors hover:bg-purple-700"
              >
                <Plus size={15} className="shrink-0" />
                <span className="truncate whitespace-nowrap">{tr(lang, 'deliveryOrder')}</span>
              </button>
              {canManageTables && (
                <button
                  onClick={() => navigate('/admin/tables')}
                  className="flex h-11 items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 text-sm font-black text-white shadow-sm transition-colors hover:bg-black"
                >
                  <Settings size={15} className="shrink-0" />
                  <span className="truncate whitespace-nowrap">{tr(lang, 'manageTables')}</span>
                </button>
              )}
            </div>
          </div>

          <ReservationStrip
            reservations={todaysReservations}
            lang={lang}
            onSeat={seatReservation}
            onCancel={cancelReservation}
            onCall={callReservation}
          />

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
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-3 xl:grid-cols-5">
                    {items.map(({ table, status: itemStatus, counts }) => (
                      <TableCard
                        key={table.id}
                        table={table}
                        status={itemStatus}
                        counts={counts}
                        lang={lang}
                        onClick={() => itemStatus === 'reserved' ? handleCardAction(itemStatus, table) : handleTable(table, itemStatus)}
                        onAction={handleCardAction}
                        onManage={handleManageOrder}
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
        </div>
      </div>
    </AppShell>
  )
}
