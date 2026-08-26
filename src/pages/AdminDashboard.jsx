import React, { useMemo, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  TrendingUp, ShoppingBag, Package, Receipt,
  Clock, CalendarDays, ArrowUpRight, ArrowDownRight, Users, Loader2,
  Printer, CreditCard, Trash2, Wallet, Monitor, BadgeDollarSign,
} from 'lucide-react'
import { useApp } from '../store/AppContext'
import { useAuth } from '../contexts/AuthContext'
import { formatCurrency, formatCurrencyWithPercentage } from '../lib/formatCurrency'
import { formatDateOnly, formatLongDate, formatTime, normalizeDateLang, parseInstantDate } from '../lib/dateFormat'
import {
  addRestaurantDays,
  getRestaurantHour,
  getOrderDate,
  getOrderActivityDate,
  getOrderItems,
  getOrderLoyaltyIncomeTotal,
  getOrderRevenueTotal,
  getOrderTotal,
  groupOrdersBySession,
  isActiveNeedsBillOrder,
  isPaidOrder,
  restaurantTodayStr,
  getSoldOrderItems,
  toRestaurantDateStr,
} from '../lib/analytics'
import {
  formatReadableDateTime,
  getDashboardBestSelling,
  getDashboardOrderTypePerformance,
  getDashboardPaymentMethods,
  getDashboardPeriodCafeIncome,
  getDashboardPeriodOrders,
  getRollingDashboardMonthRange,
  getDashboardSalesByCategory,
  isOrderInDashboardPeriod,
} from '../lib/dashboardAnalytics'
import AppShell from '../components/AppShell'
import { inferOrderType, orderTypeLabel } from '../lib/orderTypes'
import { canDeletePaidOrders } from '../lib/permissions'
import { loadPaidOrdersForRange, mergePaidOrderHistory } from '../lib/orderHistory'
import { getOrdersNetProfit, getSaleProfitSummary } from '../lib/profit'

