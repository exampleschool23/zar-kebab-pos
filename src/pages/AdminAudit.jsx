import React, { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ChevronDown, ReceiptText, RefreshCw, ShieldCheck, UserRound } from 'lucide-react'
import AppShell from '../components/AppShell'
import { supabase } from '../lib/supabase'
import { useApp } from '../store/AppContext'
import { formatCurrency } from '../lib/formatCurrency'
import { ORDER_TYPE_LABELS, inferOrderType, isOffPremiseOrderType, orderTypeLabel } from '../lib/orderTypes'
import { formatDateTime, parseInstantDate } from '../lib/dateFormat'

function fmtDate(value, lang = 'ru') {
  return formatDateTime(value, '—')
}

function shortOrderId(orderId) {
  return String(orderId || '').slice(-6).toUpperCase() || '—'
}

function actorLabel(row) {
  return row.actor?.full_name || row.actor?.email || row.actor_id || '—'
}

function orderAuditLabel(row, lang) {
  const order = row.order
  if (!order) return `#${shortOrderId(row.order_id)}`
  const orderType = inferOrderType(order)
  if (isOffPremiseOrderType(orderType)) {
    return `${orderTypeLabel(orderType, lang)} · ${order.order_number || row.order_id}`
  }
  return order.table_name || `#${shortOrderId(row.order_id)}`
}

function orderAuditMeta(row, l) {
  const order = row.order
  const parts = []
  if (order?.order_number && !orderAuditLabel(row, 'en').includes(order.order_number)) parts.push(order.order_number)
  if (order?.waiter_name) parts.push(order.waiter_name)
  parts.push(`${l.rawId}: ${shortOrderId(row.order_id)}`)
  return parts.join(' · ')
}

function groupAuditRows(rows) {
  const map = new Map()
  for (const row of rows) {
    const key = row.order_id || row.id
    if (!map.has(key)) map.set(key, { orderId: key, order: row.order, rows: [] })
    const group = map.get(key)
    group.order ||= row.order
    group.rows.push(row)
  }
  return [...map.values()]
    .map(group => ({
      ...group,
      rows: group.rows.sort((a, b) => parseInstantDate(b.changed_at || 0) - parseInstantDate(a.changed_at || 0)),
    }))
    .sort((a, b) => parseInstantDate(b.rows[0]?.changed_at || 0) - parseInstantDate(a.rows[0]?.changed_at || 0))
}

function actionLabel(action, lang) {
  const labels = {
    mark_paid: { uz: 'To‘lov tasdiqlandi', ru: 'Оплата подтверждена', en: 'Payment confirmed' },
    payment_fields_changed: { uz: 'To‘lov summasi o‘zgardi', ru: 'Изменены суммы оплаты', en: 'Payment fields changed' },
    status_changed: { uz: 'Status o‘zgardi', ru: 'Статус изменён', en: 'Status changed' },
    reopen_paid_order: { uz: 'To‘langan buyurtma ochildi', ru: 'Оплаченный заказ открыт', en: 'Paid order reopened' },
    order_item_deleted: { uz: 'Taom o‘chirildi', ru: 'Блюдо удалено', en: 'Order item deleted' },
    order_cancelled: { uz: 'Buyurtma bekor qilindi', ru: 'Заказ отменён', en: 'Order cancelled' },
    settle_loyalty_wallet_payment: { uz: 'Sodiqlik to‘lovi hisoblandi', ru: 'Расчёт оплаты лояльностью', en: 'Loyalty wallet payment settled' },
  }
  return labels[action]?.[lang] || action || '—'
}

function paymentMethodLabel(method, lang) {
  const labels = {
    cash: { uz: 'Naqd', ru: 'Наличные', en: 'Cash' },
    card: { uz: 'Karta', ru: 'Карта', en: 'Card' },
    terminal: { uz: 'Terminal', ru: 'Терминал', en: 'Terminal' },
    qr: { uz: 'QR kod', ru: 'QR-код', en: 'QR Code' },
    qr_code: { uz: 'QR kod', ru: 'QR-код', en: 'QR Code' },
    loyalty: { uz: 'Sodiqlik balansi', ru: 'Баланс лояльности', en: 'Loyalty balance' },
    loyalty_card: { uz: 'Sodiqlik kartasi', ru: 'Карта лояльности', en: 'Loyalty card' },
    split: { uz: 'Bo‘lingan to‘lov', ru: 'Раздельная оплата', en: 'Split payment' },
  }
  if (!method) return '—'
  return labels[method]?.[lang] || method
}

