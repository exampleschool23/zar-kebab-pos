import React, { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Receipt, CreditCard, Menu as MenuIcon, Clock, Users, Search,
  ChevronDown, Table2, Banknote, Monitor, QrCode,
  UtensilsCrossed, ArrowUpDown, X, HelpCircle, Trash2, RotateCcw, Plus,
} from 'lucide-react'
import { useApp } from '../store/AppContext'
import { useAuth } from '../contexts/AuthContext'
import { formatCurrency } from '../lib/formatCurrency'
import {
  getGroupedOrderItems,
  getOrderDate,
  getOrderPaymentBreakdown,
  getOrderTotal,
  groupOrdersBySession,
  isPaidOrder,
  toLocalDateStr,
} from '../lib/analytics'
import { isCashierVisibleBill, isTakeAwayBill } from '../lib/cashierBills'
import UnifiedSidebar from '../components/UnifiedSidebar'
import { inferOrderType, isDeliveryOrderType, isOffPremiseOrderType, orderTypeLabel } from '../lib/orderTypes'
import { getItemName } from '../lib/i18n'
import { getQuickItemSortOrder, isCashierQuickItem } from '../lib/menuItems'
import { formatDateTime, formatTime } from '../lib/dateFormat'

// ── Helpers ───────────────────────────────────────────────────────────────────

function elapsedSince(iso) {
  if (!iso) return null
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (diff < 1) return '< 1 min'
  if (diff < 60) return `${diff} min`
  return `${Math.floor(diff / 60)}h ${diff % 60}m`
}

function timeLabel(iso) {
  return formatTime(iso)
}

function dateTimeLabel(iso) {
  return formatDateTime(iso)
}

function countLabel(count, lang) {
  if (lang === 'uz') return `${count} hisob`
  if (lang === 'ru') return `${count} ${count === 1 ? 'счёт' : count < 5 ? 'счёта' : 'счетов'}`
  return `${count} bill${count === 1 ? '' : 's'}`
}

function paidTimeLabel(iso) {
  return formatTime(iso)
}