// ── Localisation ──────────────────────────────────────────────────────────────
const L = {
  uz: {
    title:          'Boshqaruv paneli',
    greeting:       n => `Xush kelibsiz, ${n}! 👋`,
    subtitle:       "Bugun Zar Kebab'da nima bo'layotganini ko'rishingiz mumkin.",
    todayRevenue:   'Bugungi daromad',
    loyaltyIncome:  'Loyallik daromadi',
    netProfit:      'Sof foyda',
    ordersToday:    'Bugungi buyurtmalar',
    avgOrder:       "O'rtacha buyurtma",
    itemsSold:      'Sotilgan taomlar',
    activeBills:    'Faol hisoblar',
    needAttention:  'DIQQAT TALAB QILADI',
    yesterday:      'Kecha',
    vsYesterday:    'kechaga nisbatan',
    revenueStats:   'Daromad statistikasi',
    avgDailyCafeIncome: "Kafe o'rtacha kunlik daromadi",
    today:          'Bugun',
    days7:          '7 kun',
    rollingMonth:   'Oy',
    thisMonth:      'Bu oy',
    thisYear:       'Bu yil',
    prevPeriod:     'Oldingi davr',
    thisPeriod:     'Bu davr',
    growth:         'O\'sish',
    paymentMethods: "To'lov usullari",
    cash:           'Naqd',
    card:           'Karta',
    terminal:       'Terminal',
    unknown:        "Noma'lum",
    salesByCategory:'Kategoriya bo\'yicha savdo',
    orderTypePerformance:'Buyurtma turi bo‘yicha savdo',
    topOrderType:    'Eng yaxshisi',
    bestSelling:    "Eng ko'p sotilgan taomlar",
    noSales:        "Savdo ma'lumotlari yo'q",
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
    deleteOrder:    "O'chirish",
    confirmDelete:  "Tasdiqlash",
    deleting:       "O'chirilmoqda",
    deleteFailed:   "Buyurtmani o'chirib bo'lmadi",
  },
  ru: {
    title:          'Панель управления',
    greeting:       n => `Добро пожаловать, ${n}! 👋`,
    subtitle:       'Вот что сегодня происходит в Zar Kebab.',
    todayRevenue:   'Доход сегодня',
    loyaltyIncome:  'Доход по лояльности',
    netProfit:      'Чистая прибыль',
    ordersToday:    'Заказы сегодня',
    avgOrder:       'Средний заказ',
    itemsSold:      'Продано блюд',
    activeBills:    'Активные счета',
    needAttention:  'ТРЕБУЕТ ВНИМАНИЯ',
    yesterday:      'Вчера',
    vsYesterday:    'vs вчера',
    revenueStats:   'Статистика дохода',
    avgDailyCafeIncome: 'Среднедневной доход кафе',
    today:          'Сегодня',
    days7:          '7 дней',
    rollingMonth:   'Месяц',
    thisMonth:      'Этот месяц',
    thisYear:       'Этот год',
    prevPeriod:     'Предыдущий период',
    thisPeriod:     'Этот период',
    growth:         'Рост',
    paymentMethods: 'Способы оплаты',
    cash:           'Наличные',
    card:           'Карта',
    terminal:       'Терминал',
    unknown:        'Неизвестно',
    salesByCategory:'Продажи по категориям',
    orderTypePerformance:'Продажи по типу заказа',
    topOrderType:    'Лучший',
    bestSelling:    'Самые продаваемые',
    noSales:        'Данных о продажах нет',
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
    deleteOrder:    'Удалить',
    confirmDelete:  'Подтвердить',
    deleting:       'Удаление',
    deleteFailed:   'Не удалось удалить заказ',
  },
  en: {
    title:          'Dashboard',
    greeting:       n => `Welcome back, ${n}! 👋`,
    subtitle:       "Here's what's happening at Zar Kebab today.",
    todayRevenue:   "Today's Income",
    loyaltyIncome:  'Loyalty income',
    netProfit:      'Net Profit',
    ordersToday:    'Orders Today',
    avgOrder:       'Avg Order Value',
    itemsSold:      'Items Sold',
    activeBills:    'Active Bills',
    needAttention:  'NEED ATTENTION',
    yesterday:      'Yesterday',
    vsYesterday:    'vs yesterday',
    revenueStats:   'Income Statistics',
    avgDailyCafeIncome: 'Avg daily cafe income',
    today:          'Today',
    days7:          '7 Days',
    rollingMonth:   'Month',
    thisMonth:      'This Month',
    thisYear:       'This Year',
    prevPeriod:     'Previous Period',
    thisPeriod:     'This Period',
    growth:         'Growth',
    paymentMethods: 'Payment Methods',
    cash:           'Cash',
    card:           'Card',
    terminal:       'Terminal',
    unknown:        'Unknown',
    salesByCategory:'Sales by Category',
    orderTypePerformance:'Order Type Performance',
    topOrderType:    'Best',
    bestSelling:    'Best-Selling Dishes',
    noSales:        'No sales data yet',
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
    revenue:        'Income',
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
    deleteOrder:    'Delete',
    confirmDelete:  'Confirm',
    deleting:       'Deleting',
    deleteFailed:   'Could not delete order',
  },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function localDateStr(d) {
  return toRestaurantDateStr(d)
}

function todayStr()     { return restaurantTodayStr() }
function yesterdayStr() { return addRestaurantDays(todayStr(), -1) }

function isOrderInPeriod(order, period) {
  return isOrderInDashboardPeriod(order, period)
}

function recentOrderActivityAt(order) {
  return order?._recentActivityAt || getOrderActivityDate(order) || getOrderDate(order) || order?.created_at
}

function recentDateTimeLabel(iso, lang) {
  if (!iso) return ''
  const date = formatLongDate(iso, lang, '', { includeYear: false })
  const time = formatTime(iso)
  return date && time ? `${date}, ${time}` : date || time
}

function recentTimeLabel(iso) {
  return formatTime(iso)
}

function groupPaidRecentOrders(orders, lang) {
  const groups = []
  const byKey = new Map()

  orders.forEach(order => {
    const paidAt = order?.paid_at || getOrderDate(order) || recentOrderActivityAt(order)
    const key = toRestaurantDateStr(paidAt) || 'unknown'
    let group = byKey.get(key)

    if (!group) {
      group = {
        key,
        label: formatLongDate(paidAt || key, lang, key, { includeYear: false }) || key,
        orders: [],
      }
      byKey.set(key, group)
      groups.push(group)
    }

    group.orders.push(order)
  })

  return groups
}

function orderContextBadge(order, lang, fallback) {
  const orderType = inferOrderType(order)
  if (orderType === 'delivery') {
    return {
      label: orderTypeLabel(orderType, lang),
      cls: 'bg-purple-50 text-purple-700 border-purple-200',
    }
  }
  if (orderType === 'take_away') {
    return {
      label: orderTypeLabel(orderType, lang),
      cls: 'bg-blue-50 text-blue-700 border-blue-200',
    }
  }
  return {
    label: order?.table_name || fallback,
    cls: 'bg-orange-50 text-[#c2410c] border-orange-200',
  }
}

function shortLabel(ds, mode) {
  if (mode === 'today')  return `${ds.slice(11, 16)}` // hour label passed in directly
  if (mode === 'year')   return ds.slice(5, 7)
  return formatDateOnly(ds)
}

function dashboardPeriodLabel(period, lang) {
  const labels = {
    uz: { today: 'Bugun', '7days': '7 kun', rollingMonth: 'Oy', month: 'Bu oy', year: 'Bu yil' },
    ru: { today: 'Сегодня', '7days': '7 дней', rollingMonth: 'Месяц', month: 'Этот месяц', year: 'Этот год' },
    en: { today: 'Today', '7days': '7 days', rollingMonth: 'Month', month: 'This month', year: 'This year' },
  }
  return (labels[lang] || labels.en)[period] || (labels[lang] || labels.en)['7days']
}

function previousDashboardPeriodLabel(period, lang, fallback) {
  if (period !== 'today') return fallback
  if (lang === 'uz') return 'Kecha'
  if (lang === 'ru') return 'Вчера'
  return 'Yesterday'
}

function getPreviousDashboardPeriodOrders(orders, period) {
  const todayDs = todayStr()

  if (period === 'today') {
    const yesterday = addRestaurantDays(todayDs, -1)
    return orders.filter(order => localDateStr(getOrderDate(order)) === yesterday)
  }

  if (period === '7days') {
    const days = new Set(Array.from({ length: 7 }, (_, index) => addRestaurantDays(todayDs, -(13 - index))))
    return orders.filter(order => days.has(localDateStr(getOrderDate(order))))
  }

  if (period === 'rollingMonth') {
    const range = getRollingDashboardMonthRange(todayDs)
    const previousStart = addRestaurantDays(range.dateFrom, -range.dayCount)
    const previousEnd = addRestaurantDays(range.dateFrom, -1)
    return orders.filter(order => {
      const date = localDateStr(getOrderDate(order))
      return date >= previousStart && date <= previousEnd
    })
  }

  if (period === 'month') {
    const [year, monthNumber] = todayDs.split('-').map(Number)
    const month = monthNumber - 1
    const prevMonth = month === 0 ? 11 : month - 1
    const prevYear = month === 0 ? year - 1 : year
    const prefix = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-`
    return orders.filter(order => localDateStr(getOrderDate(order)).startsWith(prefix))
  }

  const year = Number(todayDs.slice(0, 4)) - 1
  return orders.filter(order => localDateStr(getOrderDate(order)).startsWith(`${year}-`))
}

function getDashboardHistoryRange(period, today = todayStr()) {
  if (period === 'today') return { dateFrom: addRestaurantDays(today, -1), dateTo: today }
  if (period === '7days') return { dateFrom: addRestaurantDays(today, -13), dateTo: today }
  if (period === 'rollingMonth') {
    const range = getRollingDashboardMonthRange(today)
    return { dateFrom: addRestaurantDays(range.dateFrom, -range.dayCount), dateTo: today }
  }
  if (period === 'month') {
    const previousMonthEnd = addRestaurantDays(`${today.slice(0, 8)}01`, -1)
    return { dateFrom: `${previousMonthEnd.slice(0, 8)}01`, dateTo: today }
  }
  return { dateFrom: `${Number(today.slice(0, 4)) - 1}-01-01`, dateTo: today }
}

function dashboardHistoryRangeKey(range) {
  return `${range.dateFrom}:${range.dateTo}`
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ShimmerBlock({ className = '' }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-lg bg-gradient-to-r from-gray-100 via-gray-50 to-gray-100 ${className}`}
    />
  )
}