function statusLabel(status, lang) {
  const labels = {
    active: { uz: 'Faol', ru: 'Активен', en: 'Active' },
    preparing: { uz: 'Tayyorlanmoqda', ru: 'Готовится', en: 'Preparing' },
    ready: { uz: 'Tayyor', ru: 'Готов', en: 'Ready' },
    served: { uz: 'Berildi', ru: 'Подано', en: 'Served' },
    needs_bill: { uz: 'Hisob kerak', ru: 'Нужен счёт', en: 'Needs bill' },
    paid: { uz: 'To‘landi', ru: 'Оплачен', en: 'Paid' },
    cancelled: { uz: 'Bekor qilingan', ru: 'Отменён', en: 'Cancelled' },
    unpaid: { uz: 'To‘lanmagan', ru: 'Не оплачен', en: 'Unpaid' },
    pending: { uz: 'Kutilmoqda', ru: 'Ожидает', en: 'Pending' },
    take_away: ORDER_TYPE_LABELS.take_away,
    delivery: ORDER_TYPE_LABELS.delivery,
    'Take Away': ORDER_TYPE_LABELS.take_away,
    Delivery: ORDER_TYPE_LABELS.delivery,
  }
  if (!status) return '—'
  return labels[status]?.[lang] || status
}

export default function AdminAudit() {
  const { state } = useApp()
  const lang = state.lang || 'ru'
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  const l = {
    uz: {
      title: 'Audit',
      sub: 'To‘lovlar va pul maydonlari o‘zgarishlari',
      refresh: 'Yangilash',
      empty: 'Audit yozuvlari yo‘q',
      error: 'Auditni yuklab bo‘lmadi',
      order: 'Buyurtma',
      action: 'Amal',
      total: 'Jami',
      service: 'Servis',
      discount: 'Sodiqlik',
      method: 'To‘lov',
      status: 'Status',
      time: 'Vaqt',
      latest: 'Oxirgi',
      changes: 'O‘zgarishlar',
      actor: 'Kim o‘zgartirdi',
      rawId: 'ID',
      details: 'Tafsilotlar',
      before: 'Oldin',
      after: 'Keyin',
      filters: 'Filtrlar',
      searchPlaceholder: 'Buyurtma, foydalanuvchi yoki amal...',
      allActions: 'Barcha amallar',
      allStatuses: 'Barcha statuslar',
      migrationMissing: 'Audit jadvali hali bazada yaratilmagan. Supabase SQL editorida supabase/010_order_payment_audit_and_guards.sql migratsiyasini ishga tushiring.',
    },
    ru: {
      title: 'Аудит',
      sub: 'Изменения оплат и денежных полей',
      refresh: 'Обновить',
      empty: 'Записей аудита пока нет',
      error: 'Не удалось загрузить аудит',
      order: 'Заказ',
      action: 'Действие',
      total: 'Итого',
      service: 'Сервис',
      discount: 'Лояльность',
      method: 'Оплата',
      status: 'Статус',
      time: 'Время',
      latest: 'Последнее',
      changes: 'Изменения',
      actor: 'Кто изменил',
      rawId: 'ID',
      details: 'Детали',
      before: 'Было',
      after: 'Стало',
      filters: 'Фильтры',
      searchPlaceholder: 'Заказ, пользователь или действие...',
      allActions: 'Все действия',
      allStatuses: 'Все статусы',
      migrationMissing: 'Таблица аудита ещё не создана в базе. Запустите миграцию supabase/010_order_payment_audit_and_guards.sql в Supabase SQL Editor.',
    },
    en: {
      title: 'Audit',
      sub: 'Payment and money-field changes',
      refresh: 'Refresh',
      empty: 'No audit records yet',
      error: 'Could not load audit',
      order: 'Order',
      action: 'Action',
      total: 'Total',
      service: 'Service',
      discount: 'Loyalty used',
      method: 'Payment',
      status: 'Status',
      time: 'Time',
      latest: 'Latest',
      changes: 'Changes',
      actor: 'Changed by',
      rawId: 'ID',
      details: 'Details',
      before: 'Before',
      after: 'After',
      filters: 'Filters',
      searchPlaceholder: 'Order, user, or action...',
      allActions: 'All actions',
      allStatuses: 'All statuses',
      migrationMissing: 'The audit table has not been created in the database yet. Run supabase/010_order_payment_audit_and_guards.sql in the Supabase SQL Editor.',
    },
  }[lang] || {}

  async function loadAudit() {
    setLoading(true)
    setError('')
    const { data, error } = await supabase
      .from('order_payment_audit')
      .select('*')
      .order('changed_at', { ascending: false })
      .limit(100)

    if (error) {
      setError(error.message)
      setRows([])
    } else {
      const auditRows = data || []
      const orderIds = [...new Set(auditRows.map(row => row.order_id).filter(Boolean))]
      const actorIds = [...new Set(auditRows.map(row => row.actor_id).filter(Boolean))]

      const [ordersRes, profilesRes] = await Promise.all([
        orderIds.length > 0
          ? supabase
              .from('orders')
              .select('id, order_number, table_name, table_id, order_type, status, payment_status, waiter_name, total, created_at, paid_at')
              .in('id', orderIds)
          : Promise.resolve({ data: [] }),
        actorIds.length > 0
          ? supabase
              .from('profiles')
              .select('id, full_name, email')
              .in('id', actorIds)
          : Promise.resolve({ data: [] }),
      ])

      const ordersById = Object.fromEntries((ordersRes.data || []).map(order => [order.id, order]))
      const profilesById = Object.fromEntries((profilesRes.data || []).map(profile => [profile.id, profile]))
      setRows(auditRows.map(row => ({
        ...row,
        order: ordersById[row.order_id] || null,
        actor: profilesById[row.actor_id] || null,
      })))
    }
    setLoading(false)
  }

  useEffect(() => {
    loadAudit()
  }, [])

  const actions = useMemo(() => [...new Set(rows.map(row => row.action).filter(Boolean))].sort(), [rows])
  const statuses = useMemo(() => [...new Set(rows.flatMap(row => [row.old_status, row.new_status, row.old_payment_status, row.new_payment_status]).filter(Boolean))].sort(), [rows])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(row => {
      const matchAction = actionFilter === 'all' || row.action === actionFilter
      const matchStatus = statusFilter === 'all' ||
        row.old_status === statusFilter ||
        row.new_status === statusFilter ||
        row.old_payment_status === statusFilter ||
        row.new_payment_status === statusFilter
      const haystack = [
        row.order_id,
        row.order?.order_number,
        row.order?.table_name,
        orderAuditLabel(row, lang),
        row.action,
        row.actor_id,
        actorLabel(row),
        row.old_status,
        row.new_status,
        row.old_payment_status,
        row.new_payment_status,
        row.old_payment_method,
        row.new_payment_method,
      ].join(' ').toLowerCase()
      return matchAction && matchStatus && (!q || haystack.includes(q))
    })
  }, [actionFilter, lang, rows, search, statusFilter])

  const groupedRows = useMemo(() => groupAuditRows(filteredRows), [filteredRows])

  const content = useMemo(() => {
    if (loading) {
      return Array.from({ length: 5 }).map((_, idx) => (
        <div key={idx} className="h-24 animate-pulse rounded-2xl border border-gray-100 bg-white" />
      ))
    }

    if (error) {
      const tableMissing = /order_payment_audit|schema cache|does not exist|not find the table/i.test(error || '')
      return (
        <div className="rounded-2xl border border-red-100 bg-red-50 p-6 text-red-700">
          <div className="flex items-center gap-2 font-black">
            <AlertTriangle size={18} />
            {l.error}
          </div>
          <p className="mt-2 text-sm">{tableMissing ? l.migrationMissing : error}</p>
          {tableMissing && (
            <p className="mt-2 rounded-xl bg-white/70 px-3 py-2 font-mono text-xs text-red-800">
              supabase/010_order_payment_audit_and_guards.sql
            </p>
          )}
        </div>
      )
    }

    if (groupedRows.length === 0) {
      return (
        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-10 text-center shadow-sm">
          <ShieldCheck size={34} className="mx-auto mb-3 text-[#CBD5E1]" />
          <p className="font-black text-[#1F2937]">{l.empty}</p>
        </div>
      )
    }

    return groupedRows.map((group, index) => {
      const latest = group.rows[0]
      return (
        <details key={group.orderId} open={index === 0} className="group rounded-2xl border border-[#E5E7EB] bg-white shadow-sm">
          <summary className="flex cursor-pointer list-none flex-col gap-4 p-4 outline-none marker:hidden sm:flex-row sm:items-center sm:justify-between [&::-webkit-details-marker]:hidden">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[#FFF4ED] text-[#FF4D00]">
                <ReceiptText size={18} />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-widest text-[#9CA3AF]">{l.order}</p>
                <p className="mt-1 truncate text-base font-black text-[#1F2937]">{orderAuditLabel(latest, lang)}</p>
                <p className="mt-0.5 truncate text-xs font-bold text-[#9CA3AF]">{orderAuditMeta(latest, l)}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <span className="rounded-full bg-[#FFF4ED] px-3 py-1 text-xs font-black text-[#FF4D00]">
                {actionLabel(latest.action, lang)}
              </span>
              <span className="rounded-full bg-[#F8FAFC] px-3 py-1 text-xs font-black text-[#64748B]">
                {group.rows.length} {l.changes}
              </span>
              <span className="text-xs font-bold text-[#9CA3AF]">{fmtDate(latest.changed_at, lang)}</span>
              <ChevronDown size={18} className="text-[#9CA3AF] transition-transform group-open:rotate-180" />
            </div>
          </summary>

          <div className="border-t border-[#F3F4F6]">
            {group.rows.map(row => (
              <div key={row.id} className="grid gap-4 px-4 py-4 text-sm md:grid-cols-[170px_1fr]">
                <div className="space-y-3">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-widest text-[#9CA3AF]">{l.latest}</p>
                    <p className="mt-1 font-semibold text-[#1F2937]">{fmtDate(row.changed_at, lang)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-widest text-[#9CA3AF]">{l.action}</p>
                    <p className="mt-1 font-black text-[#FF4D00]">{actionLabel(row.action, lang)}</p>
                  </div>
                  <div>
                    <p className="flex items-center gap-1 text-[11px] font-black uppercase tracking-widest text-[#9CA3AF]">
                      <UserRound size={12} />
                      {l.actor}
                    </p>
                    <p className="mt-1 break-words font-semibold text-[#1F2937]">{actorLabel(row)}</p>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                  <AuditValue label={l.total} oldValue={formatCurrency(row.old_total || 0)} newValue={formatCurrency(row.new_total || 0)} beforeLabel={l.before} afterLabel={l.after} />
                  <AuditValue label={l.service} oldValue={formatCurrency(row.old_service_fee || 0)} newValue={formatCurrency(row.new_service_fee || 0)} beforeLabel={l.before} afterLabel={l.after} />
                  <AuditValue label={l.discount} oldValue={formatCurrency(row.old_discount_amount || 0)} newValue={formatCurrency(row.new_discount_amount || 0)} beforeLabel={l.before} afterLabel={l.after} />
                  <AuditValue label={l.method} oldValue={paymentMethodLabel(row.old_payment_method, lang)} newValue={paymentMethodLabel(row.new_payment_method, lang)} beforeLabel={l.before} afterLabel={l.after} />
                  <AuditValue label={l.status} oldValue={`${statusLabel(row.old_status, lang)} / ${statusLabel(row.old_payment_status, lang)}`} newValue={`${statusLabel(row.new_status, lang)} / ${statusLabel(row.new_payment_status, lang)}`} beforeLabel={l.before} afterLabel={l.after} />
                </div>
              </div>
            ))}
          </div>
        </details>
      )
    })
  }, [error, groupedRows, l, lang, loading])

  return (
    <AppShell title={l.title}>
      <div className="mx-auto max-w-6xl px-5 py-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black text-[#1F2937]">{l.title}</h1>
            <p className="mt-0.5 text-sm text-[#6B7280]">{l.sub}</p>
          </div>
          <button
            onClick={loadAudit}
            disabled={loading}
            className="flex h-11 items-center gap-2 rounded-2xl border border-[#E5E7EB] bg-white px-4 text-sm font-black text-[#64748B] shadow-sm transition-all hover:bg-[#F8FAFC] disabled:opacity-60"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            {l.refresh}
          </button>
        </div>
        <div className="mb-4 rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
          <p className="mb-3 text-xs font-black uppercase tracking-widest text-[#9CA3AF]">{l.filters}</p>
          <div className="grid gap-2 md:grid-cols-[1fr_220px_220px]">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={l.searchPlaceholder}
              className="h-10 rounded-xl border border-[#E5E7EB] px-3 text-sm outline-none transition-all focus:border-[#ff5a00] focus:ring-2 focus:ring-[#ff5a00]/15"
            />
            <select
              value={actionFilter}
              onChange={e => setActionFilter(e.target.value)}
              className="h-10 rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm font-bold text-[#1F2937] outline-none transition-all focus:border-[#ff5a00]"
            >
              <option value="all">{l.allActions}</option>
              {actions.map(action => <option key={action} value={action}>{actionLabel(action, lang)}</option>)}
            </select>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="h-10 rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm font-bold text-[#1F2937] outline-none transition-all focus:border-[#ff5a00]"
            >
              <option value="all">{l.allStatuses}</option>
              {statuses.map(status => <option key={status} value={status}>{statusLabel(status, lang)}</option>)}
            </select>
          </div>
        </div>
        <div className="space-y-3">{content}</div>
      </div>
    </AppShell>
  )
}

function AuditValue({ label, oldValue, newValue, beforeLabel = '', afterLabel = '' }) {
  return (
    <div>
      <p className="text-[11px] font-black uppercase tracking-widest text-[#9CA3AF]">{label}</p>
      <p className="mt-1 truncate text-[#64748B]">{beforeLabel ? `${beforeLabel}: ` : ''}{oldValue}</p>
      <p className="truncate font-black text-[#1F2937]">{afterLabel ? `${afterLabel}: ` : ''}{newValue}</p>
    </div>
  )
}