function getCashierItemName(item, menuItem, lang) {
  return menuItem ? getItemName(menuItem, lang) : item.name
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
    activeNotReady:  'Faol, hisobga tayyor emas',
    activeTableBills: 'Faol stol hisoblari',
    takeAwayBills:   'Olib ketish hisoblari',
    deliveryBills:   'Yetkazib berish hisoblari',
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
    deleteOrder:     "Buyurtmani o'chirish",
    confirmDelete:   "O'chirishni tasdiqlash",
    takeAway:         'Olib ketish',
    delivery:         'Yetkazib berish',
    showPaid:         "To'langanlarni ko'rsatish",
    hidePaid:         "To'langanlarni yashirish",
    noTable:          'Stolsiz',
    waitingKitchen:  'Tayyorlanmoqda',
    waitingKitchenSub: 'Buyurtma kassirda ochiq',
    recallTable:     'Stolga qaytarish',
    deleteFailed:    "Buyurtmani o'chirib bo'lmadi",
    quickItems:      'Tezkor kassir mahsulotlari',
    addQuickFailed:  "Tezkor mahsulotni qo'shib bo'lmadi",
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
    activeNotReady:  'Активные, счёт не готов',
    activeTableBills: 'Активные счета столов',
    takeAwayBills:   'Заказ с собой',
    deliveryBills:   'Доставка',
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
    deleteOrder:     'Удалить заказ',
    confirmDelete:   'Подтвердить удаление',
    takeAway:         'Заказ с собой',
    delivery:         'Доставка',
    showPaid:         'Показать оплаченные',
    hidePaid:         'Скрыть оплаченные',
    noTable:          'Без стола',
    waitingKitchen:  'Готовится',
    waitingKitchenSub: 'Заказ уже открыт у кассира',
    recallTable:     'Вернуть на стол',
    deleteFailed:    'Не удалось удалить заказ',
    quickItems:      'Быстрые товары кассира',
    addQuickFailed:  'Не удалось добавить быстрый товар',
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
    activeNotReady:  'Active, not bill-ready',
    activeTableBills: 'Active table bills',
    takeAwayBills:   'Take-away bills',
    deliveryBills:   'Delivery bills',
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
    deleteOrder:     'Delete order',
    confirmDelete:   'Confirm delete',
    takeAway:         'Take Away',
    delivery:         'Delivery',
    showPaid:         'Show paid today',
    hidePaid:         'Hide paid today',
    noTable:          'No table',
    waitingKitchen:  'Preparing',
    waitingKitchenSub: 'Order is already open for cashier',
    recallTable:     'Move back to table',
    deleteFailed:    'Could not delete order',
    quickItems:      'Cashier quick items',
    addQuickFailed:  'Could not add quick item',
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
  if (status === 'delivery') {
    return (
      <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-100">
        {l.delivery}
      </span>
    )
  }
  if (status === 'take_away') {
    return (
      <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-blue-50 text-[#2563EB] border border-blue-100">
        {l.takeAway}
      </span>
    )
  }
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

function BillCard({
  order,
  table,
  menuItemMap,
  lang,
  quickItems = [],
  onOpen,
  onAddQuickItem,
  quickAddBusyKey = '',
  quickAddError = '',
  onRecall,
  canDelete,
  onDelete,
  confirmDelete,
  isDeleting,
  deleteError,
}) {
  const l = L[lang] || L.en
  const isTakeAway = isTakeAwayBill(order)
  const isDelivery = isDeliveryOrderType(inferOrderType(order))
  const orderType = inferOrderType(order)

  const items = useMemo(() => {
    return getGroupedOrderItems(order.items || [])
  }, [order.items])

  const preview   = items.slice(0, 4)
  const moreCount = items.length - preview.length
  const readyForCashier = isCashierVisibleBill(order)

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
              <h3 className="font-black text-[#1F2937] text-[16px] leading-tight">
                {isOffPremiseOrderType(orderType) ? `${orderTypeLabel(orderType, lang)} · ${order.order_number || order.id}` : order.table_name}
              </h3>
              {isOffPremiseOrderType(orderType) && <p className="text-[11px] font-bold text-[#ff5a00]">{l.noTable}</p>}
              {order.waiter_name && (
                <p className="text-[11px] text-[#9CA3AF]">{l.waiter}: {order.waiter_name}</p>
              )}
            </div>
          </div>
          <TableStatusBadge status={isDelivery ? 'delivery' : isTakeAway ? 'take_away' : table?.status || order.status} lang={lang} />
        </div>

        <div className="flex items-center gap-4 mt-3 text-[11px] text-[#9CA3AF]">
          <span className="flex items-center gap-1">
            <Clock size={11} />
            {l.opened} {elapsedSince(order.created_at)}
            {order.created_at && <span className="text-[#D1D5DB]">({dateTimeLabel(order.created_at)})</span>}
          </span>
          <span>{items.length} {l.items}</span>
        </div>
      </div>

      {/* Total */}
      <div className="px-5 pt-4 pb-3">
        <p className={`font-black text-[26px] leading-none mb-4 ${readyForCashier ? 'text-[#ff5a00]' : 'text-[#9CA3AF]'}`}>
          {formatCurrency(getOrderTotal(order))}
        </p>

        {/* Item preview */}
        <div className="space-y-2.5">
          {preview.map((item, i) => {
            const mi = menuItemMap[item.menu_item_id]
            const displayName = getCashierItemName(item, mi, lang)
            const lineTotal = (item.price || 0) * (item.quantity || 1)
            return (
              <div key={i} className="flex items-center gap-3">
                {mi?.image_url ? (
                  <img
                    src={mi.image_url}
                    alt={displayName}
                    className="w-8 h-8 rounded-lg object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <UtensilsCrossed size={12} className="text-gray-300" />
                  </div>
                )}
                <p className="flex-1 text-[13px] text-[#1F2937] font-medium truncate">{displayName}</p>
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

        {readyForCashier && quickItems.length > 0 && (
          <div className="mt-4 rounded-xl border border-orange-100 bg-orange-50/40 p-3">
            <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-[#ff5a00]">{l.quickItems}</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {quickItems.map(item => {
                const busyKey = `${order.id}:${item.id}`
                const busy = quickAddBusyKey === busyKey
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={busy}
                    onClick={() => onAddQuickItem?.(order, item)}
                    className="flex min-h-10 items-center justify-between gap-2 rounded-lg border border-orange-100 bg-white px-2.5 py-2 text-left text-[12px] font-black text-[#1F2937] shadow-sm transition-all hover:border-[#ff5a00] disabled:opacity-60"
                  >
                    <span className="line-clamp-1">{getItemName(item, lang)}</span>
                    <span className="flex items-center gap-1 text-[#ff5a00]">
                      {formatCurrency(item.price)}
                      <Plus size={13} />
                    </span>
                  </button>
                )
              })}
            </div>
            {quickAddError && (
              <p className="mt-2 rounded-lg bg-red-50 px-2 py-1.5 text-[11px] font-bold text-red-600">{quickAddError}</p>
            )}
          </div>
        )}
      </div>

      {/* Open bill button */}
      <div className="px-5 pb-5 mt-auto pt-3">
        {readyForCashier ? (
          <div className="flex flex-col gap-2">
            <button
              onClick={() => onOpen(order)}
              className="w-full flex items-center justify-center gap-2 bg-[#ff5a00] text-white rounded-xl py-3 text-[14px] font-bold hover:bg-[#cc4800] active:scale-[0.98] transition-all shadow-sm shadow-orange-200"
            >
              <Receipt size={16} />
              {l.openBill}
            </button>
            {order.status === 'needs_bill' && !isOffPremiseOrderType(orderType) && onRecall && (
              <button
                onClick={() => onRecall(order)}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 text-gray-600 py-2.5 text-[13px] font-bold hover:bg-gray-100 active:scale-[0.98] transition-all"
              >
                <RotateCcw size={14} />
                {l.recallTable}
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                onClick={() => onDelete(order)}
                disabled={isDeleting}
                className={`w-full flex items-center justify-center gap-2 rounded-xl border py-2.5 text-[13px] font-black transition-all disabled:opacity-60 ${
                  confirmDelete
                    ? 'border-red-200 bg-red-600 text-white hover:bg-red-700'
                    : 'border-red-100 bg-red-50 text-red-600 hover:border-red-200 hover:bg-red-100'
                }`}
              >
                <Trash2 size={15} />
                {confirmDelete ? l.confirmDelete : l.deleteOrder}
              </button>
            )}
            {deleteError && (
              <p className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-[12px] font-bold leading-snug text-red-600">
                {l.deleteFailed}: {deleteError}
              </p>
            )}
          </div>
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

function BillsSection({ title, count, icon: Icon, tone, children }) {
  const toneClasses = {
    red:    'bg-red-50 text-[#DC2626] border-red-100',
    amber:  'bg-orange-50 text-[#ff5a00] border-orange-100',
    blue:   'bg-blue-50 text-[#2563EB] border-blue-100',
  }[tone] || 'bg-gray-50 text-[#6B7280] border-gray-100'

  return (
    <section className="mb-8 border-t border-[#E5E7EB] pt-5 first:border-t-0 first:pt-0">
      <div className="sticky top-0 z-10 -mx-1 mb-3 flex items-center justify-between gap-3 bg-[#FAF7F0]/95 px-1 py-2 backdrop-blur">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-8 h-8 rounded-xl border flex items-center justify-center flex-shrink-0 ${toneClasses}`}>
            <Icon size={16} />
          </div>
          <div className="min-w-0">
            <h2 className="font-black text-[#1F2937] text-[15px] leading-tight">{title}</h2>
            <p className="text-[11px] font-semibold text-[#9CA3AF]">{count}</p>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {children}
      </div>
    </section>
  )
}

function PaidTodaySummary({ orders, lang, expanded, onToggle }) {
  const l = L[lang] || L.en
  const total = orders.reduce((sum, order) => sum + getOrderTotal(order), 0)
  const latest = [...orders]
    .sort((a, b) => new Date(getOrderDate(b)) - new Date(getOrderDate(a)))
    .slice(0, 8)

  return (
    <section className="mt-8 border-t border-[#E5E7EB] pt-5">
      <button
        type="button"
        onClick={onToggle}
        className="w-full bg-white border border-[#E5E7EB] rounded-2xl px-5 py-4 shadow-sm hover:shadow-md transition-all text-left"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-green-50 border border-green-100 flex items-center justify-center flex-shrink-0">
              <CreditCard size={17} className="text-[#16A34A]" />
            </div>
            <div className="min-w-0">
              <h2 className="font-black text-[#1F2937] text-[15px] leading-tight">{l.paidToday}</h2>
              <p className="text-[11px] font-semibold text-[#9CA3AF]">
                {countLabel(orders.length, lang)} · {formatCurrency(total)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[12px] font-bold text-[#16A34A]">
            <span className="hidden sm:inline">{expanded ? l.hidePaid : l.showPaid}</span>
            <ChevronDown size={16} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </div>
        </div>
      </button>

      {expanded && (
        <div className="mt-3 bg-white border border-[#E5E7EB] rounded-2xl shadow-sm overflow-hidden">
          {latest.length === 0 ? (
            <p className="px-5 py-4 text-[13px] text-[#6B7280]">{l.noPayData}</p>
          ) : (
            latest.map(order => {
              const orderType = inferOrderType(order)
              return (
                <div key={order.id} className="flex items-center justify-between gap-4 px-5 py-3 border-b border-[#F3F4F6] last:border-b-0">
                  <div className="min-w-0">
                    <p className="font-bold text-[#1F2937] text-[13px] truncate">
                      {isOffPremiseOrderType(orderType) ? `${orderTypeLabel(orderType, lang)} · ${order.order_number || order.id}` : order.table_name}
                    </p>
                    <p className="text-[11px] text-[#9CA3AF]">
                      {paidTimeLabel(order.paid_at || getOrderDate(order))}
                      {order.waiter_name ? ` · ${order.waiter_name}` : ''}
                    </p>
                  </div>
                  <p className="font-black text-[#16A34A] text-[13px] flex-shrink-0">{formatCurrency(getOrderTotal(order))}</p>
                </div>
              )
            })
          )}
        </div>
      )}
    </section>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function CashierTables() {
  const { state, dispatch } = useApp()
  const { profile } = useAuth()
  const navigate            = useNavigate()
  const lang                = state.lang
  const l                   = L[lang] || L.en

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [search,      setSearch]      = useState('')
  const [filterWaiter,setFilterWaiter]= useState('all')
  const [filterStatus,setFilterStatus]= useState('all')
  const [sortKey,     setSortKey]     = useState('newest')
  const [showPaidToday, setShowPaidToday] = useState(false)
  const [confirmDeleteOrderId, setConfirmDeleteOrderId] = useState('')
  const [deletingOrderId, setDeletingOrderId] = useState('')
  const [deleteErrorByOrderId, setDeleteErrorByOrderId] = useState({})
  const [quickAddBusyKey, setQuickAddBusyKey] = useState('')
  const [quickAddErrorByOrderId, setQuickAddErrorByOrderId] = useState({})
  const isOwner = profile?.role === 'owner' || state.user?.role === 'owner'

  // ── Menu item lookup map ────────────────────────────────────────────────────
  const menuItemMap = useMemo(() =>
    Object.fromEntries(state.menuItems.map(m => [m.id, m])),
    [state.menuItems]
  )

  const quickItems = useMemo(() =>
    state.menuItems
      .filter(isCashierQuickItem)
      .sort((a, b) => getQuickItemSortOrder(a) - getQuickItemSortOrder(b))
      .slice(0, 6),
    [state.menuItems]
  )

  // ── Derive active bills — dine-in is merged per table; take-away stays one bill per order.
  const activeBills = useMemo(() => {
    const raw = state.orders.filter(isCashierVisibleBill)
    const grouped = {}
    raw.forEach(order => {
      const key = isOffPremiseOrderType(inferOrderType(order)) || !order.table_id
        ? `order:${order.id}`
        : `table:${order.table_id}`
      if (!grouped[key]) {
        grouped[key] = {
          ...order,
          items: [...(order.items || [])],
          total: getOrderTotal(order),
        }
      } else {
        grouped[key].items  = [...grouped[key].items, ...(order.items || [])]
        grouped[key].total  = (grouped[key].total || 0) + getOrderTotal(order)
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
    groupOrdersBySession(state.orders).filter(o =>
      isPaidOrder(o) && toLocalDateStr(getOrderDate(o)) === toLocalDateStr(new Date().toISOString())
    ),
    [state.orders]
  )

  // ── KPI values ─────────────────────────────────────────────────────────────
  const needsBillCount = activeBills.filter(o => o.status === 'needs_bill').length
  const paidTodayCount = useMemo(() => {
    return paidTodayOrders.length
  }, [paidTodayOrders])
  const todayRevenue   = paidTodayOrders.reduce((s, o) => s + getOrderTotal(o), 0)

  // Payment method breakdown — tracks { amount, count } per method
  const payMethodTotals = useMemo(() => {
    const KNOWN = ['cash', 'card', 'terminal', 'qr', 'loyalty_card']
    const map = {}
    paidTodayOrders.forEach(o => {
      const breakdown = getOrderPaymentBreakdown(o)
      const rows = breakdown.length > 0 ? breakdown : [{ method: o.payment_method, amount: getOrderTotal(o) }]
      rows.forEach(row => {
        const raw = (row.method || '').toLowerCase().trim()
        const key = KNOWN.includes(raw) ? raw : 'unknown'
        if (!map[key]) map[key] = { amount: 0, count: 0 }
        map[key].amount += Number(row.amount) || 0
        map[key].count++
      })
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
    { value: 'needs_bill', label: l.needsBillBadge },
    { value: 'active',     label: l.activeNotReady },
    { value: 'take_away',  label: l.takeAway       },
    { value: 'delivery',   label: l.delivery       },
  ]

  const sortOptions = SORT_OPTIONS(l).map(o => ({ value: o.key, label: o.label }))

  // ── Filtered + sorted bills ────────────────────────────────────────────────
  const filteredBills = useMemo(() => {
    const q = search.toLowerCase().trim()
    let result = activeBills

    // Search
    if (q) {
      result = result.filter(o => {
        const matchTable  = o.table_name?.toLowerCase().includes(q) || o.order_number?.toLowerCase().includes(q)
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
        const isTakeAway = isTakeAwayBill(o)
        const isDelivery = isDeliveryOrderType(inferOrderType(o))
        if (filterStatus === 'needs_bill') return !isTakeAway && !isDelivery && o.status === 'needs_bill'
        if (filterStatus === 'active') return !isTakeAway && !isDelivery && o.status !== 'needs_bill'
        if (filterStatus === 'take_away') return isTakeAway
        if (filterStatus === 'delivery') return isDelivery
        return false
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

  const billSections = useMemo(() => {
    const needsBill = filteredBills.filter(o => !isOffPremiseOrderType(inferOrderType(o)) && o.status === 'needs_bill')
    const active = filteredBills.filter(o => !isOffPremiseOrderType(inferOrderType(o)) && o.status !== 'needs_bill')
    const takeAway = filteredBills.filter(isTakeAwayBill)
    const delivery = filteredBills.filter(o => isDeliveryOrderType(inferOrderType(o)))

    return [
      { key: 'needs_bill', title: l.needsBill, tone: 'red', icon: CreditCard, bills: needsBill },
      { key: 'active', title: l.activeTableBills, tone: 'amber', icon: Receipt, bills: active },
      { key: 'take_away', title: l.takeAwayBills, tone: 'blue', icon: Receipt, bills: takeAway },
      { key: 'delivery', title: l.deliveryBills, tone: 'purple', icon: Receipt, bills: delivery },
    ].filter(section => section.bills.length > 0)
  }, [filteredBills, l])

  const visibleBillCount = billSections.reduce((sum, section) => sum + section.bills.length, 0)

  function handleRecallTable(order) {
    if (!order?.table_id) return
    dispatch({ type: 'RECALL_TABLE_FROM_CASHIER', payload: order.table_id })
  }

  async function handleDeleteOrder(order) {
    if (!isOwner || !order?.id || deletingOrderId) return
    setDeleteErrorByOrderId(errors => ({ ...errors, [order.id]: '' }))
    if (confirmDeleteOrderId !== order.id) {
      setConfirmDeleteOrderId(order.id)
      return
    }

    setDeletingOrderId(order.id)
    try {
      const result = await dispatch({
        type: 'DELETE_ORDER',
        payload: { orderId: order.id },
      })
      if (result?.error) {
        setDeleteErrorByOrderId(errors => ({
          ...errors,
          [order.id]: result.error.message || String(result.error),
        }))
        return
      }
      setConfirmDeleteOrderId('')
    } finally {
      setDeletingOrderId('')
    }
  }

  async function handleAddQuickItem(order, item) {
    if (!order?.id || !item?.id) return
    const orderType = inferOrderType(order)
    const busyKey = `${order.id}:${item.id}`
    setQuickAddBusyKey(busyKey)
    setQuickAddErrorByOrderId(current => ({ ...current, [order.id]: '' }))
    try {
      const result = await dispatch({
        type: 'ADD_QUICK_ITEM_TO_ORDER',
        payload: {
          tableId: isOffPremiseOrderType(orderType) ? null : order.table_id,
          orderId: isOffPremiseOrderType(orderType) ? order.id : null,
          item,
        },
      })
      if (result?.error) throw result.error
    } catch (err) {
      setQuickAddErrorByOrderId(current => ({
        ...current,
        [order.id]: err?.message || l.addQuickFailed,
      }))
    } finally {
      setQuickAddBusyKey('')
    }
  }

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
                {visibleBillCount}
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
          {visibleBillCount === 0 ? (
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
            billSections.map(section => (
              <BillsSection
                key={section.key}
                title={section.title}
                count={countLabel(section.bills.length, lang)}
                icon={section.icon}
                tone={section.tone}
              >
                {section.bills.map(order => (
                  <BillCard
                    key={order.id}
                    order={order}
                    table={tableMap[order.table_id]}
                    menuItemMap={menuItemMap}
                    lang={lang}
                    quickItems={quickItems}
                    onOpen={bill => navigate(isOffPremiseOrderType(inferOrderType(bill))
                      ? `/cashier/bill/order/${bill.id}`
                      : `/cashier/bill/${bill.table_id}`
                    )}
                    onAddQuickItem={handleAddQuickItem}
                    quickAddBusyKey={quickAddBusyKey}
                    quickAddError={quickAddErrorByOrderId[order.id]}
                    canDelete={isOwner}
                    onRecall={handleRecallTable}
                    onDelete={handleDeleteOrder}
                    confirmDelete={confirmDeleteOrderId === order.id}
                    isDeleting={deletingOrderId === order.id}
                    deleteError={deleteErrorByOrderId[order.id]}
                  />
                ))}
              </BillsSection>
            ))
          )}

          <PaidTodaySummary
            orders={paidTodayOrders}
            lang={lang}
            expanded={showPaidToday}
            onToggle={() => setShowPaidToday(value => !value)}
          />

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
