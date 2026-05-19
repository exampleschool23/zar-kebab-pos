import React, { useEffect, useMemo, useState } from 'react'
import { RefreshCw, ShieldCheck, AlertTriangle } from 'lucide-react'
import AppShell from '../components/AppShell'
import { supabase } from '../lib/supabase'
import { useApp } from '../store/AppContext'
import { formatCurrency } from '../lib/formatCurrency'

function fmtDate(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('ru-RU', {
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
  }
  return labels[action]?.[lang] || action || '—'
}

export default function AdminAudit() {
  const { state } = useApp()
  const lang = state.lang || 'ru'
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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
      discount: 'Chegirma',
      method: 'To‘lov',
      status: 'Status',
      time: 'Vaqt',
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
      discount: 'Скидка',
      method: 'Оплата',
      status: 'Статус',
      time: 'Время',
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
      discount: 'Discount',
      method: 'Payment',
      status: 'Status',
      time: 'Time',
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

    if (rows.length === 0) {
      return (
        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-10 text-center shadow-sm">
          <ShieldCheck size={34} className="mx-auto mb-3 text-[#CBD5E1]" />
          <p className="font-black text-[#1F2937]">{l.empty}</p>
        </div>
      )
    }

    return rows.map(row => (
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
          <AuditValue label={l.total} oldValue={formatCurrency(row.old_total || 0)} newValue={formatCurrency(row.new_total || 0)} />
          <AuditValue label={l.service} oldValue={formatCurrency(row.old_service_fee || 0)} newValue={formatCurrency(row.new_service_fee || 0)} />
          <AuditValue label={l.discount} oldValue={formatCurrency(row.old_discount_amount || 0)} newValue={formatCurrency(row.new_discount_amount || 0)} />
          <AuditValue label={l.method} oldValue={row.old_payment_method || '—'} newValue={row.new_payment_method || '—'} />
          <AuditValue label={l.status} oldValue={`${row.old_status || '—'} / ${row.old_payment_status || '—'}`} newValue={`${row.new_status || '—'} / ${row.new_payment_status || '—'}`} />
          <div>
            <p className="text-[11px] font-black uppercase tracking-widest text-[#9CA3AF]">{l.time}</p>
            <p className="mt-1 font-semibold text-[#1F2937]">{fmtDate(row.changed_at)}</p>
          </div>
        </div>
      </div>
    ))
  }, [error, l, lang, loading, rows])

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
        <div className="space-y-3">{content}</div>
      </div>
    </AppShell>
  )
}

function AuditValue({ label, oldValue, newValue }) {
  return (
    <div>
      <p className="text-[11px] font-black uppercase tracking-widest text-[#9CA3AF]">{label}</p>
      <p className="mt-1 truncate text-[#64748B]">{oldValue}</p>
      <p className="truncate font-black text-[#1F2937]">{newValue}</p>
    </div>
  )
}