function KpiCard({ icon: Icon, label, value, sub, subColor, badge, highlight, tone = 'default', loading = false }) {
  const isProfit = tone === 'profit' && !highlight
  const cardClass = highlight
    ? 'border-red-200 bg-white'
    : isProfit
      ? 'border-emerald-200 bg-gradient-to-br from-white to-emerald-50/70'
      : 'border-[#E5E7EB] bg-white'
  const iconClass = highlight
    ? 'bg-red-50 text-[#DC2626]'
    : isProfit
      ? 'bg-emerald-100 text-emerald-700'
      : 'bg-gray-50 text-[#6B7280]'
  const valueClass = highlight ? 'text-[#DC2626]' : isProfit ? 'text-emerald-700' : 'text-[#1F2937]'

  return (
    <div aria-busy={loading} className={`rounded-2xl border shadow-sm p-4 flex flex-col gap-2 min-w-0 h-full ${cardClass}`}>
      <div className="flex items-start justify-between gap-2">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${iconClass}`}>
          <Icon size={17} />
        </div>
        {!loading && badge && (
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5 whitespace-nowrap flex-shrink-0 ${badge.cls}`}>
            {badge.up !== null && (badge.up ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />)}
            {badge.text}
          </span>
        )}
      </div>
      {loading ? (
        <div className="space-y-2 py-0.5">
          <ShimmerBlock className="h-6 w-2/3" />
          <ShimmerBlock className="h-3 w-1/2" />
          <ShimmerBlock className="h-3 w-5/6" />
        </div>
      ) : (
        <div>
          <p className={`font-black text-xl leading-tight break-words tabular-nums mb-1 ${valueClass}`}>{value}</p>
          <p className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider leading-snug">{label}</p>
          {sub && <p className={`text-xs mt-0.5 leading-snug ${subColor || 'text-[#9CA3AF]'}`}>{sub}</p>}
        </div>
      )}
    </div>
  )
}

