import React, { useEffect, useMemo, useState } from 'react'
import { RefreshCw, ShieldCheck, AlertTriangle } from 'lucide-react'
import AppShell from '../components/AppShell'
import { supabase } from '../lib/supabase'
import { useApp } from '../store/AppContext'
import { formatCurrency } from '../lib/formatCurrency'

function fmtDate(value, lang = 'ru') {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  const locale = lang === 'uz' ? 'uz-UZ' : lang === 'en' ? 'en-US' : 'ru-RU'
  return d.toLocaleString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function actionLabel(action, lang) {
  const labels = {
    mark_paid: { uz: 'To‘lov tasdiqlandi', ru: 'Оплата подтверждена', en: 'Payment confirmed' },
    payment_fields_changed: { uz: 'To‘lov summasi o‘zgardi', ru: 'Изменены суммы оплаты', en: 'Payment fields changed' },
    status_changed: { uz: 'Status o‘zgardi', ru: 'Статус изменён', en: 'Status changed' },
    reopen_paid_order: { uz: 'To‘langan buyurtma ochildi', ru: 'Оплаченный заказ открыт', en: 'Paid order reopened' },
    order_item_deleted: { uz: 'Taom o‘chirildi', ru: 'Блюдо удалено', en: 'Order item deleted' },
    order_cancelled: { uz: 'Buyurtma bekor qilindi', ru: 'Заказ отменён', en: 'Order cancelled' },
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
      setRows(data || [])
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
        row.action,
        row.changed_by,
        row.old_status,
        row.new_status,
        row.old_payment_status,
        row.new_payment_status,
        row.old_payment_method,
        row.new_payment_method,
      ].join(' ').toLowerCase()
      return matchAction && matchStatus && (!q || haystack.includes(q))
    })
  }, [actionFilter, rows, search, statusFilter])

  const content = useMemo(() => {
    if (loading) {
      return Array.from({ length: 5 }).map((_, idx) => (
        <div key={idx} className="h-24 animate-pulse rounded-2xl border border-gray-100 bg-white" />
      ))
    }

    if (error) {
      const tableMissing = /order_payment_audit|schema cache|does not exist|not find the table/i.test(error.message || '')
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

    if (filteredRows.length === 0) {
      return (
        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-10 text-center shadow-sm">
          <ShieldCheck size={34} className="mx-auto mb-3 text-[#CBD5E1]" />
          <p className="font-black text-[#1F2937]">{l.empty}</p>
        </div>
      )
    }

    return filteredRows.map(row => (
      <div key={row.id} className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-[#9CA3AF]">{l.order}</p>
            <p className="mt-1 font-black text-[#1F2937]">#{row.order_id}</p>
          </div>
          <div className="rounded-full bg-[#FFF4ED] px-3 py-1 text-xs font-black text-[#FF4D00]">
            {actionLabel(row.action, lang)}
          </div>
        </div>

        <div className="mt-4 grid gap-3 text-sm md:grid-cols-3 xl:grid-cols-6">
          <AuditValue label={l.total} oldValue={formatCurrency(row.old_total || 0)} newValue={formatCurrency(row.new_total || 0)} beforeLabel={l.before} afterLabel={l.after} />
          <AuditValue label={l.service} oldValue={formatCurrency(row.old_service_fee || 0)} newValue={formatCurrency(row.new_service_fee || 0)} beforeLabel={l.before} afterLabel={l.after} />
          <AuditValue label={l.discount} oldValue={formatCurrency(row.old_discount_amount || 0)} newValue={formatCurrency(row.new_discount_amount || 0)} beforeLabel={l.before} afterLabel={l.after} />
          <AuditValue label={l.method} oldValue={paymentMethodLabel(row.old_payment_method, lang)} newValue={paymentMethodLabel(row.new_payment_method, lang)} beforeLabel={l.before} afterLabel={l.after} />
          <AuditValue label={l.status} oldValue={`${statusLabel(row.old_status, lang)} / ${statusLabel(row.old_payment_status, lang)}`} newValue={`${statusLabel(row.new_status, lang)} / ${statusLabel(row.new_payment_status, lang)}`} beforeLabel={l.before} afterLabel={l.after} />
          <div>
            <p className="text-[11px] font-black uppercase tracking-widest text-[#9CA3AF]">{l.time}</p>
            <p className="mt-1 font-semibold text-[#1F2937]">{fmtDate(row.changed_at, lang)}</p>
          </div>
        </div>
      </div>
    ))
  }, [error, filteredRows, l, lang, loading])

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