function ChartShimmer() {
  return (
    <div className="animate-pulse" aria-hidden="true">
      <div className="flex h-36 items-end gap-2 mb-4">
        {[28, 44, 35, 62, 48, 78, 56, 88, 68, 96, 74, 84].map((height, index) => (
          <div key={index} className="flex-1 rounded-t-md bg-gray-100" style={{ height: `${height}%` }} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3 border-t border-[#F3F4F6] pt-3">
        <ShimmerBlock className="h-9 w-4/5" />
        <ShimmerBlock className="h-9 w-4/5" />
        <ShimmerBlock className="h-9 w-3/5" />
      </div>
    </div>
  )
}

function ListShimmer({ rows = 5, withAvatar = false }) {
  return (
    <div className="animate-pulse space-y-3 py-1" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-3">
          {withAvatar && <div className="h-9 w-9 flex-shrink-0 rounded-xl bg-gray-100" />}
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <ShimmerBlock className="h-3 w-2/5" />
              <ShimmerBlock className="h-3 w-1/4" />
            </div>
            <ShimmerBlock className="h-1.5 w-full" />
          </div>
        </div>
      ))}
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
    ready:           { cls: 'bg-blue-50 text-blue-700 border-blue-200',      label: l.ready     },
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
    <div className="flex items-center justify-between gap-2 px-1 pt-1 mb-2 min-w-0">
      <p className="text-[11px] font-black tracking-[0.18em] text-[#8EA0BB] truncate min-w-0">
        {title}
      </p>
      <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-[#F1F5F9] text-[#8EA0BB] flex-shrink-0">
        {count}
      </span>
    </div>
  )
}

function RecentOrderRow({
  order,
  lang,
  paymentMeta,
  onPrintBill,
  onView,
  canDelete,
  onDelete,
  confirmDelete,
  isDeleting,
  deleteError,
  showDate = true,
}) {
  const l = L[lang] || L.en
  const isNeedsBill = order.status === 'needs_bill'
  const shortId = String(order.id).slice(-4).toUpperCase()
  const activityAt = recentOrderActivityAt(order)
  const timeText = showDate ? recentDateTimeLabel(activityAt, lang) : recentTimeLabel(activityAt)
  const contextBadge = orderContextBadge(order, lang, l.table)
  const PaymentIcon = paymentMeta?.Icon
  const LeadingIcon = !isNeedsBill && PaymentIcon ? PaymentIcon : Receipt
  const leadingIconClass = isNeedsBill
    ? 'bg-white text-[#EF3D32]'
    : paymentMeta
      ? `bg-[#F8FAFC] ${paymentMeta.cls}`
      : 'bg-[#FFF7ED] text-[#FF5A00]'

  function openOrder() {
    onView?.(order)
  }

  function handleKeyDown(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    openOrder()
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={openOrder}
      onKeyDown={handleKeyDown}
      className={`cursor-pointer rounded-xl border px-3 py-2.5 transition-all focus:outline-none focus:ring-2 focus:ring-[#ff5a00]/20 ${
      isNeedsBill
        ? 'bg-[#FFF8F8] border-[#FFD6D3]'
        : 'bg-white border-[#EDF1F5] hover:bg-[#FAFBFC]'
    }`}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-center max-[1320px]:grid-cols-1">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${leadingIconClass}`}
            title={!isNeedsBill && paymentMeta ? paymentMeta.label : undefined}
            aria-label={!isNeedsBill && paymentMeta ? paymentMeta.label : undefined}
          >
            <LeadingIcon size={14} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
              <p className="text-[15px] font-black text-[#1F2937] leading-none flex-shrink-0">#{shortId}</p>
              <span className={`inline-flex max-w-[150px] items-center rounded-full border px-2 py-0.5 text-[11px] font-black leading-none ${contextBadge.cls}`}>
                <span className="truncate">{contextBadge.label}</span>
              </span>
              {isNeedsBill && <RecentStatusPill status="needs_bill" lang={lang} />}
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#8EA0BB] min-w-0">
              <span className="inline-flex items-center gap-1 whitespace-nowrap flex-shrink-0">
                <Clock size={13} />
                {timeText}
              </span>
              {order.waiter_name && (
                <span className="font-semibold text-[#63738A] whitespace-normal break-words">· {order.waiter_name}</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2 flex-shrink-0 max-[1320px]:flex-row max-[1320px]:justify-between max-[1320px]:items-center">
          <p className="text-[14px] font-black text-[#111827] tabular-nums whitespace-nowrap">
            {formatCurrency(getOrderTotal(order))}
          </p>
          {isNeedsBill ? (
            <button
              type="button"
              onClick={event => {
                event.stopPropagation()
                onPrintBill(order)
              }}
              onKeyDown={event => event.stopPropagation()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#0F3B2E] text-white text-[12px] font-black hover:bg-[#0A2A20] active:scale-[0.98] transition-all shadow-[0_3px_8px_rgba(15,59,46,0.22)]"
            >
              <Printer size={13} />
              {l.printBill}
            </button>
          ) : (
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              {canDelete && (
                <button
                  type="button"
                  onClick={event => {
                    event.stopPropagation()
                    onDelete(order)
                  }}
                  onKeyDown={event => event.stopPropagation()}
                  disabled={isDeleting}
                  className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-black transition-colors disabled:opacity-60 ${
                    confirmDelete
                      ? 'bg-red-600 text-white hover:bg-red-700'
                      : 'bg-red-50 text-red-600 hover:bg-red-100'
                  }`}
                >
                  {isDeleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  {isDeleting ? l.deleting : confirmDelete ? l.confirmDelete : l.deleteOrder}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      {deleteError && (
        <p className="mt-2 rounded-lg bg-red-50 px-2 py-1.5 text-[11px] font-bold text-red-600">
          {l.deleteFailed}: {deleteError}
        </p>
      )}
    </div>
  )
}

const PAYMENT_COLORS = {
  cash:     '#16A34A',
  card:     '#7C3AED',
  terminal: '#2563EB',
  unknown:  '#D1D5DB',
}

const ORDER_TYPE_PERFORMANCE_STYLE = {
  dine_in: {
    Icon: Users,
    panel: 'bg-orange-50 border-orange-200',
    icon: 'bg-white text-[#ff5a00]',
    text: 'text-[#c2410c]',
    bar: 'bg-[#ff5a00]',
  },
  take_away: {
    Icon: ShoppingBag,
    panel: 'bg-blue-50 border-blue-200',
    icon: 'bg-white text-blue-700',
    text: 'text-blue-700',
    bar: 'bg-blue-600',
  },
  delivery: {
    Icon: Package,
    panel: 'bg-purple-50 border-purple-200',
    icon: 'bg-white text-purple-700',
    text: 'text-purple-700',
    bar: 'bg-purple-600',
  },
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

function OrderTypePerformanceCard({ rows, lang, loading = false }) {
  const l = L[lang] || L.en
  const maxRevenue = Math.max(...rows.map(row => row.revenue), 1)
  const topKey = rows.find(row => row.revenue > 0)?.key || ''

  return (
    <div aria-busy={loading} className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm p-5 mb-4 min-w-0">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="font-black text-[#1F2937] text-base">{l.orderTypePerformance}</h3>
        {!loading && topKey && (
          <span className="rounded-full bg-[#0F3B2E] px-3 py-1 text-[11px] font-black text-white">
            {l.topOrderType}: {rows.find(row => row.key === topKey)?.label}
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {loading ? Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="animate-pulse rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3" aria-hidden="true">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-gray-200" />
              <div className="flex-1 space-y-2">
                <ShimmerBlock className="h-3 w-2/5" />
                <ShimmerBlock className="h-3 w-1/4" />
              </div>
            </div>
            <ShimmerBlock className="mt-4 h-5 w-3/5" />
            <ShimmerBlock className="mt-3 h-1.5 w-full" />
          </div>
        )) : rows.map(row => {
          const visual = ORDER_TYPE_PERFORMANCE_STYLE[row.key] || ORDER_TYPE_PERFORMANCE_STYLE.dine_in
          const Icon = visual.Icon
          const width = row.revenue > 0 ? Math.max(6, Math.round((row.revenue / maxRevenue) * 100)) : 0
          const isTop = row.key === topKey

          return (
            <div key={row.key} className={`rounded-2xl border px-4 py-3 min-w-0 ${visual.panel}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${visual.icon}`}>
                    <Icon size={17} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-black text-[#1F2937] truncate">{row.label}</p>
                    <p className="text-xs font-semibold text-[#8EA0BB] truncate">{row.orders} {l.orders}</p>
                  </div>
                </div>
                {isTop && (
                  <span className={`rounded-full bg-white px-2 py-0.5 text-[10px] font-black ${visual.text}`}>
                    {l.topOrderType}
                  </span>
                )}
              </div>
              <div className="mt-3">
                <div className="flex items-end justify-between gap-2 mb-2">
                  <p className={`text-lg font-black tabular-nums truncate ${visual.text}`}>{formatCurrency(row.revenue)}</p>
                  <p className="text-xs font-black text-[#718096] flex-shrink-0">{row.pct}%</p>
                </div>
                <div className="h-1.5 rounded-full bg-white/80 overflow-hidden">
                  <div className={`h-full rounded-full ${visual.bar}`} style={{ width: `${width}%` }} />
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 text-[11px] font-bold text-[#718096]">
                  <span>{row.items} {l.items}</span>
                  <span>{l.avgOrderShort}: {formatCurrency(row.avgOrder)}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const { state, dispatch } = useApp()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const lang = normalizeDateLang(state.lang || 'ru')
  const l    = L[lang] || L.en

  const displayName = profile?.full_name || state.user?.name || 'Admin'

  const [period, setPeriod]           = useState('today')
  const [confirmDeleteOrderId, setConfirmDeleteOrderId] = useState('')
  const [deletingOrderId, setDeletingOrderId] = useState('')
  const [deleteErrorByOrderId, setDeleteErrorByOrderId] = useState({})
  const [paidHistoryOrders, setPaidHistoryOrders] = useState([])
  const [historyError, setHistoryError] = useState('')
  const [historyLoading, setHistoryLoading] = useState(true)
  const [loadedHistoryRangeKey, setLoadedHistoryRangeKey] = useState('')
  const canDeleteOrder = canDeletePaidOrders(profile || { role: state.user?.role })

  const dashboardHistoryRange = useMemo(() => getDashboardHistoryRange(period), [period])
  const requestedHistoryRangeKey = dashboardHistoryRangeKey(dashboardHistoryRange)
  const analyticsLoading = historyLoading || loadedHistoryRangeKey !== requestedHistoryRangeKey

  useEffect(() => {
    let cancelled = false
    const requestRangeKey = dashboardHistoryRangeKey(dashboardHistoryRange)
    setHistoryError('')
    setHistoryLoading(true)
    loadPaidOrdersForRange(dashboardHistoryRange.dateFrom, dashboardHistoryRange.dateTo)
      .then(orders => {
        if (cancelled) return
        setPaidHistoryOrders(orders)
        setLoadedHistoryRangeKey(requestRangeKey)
        setHistoryLoading(false)
      })
      .catch(error => {
        if (cancelled) return
        setPaidHistoryOrders([])
        setLoadedHistoryRangeKey(requestRangeKey)
        setHistoryError(error?.message || 'Could not load complete dashboard history')
        setHistoryLoading(false)
      })
    return () => { cancelled = true }
  }, [dashboardHistoryRange])

  // ── Core derived sets ─────────────────────────────────────────────────────
  const dashboardOrders = useMemo(
    () => mergePaidOrderHistory(
      paidHistoryOrders,
      state.orders,
      dashboardHistoryRange.dateFrom,
      dashboardHistoryRange.dateTo,
    ),
    [paidHistoryOrders, state.orders, dashboardHistoryRange]
  )
  const paidOrders = useMemo(
    () => groupOrdersBySession(dashboardOrders).filter(isPaidOrder),
    [dashboardOrders]
  )

  const periodPaidOrders = useMemo(
    () => getDashboardPeriodOrders(paidOrders, period),
    [paidOrders, period]
  )

  const menuItemMap = useMemo(
    () => Object.fromEntries(state.menuItems.map(m => [m.id, m])),
    [state.menuItems]
  )

  const categoryMap = useMemo(
    () => Object.fromEntries(state.categories.filter(c => c.id !== 'all').map(c => [c.id, c])),
    [state.categories]
  )

  // ── KPI: selected period revenue & orders ─────────────────────────────────
  const previousPeriodOrders = useMemo(
    () => getPreviousDashboardPeriodOrders(paidOrders, period),
    [paidOrders, period]
  )

  const {
    periodRevenue, periodLoyaltyIncome, previousKpiRevenue, revenueChange,
    periodNetProfit, periodProfitMargin, previousKpiNetProfit, netProfitChange,
    periodOrderCount, previousOrderCount, orderChange,
  } = useMemo(() => {
    const currentRevenue = periodPaidOrders.reduce((sum, order) => sum + getOrderRevenueTotal(order), 0)
    const currentLoyaltyIncome = periodPaidOrders.reduce((sum, order) => sum + getOrderLoyaltyIncomeTotal(order), 0)
    const previousRevenue = previousPeriodOrders.reduce((sum, order) => sum + getOrderRevenueTotal(order), 0)
    const currentNetProfit = getOrdersNetProfit(periodPaidOrders, menuItemMap)
    const previousNetProfit = getOrdersNetProfit(previousPeriodOrders, menuItemMap)
    const currentOrderCount = periodPaidOrders.length
    const previousCount = previousPeriodOrders.length
    return {
      periodRevenue: currentRevenue,
      periodLoyaltyIncome: currentLoyaltyIncome,
      previousKpiRevenue: previousRevenue,
      revenueChange: previousRevenue > 0
        ? Math.round(((currentRevenue - previousRevenue) / previousRevenue) * 100)
        : null,
      periodNetProfit: currentNetProfit,
      periodProfitMargin: getSaleProfitSummary(
        currentRevenue,
        currentRevenue - currentNetProfit
      )?.marginPct ?? null,
      previousKpiNetProfit: previousNetProfit,
      netProfitChange: previousNetProfit > 0
        ? Math.round(((currentNetProfit - previousNetProfit) / previousNetProfit) * 100)
        : null,
      periodOrderCount: currentOrderCount,
      previousOrderCount: previousCount,
      orderChange: previousCount > 0
        ? Math.round(((currentOrderCount - previousCount) / previousCount) * 100)
        : null,
    }
  }, [periodPaidOrders, previousPeriodOrders, menuItemMap])

  const activeBills = useMemo(
    () => state.tables.filter(t => t.status === 'needs_bill').length,
    [state.tables]
  )

  const selectedPeriodCafeIncome = useMemo(
    () => getDashboardPeriodCafeIncome(paidOrders, period),
    [paidOrders, period]
  )

  // ── Revenue chart & period comparison ─────────────────────────────────────
  const { chartBars, currentPeriodTotal, previousPeriodTotal } = useMemo(() => {
    const now = new Date()

    if (period === 'today') {
      const today = todayStr()
      const yesterday = yesterdayStr()
      const todayPaid = paidOrders.filter(o => localDateStr(getOrderDate(o)) === today)
      const yestPaid  = paidOrders.filter(o => localDateStr(getOrderDate(o)) === yesterday)
      const currentHour = getRestaurantHour(now)
      const bars = Array.from({ length: currentHour + 1 }, (_, h) => ({
        label:   `${h}:00`,
        revenue: todayPaid
          .filter(o => getRestaurantHour(getOrderDate(o)) === h)
          .reduce((s, o) => s + getOrderRevenueTotal(o), 0),
        isToday: h === currentHour,
      }))
      return {
        chartBars: bars,
        currentPeriodTotal:  todayPaid.reduce((s, o) => s + getOrderRevenueTotal(o), 0),
        previousPeriodTotal: yestPaid.reduce((s, o) => s + getOrderRevenueTotal(o), 0),
      }
    }

    if (period === '7days') {
      const todayDs = todayStr()
      const days = Array.from({ length: 7 }, (_, i) => addRestaurantDays(todayDs, -(6 - i)))
      const prev = Array.from({ length: 7 }, (_, i) => addRestaurantDays(todayDs, -(13 - i)))
      const bars = days.map(ds => ({
        label:   formatLongDate(ds, lang, ds, { includeYear: false }),
        revenue: paidOrders.filter(o => localDateStr(getOrderDate(o)) === ds).reduce((s, o) => s + getOrderRevenueTotal(o), 0),
        isToday: ds === todayDs,
      }))
      const prevTotal = prev.reduce((s, ds) =>
        s + paidOrders.filter(o => localDateStr(getOrderDate(o)) === ds).reduce((s2, o) => s2 + getOrderRevenueTotal(o), 0), 0)
      return {
        chartBars: bars,
        currentPeriodTotal:  bars.reduce((s, b) => s + b.revenue, 0),
        previousPeriodTotal: prevTotal,
      }
    }

    if (period === 'rollingMonth') {
      const range = getRollingDashboardMonthRange(todayStr())
      const days = Array.from({ length: range.dayCount }, (_, index) => addRestaurantDays(range.dateFrom, index))
      const previousStart = addRestaurantDays(range.dateFrom, -range.dayCount)
      const previousDays = Array.from({ length: range.dayCount }, (_, index) => addRestaurantDays(previousStart, index))
      const bars = days.map(date => ({
        label: formatLongDate(date, lang, date, { includeYear: false }),
        revenue: paidOrders
          .filter(order => localDateStr(getOrderDate(order)) === date)
          .reduce((sum, order) => sum + getOrderRevenueTotal(order), 0),
        isToday: date === range.dateTo,
      }))
      const previousPeriodTotal = previousDays.reduce((sum, date) => (
        sum + paidOrders
          .filter(order => localDateStr(getOrderDate(order)) === date)
          .reduce((dateSum, order) => dateSum + getOrderRevenueTotal(order), 0)
      ), 0)
      return {
        chartBars: bars,
        currentPeriodTotal: bars.reduce((sum, bar) => sum + bar.revenue, 0),
        previousPeriodTotal,
      }
    }

    if (period === 'month') {
      const todayDs = todayStr()
      const [year, monthNumber] = todayDs.split('-').map(Number)
      const month = monthNumber - 1
      const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
      const bars = Array.from({ length: daysInMonth }, (_, i) => {
        const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`
        return {
          label:   String(i + 1),
          revenue: paidOrders.filter(o => localDateStr(getOrderDate(o)) === ds).reduce((s, o) => s + getOrderRevenueTotal(o), 0),
          isToday: ds === todayDs,
        }
      })
      // Previous month
      const prevMonth     = month === 0 ? 11 : month - 1
      const prevYear      = month === 0 ? year - 1 : year
      const daysInPrevMonth = new Date(Date.UTC(prevYear, prevMonth + 1, 0)).getUTCDate()
      const prevTotal = Array.from({ length: daysInPrevMonth }, (_, i) => {
        const ds = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`
        return paidOrders.filter(o => localDateStr(getOrderDate(o)) === ds).reduce((s, o) => s + getOrderRevenueTotal(o), 0)
      }).reduce((s, v) => s + v, 0)
      return {
        chartBars: bars,
        currentPeriodTotal:  bars.reduce((s, b) => s + b.revenue, 0),
        previousPeriodTotal: prevTotal,
      }
    }

    // year
    const todayDs = todayStr()
    const year = Number(todayDs.slice(0, 4))
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    const bars = Array.from({ length: 12 }, (_, m) => {
      const prefix = `${year}-${String(m + 1).padStart(2, '0')}-`
      return {
        label:   monthNames[m],
        revenue: paidOrders.filter(o => localDateStr(getOrderDate(o)).startsWith(prefix)).reduce((s, o) => s + getOrderRevenueTotal(o), 0),
        isToday: todayDs.startsWith(prefix),
      }
    })
    return {
      chartBars: bars,
      currentPeriodTotal:  bars.reduce((s, b) => s + b.revenue, 0),
      previousPeriodTotal: 0, // prior year data not loaded
    }
  }, [paidOrders, period, lang])

  const periodGrowth = useMemo(() => {
    if (previousPeriodTotal === 0) return null
    return Math.round(((currentPeriodTotal - previousPeriodTotal) / previousPeriodTotal) * 100)
  }, [currentPeriodTotal, previousPeriodTotal])

  // ── Payment methods breakdown ─────────────────────────────────────────────
  const paymentMethods = useMemo(() => {
    return getDashboardPaymentMethods(periodPaidOrders, {
      cash: l.cash,
      card: l.card,
      terminal: l.terminal,
      loyalty: lang === 'uz' ? 'Sodiqlik' : lang === 'ru' ? 'Лояльность' : 'Loyalty',
      unknown: l.unknown,
      colors: PAYMENT_COLORS,
    }).map(row => ({
      ...row,
      color: row.color || PAYMENT_COLORS[row.key] || PAYMENT_COLORS.unknown,
    }))
  }, [periodPaidOrders, l])

  // ── Sales by category ─────────────────────────────────────────────────────
  const salesByCategory = useMemo(() => {
    return getDashboardSalesByCategory(periodPaidOrders, menuItemMap, categoryMap, lang)
  }, [periodPaidOrders, menuItemMap, categoryMap, lang])

  // ── Sales by order type ───────────────────────────────────────────────────
  const orderTypePerformance = useMemo(() => {
    return getDashboardOrderTypePerformance(periodPaidOrders, lang)
  }, [periodPaidOrders, lang])

  // ── Best-selling dishes ───────────────────────────────────────────────────
  const bestSelling = useMemo(() => {
    return getDashboardBestSelling(periodPaidOrders, menuItemMap)
  }, [periodPaidOrders, menuItemMap])

  // ── Recent orders: action-needed bills first, paid history second ─────────
  const recentOrderGroups = useMemo(() => {
    const grouped = groupOrdersBySession([
      ...dashboardOrders,
      ...state.orders.filter(order => !isPaidOrder(order)),
    ])
      .filter(o => {
        if (isPaidOrder(o)) return true
        return isActiveNeedsBillOrder(o, state.tables)
      })
      .map(order => ({
        ...order,
        _recentActivityAt: getOrderActivityDate(order, state.tables),
      }))
      .sort((a, b) => parseInstantDate(b._recentActivityAt || getOrderDate(b) || b.created_at) - parseInstantDate(a._recentActivityAt || getOrderDate(a) || a.created_at))

    const needsBill = grouped.filter(o => isActiveNeedsBillOrder(o, state.tables))
    const paid = grouped.filter(isPaidOrder)
    const visibleNeedsBill = needsBill.slice(0, 8)
    const visiblePaid = paid.slice(0, Math.max(0, 8 - visibleNeedsBill.length))

    return {
      needsBill: visibleNeedsBill,
      paid: visiblePaid,
      paidDateGroups: groupPaidRecentOrders(visiblePaid, lang),
      needsBillTotal: needsBill.length,
    }
  }, [dashboardOrders, state.orders, state.tables, lang])

  const recentOrdersCount = recentOrderGroups.needsBill.length + recentOrderGroups.paid.length

  function getPaymentMeta(order) {
    const method = (order.payment_method || '').toLowerCase()
    const map = {
      cash: { Icon: Wallet, label: l.cash, cls: 'text-green-600' },
      card: { Icon: CreditCard, label: l.card, cls: 'text-violet-600' },
      terminal: { Icon: Monitor, label: l.terminal, cls: 'text-blue-600' },
      loyalty: { Icon: CreditCard, label: lang === 'uz' ? 'Sodiqlik' : lang === 'ru' ? 'Лояльность' : 'Loyalty', cls: 'text-emerald-600' },
    }
    return map[method] || null
  }

  function printRecentBill(order) {
    navigate(`/receipt/table/${order.table_id}?print=1`)
  }

  function viewRecentOrder(order) {
    navigate(`/receipt/${order.id}`)
  }

  async function deleteRecentOrder(order) {
    if (!canDeleteOrder || !order?.id || deletingOrderId) return
    setDeleteErrorByOrderId(errors => ({ ...errors, [order.id]: '' }))
    if (confirmDeleteOrderId !== order.id) {
      setConfirmDeleteOrderId(order.id)
      return
    }

    setDeletingOrderId(order.id)
    try {
      const result = await dispatch({ type: 'DELETE_ORDER', payload: { orderId: order.id } })
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
  const lastUpdated = formatReadableDateTime(now)
  const currentKpiPeriodLabel = dashboardPeriodLabel(period, lang)
  const rollingMonthRange = getRollingDashboardMonthRange(todayStr())
  const previousKpiPeriodLabel = previousDashboardPeriodLabel(period, lang, l.prevPeriod)

  if (!state.loaded) {
    return (
      <AppShell title={l.title}>
        <div className="flex flex-col items-center justify-center h-64 gap-3">
          <Loader2 size={28} className="animate-spin text-[#ff5a00]" />
          <p className="text-sm text-gray-400">{l.loading}</p>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell title={l.greeting(displayName)}>
      <div className="w-full max-w-[1440px] mx-auto px-4 py-4 sm:px-5 lg:px-6 lg:py-5 overflow-x-hidden min-w-0">

        {/* Header */}
        <div className="mb-5 flex items-start justify-between flex-wrap gap-3 min-w-0">
          <div className="min-w-0 flex-1">
            <h2 className="font-black text-[#1F2937] text-2xl leading-tight">{l.greeting(displayName)}</h2>
            <p className="text-sm text-[#6B7280] mt-1">{l.subtitle}</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-[#6B7280] bg-white border border-gray-200 px-3 py-2 rounded-xl flex-shrink-0">
            <Clock size={13} />
            {lastUpdated}
          </div>
        </div>

        {historyError && (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
            {historyError}
          </div>
        )}

        {/* ── KPI cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5 gap-3 mb-5">
          <KpiCard
            icon={TrendingUp}
            loading={analyticsLoading}
            label={`${l.revenue} · ${currentKpiPeriodLabel}`}
            value={formatCurrency(periodRevenue)}
            sub={`${l.loyaltyIncome}: ${formatCurrency(periodLoyaltyIncome)} · ${previousKpiPeriodLabel}: ${formatCurrency(previousKpiRevenue)}`}
            badge={pctBadge(revenueChange)}
          />
          <KpiCard
            icon={BadgeDollarSign}
            loading={analyticsLoading}
            label={`${l.netProfit} · ${currentKpiPeriodLabel}`}
            value={formatCurrencyWithPercentage(periodNetProfit, periodProfitMargin, lang)}
            sub={`${previousKpiPeriodLabel}: ${formatCurrency(previousKpiNetProfit)}`}
            badge={pctBadge(netProfitChange)}
            tone="profit"
          />
          <KpiCard
            icon={CalendarDays}
            loading={analyticsLoading}
            label={`${l.avgDailyCafeIncome} · ${currentKpiPeriodLabel}`}
            value={formatCurrency(selectedPeriodCafeIncome.averageDaily)}
            sub={`${l.total}: ${formatCurrency(selectedPeriodCafeIncome.total)} · ${l.loyaltyIncome}: ${formatCurrency(selectedPeriodCafeIncome.loyaltyTotal)}`}
          />
          <KpiCard
            icon={ShoppingBag}
            loading={analyticsLoading}
            label={`${l.orders} · ${currentKpiPeriodLabel}`}
            value={periodOrderCount}
            sub={`${previousKpiPeriodLabel}: ${previousOrderCount}`}
            badge={pctBadge(orderChange)}
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
        <div className="grid grid-cols-12 gap-4 mb-4 min-w-0">

          {/* Revenue Statistics — left 2 cols */}
          <div aria-busy={analyticsLoading} className="col-span-12 xl:col-span-8 bg-white rounded-2xl border border-[#E5E7EB] shadow-sm p-5 min-w-0">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div>
                <h3 className="font-bold text-[#1F2937] text-base">{l.revenueStats}</h3>
                {period === 'rollingMonth' && (
                  <p className="mt-0.5 text-[11px] font-semibold text-[#9CA3AF]">
                    {formatLongDate(rollingMonthRange.dateFrom, lang, rollingMonthRange.dateFrom)} — {formatLongDate(rollingMonthRange.dateToExclusive, lang, rollingMonthRange.dateToExclusive)}
                  </p>
                )}
              </div>
              <div className="flex gap-1 flex-wrap">
                {[
                  { key: 'today',  label: l.today    },
                  { key: '7days',  label: l.days7    },
                  { key: 'rollingMonth', label: l.rollingMonth },
                  { key: 'month',  label: l.thisMonth },
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

            {analyticsLoading ? (
              <ChartShimmer />
            ) : (
              <>
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
                const show = chartBars.length <= 10 || i === chartBars.length - 1 || i % Math.ceil(chartBars.length / 10) === 0
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-[#F3F4F6]">
              <div className="min-w-0">
                <p className="text-xs text-[#9CA3AF] mb-1">{l.prevPeriod}</p>
                <p className="font-bold text-[#1F2937] text-sm truncate">{formatCurrency(previousPeriodTotal)}</p>
              </div>
              <div className="min-w-0">
                <p className="text-xs text-[#9CA3AF] mb-1">{l.thisPeriod}</p>
                <p className="font-bold text-[#1F2937] text-sm truncate">{formatCurrency(currentPeriodTotal)}</p>
              </div>
              <div className="min-w-0">
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
              </>
            )}
          </div>

          {/* Payment Methods */}
          <div aria-busy={analyticsLoading} className="col-span-12 xl:col-span-4 bg-white rounded-2xl border border-[#E5E7EB] shadow-sm p-5 min-w-0">
            <h3 className="font-black text-[#1F2937] text-base mb-4">{l.paymentMethods}</h3>
            {analyticsLoading ? (
              <div className="flex animate-pulse items-center gap-4 py-1" aria-hidden="true">
                <div className="h-28 w-28 flex-shrink-0 rounded-full border-[14px] border-gray-100" />
                <div className="flex-1 space-y-3">
                  <ShimmerBlock className="h-3 w-full" />
                  <ShimmerBlock className="h-3 w-5/6" />
                  <ShimmerBlock className="h-3 w-2/3" />
                </div>
              </div>
            ) : paymentMethods.length === 0 ? (
              <p className="text-sm text-[#9CA3AF] text-center py-4">{l.noData}</p>
            ) : (
              <div className="flex items-center gap-4 min-w-0">
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

        <OrderTypePerformanceCard rows={orderTypePerformance} lang={lang} loading={analyticsLoading} />

        {/* ── Row 3: Sales by Category + Best-Selling + Recent Orders ── */}
        <div className="grid grid-cols-12 gap-4 mb-4 min-w-0">

          {/* Sales by Category */}
          <div aria-busy={analyticsLoading} className="col-span-12 xl:col-span-4 flex min-h-0 min-w-0 flex-col bg-white rounded-2xl border border-[#E5E7EB] shadow-sm p-4">
            <h3 className="font-black text-[#1F2937] text-base mb-3">{l.salesByCategory} · {currentKpiPeriodLabel}</h3>
            {analyticsLoading ? (
              <ListShimmer rows={6} />
            ) : salesByCategory.length === 0 ? (
              <p className="text-sm text-[#9CA3AF] text-center py-6">{l.noSales}</p>
            ) : (
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                {salesByCategory.map(cat => (
                  <div key={cat.name}>
                    <div className="flex items-center justify-between mb-1 gap-2">
                      <p className="text-xs font-bold text-[#1F2937] truncate flex-1">{cat.name}</p>
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
          <div aria-busy={analyticsLoading} className="col-span-12 xl:col-span-4 bg-white rounded-2xl border border-[#E5E7EB] shadow-sm p-5 min-w-0">
            <h3 className="font-black text-[#1F2937] text-base mb-4">{l.bestSelling} · {currentKpiPeriodLabel}</h3>
            {analyticsLoading ? (
              <ListShimmer rows={6} withAvatar />
            ) : bestSelling.length === 0 ? (
              <p className="text-sm text-[#9CA3AF] text-center py-6">{l.noSales}</p>
            ) : (
              <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
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
                    <p className="text-xs font-black text-[#1F2937] flex-shrink-0 whitespace-nowrap">{formatCurrency(item.revenue)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Orders */}
          <div className="col-span-12 xl:col-span-4 bg-white rounded-[24px] border border-[#E5E7EB] shadow-[0_2px_8px_rgba(15,23,42,0.05)] p-5 min-w-0">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="min-w-0 flex-1">
                <h3 className="font-black text-[#1F2937] text-xl leading-tight">{l.recentOrders}</h3>
                <p className="text-sm text-[#8EA0BB] mt-2 leading-snug">{l.recentOrdersSub}</p>
              </div>
              <div className="min-w-[76px] max-w-[92px] px-2 h-16 rounded-2xl bg-[#0F3B2E] text-white flex flex-col items-center justify-center shadow-[0_6px_14px_rgba(15,59,46,0.18)] flex-shrink-0">
                <span className="text-xl font-black leading-none">{recentOrderGroups.needsBillTotal}</span>
                <span className="text-[9px] font-bold tracking-wide uppercase text-[#C9DCD5] mt-1 text-center leading-tight">{l.needsBill}</span>
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
                        paymentMeta={getPaymentMeta(order)}
                        onPrintBill={printRecentBill}
                        onView={viewRecentOrder}
                        canDelete={false}
                      />
                    ))}
                    </div>
                  </div>
                )}

                {recentOrderGroups.paid.length > 0 && (
                  <div>
                    <RecentSectionHeader title={l.paidSection} count={recentOrderGroups.paid.length} />
                    <div className="space-y-3">
                    {recentOrderGroups.paidDateGroups.map(group => (
                      <div key={group.key} className="space-y-2">
                        <div className="flex items-center justify-between gap-2 px-1.5 py-0.5 text-[11px] font-black text-[#64748B]">
                          <span className="uppercase tracking-[0.12em]">{group.label}</span>
                          <span className="rounded-full bg-[#F1F5F9] px-2 py-0.5 text-[#8EA0BB]">{group.orders.length}</span>
                        </div>
                        <div className="space-y-2">
                          {group.orders.map(order => (
                            <RecentOrderRow
                              key={order.id}
                              order={order}
                              lang={lang}
                              paymentMeta={getPaymentMeta(order)}
                              onPrintBill={printRecentBill}
                              onView={viewRecentOrder}
                              canDelete={canDeleteOrder}
                              onDelete={deleteRecentOrder}
                              confirmDelete={confirmDeleteOrderId === order.id}
                              isDeleting={deletingOrderId === order.id}
                              deleteError={deleteErrorByOrderId[order.id]}
                              showDate={false}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                    </div>
                  </div>
                )}
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
