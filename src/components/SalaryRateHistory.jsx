import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { loadSalaryRows } from '../lib/salaryData'
import { buildSalaryRateHistory } from '../lib/salaryRateHistory'
import { formatCurrency } from '../lib/formatCurrency'
import { formatDateTime, formatLongDate } from '../lib/dateFormat'

const LABELS = {
  en: { title: 'Salary changes', help: 'All dates · newest changes first · Tashkent time', insert: 'Rate added', update: 'Rate changed', delete: 'Rate deleted', effective: 'Effective from', daily: 'day', monthly: 'month', before: 'Before', after: 'After', unknown: 'Author unavailable', legacy: 'Saved rate · earlier edits were not audited', empty: 'No salary rate changes.', error: 'Could not load the complete change history.', retry: 'Retry', more: 'Show more', loading: 'Loading changes…' },
  ru: { title: 'Изменения зарплаты', help: 'Все даты · сначала новые · время Ташкента', insert: 'Ставка добавлена', update: 'Ставка изменена', delete: 'Ставка удалена', effective: 'Действует с', daily: 'день', monthly: 'месяц', before: 'До', after: 'После', unknown: 'Автор неизвестен', legacy: 'Сохранённая ставка · прежние правки не отслеживались', empty: 'Изменений ставки нет.', error: 'Не удалось загрузить полную историю изменений.', retry: 'Повторить', more: 'Показать ещё', loading: 'Загрузка изменений…' },
  uz: { title: 'Maosh o‘zgarishlari', help: 'Barcha sanalar · yangilari avval · Toshkent vaqti', insert: 'Stavka qo‘shildi', update: 'Stavka o‘zgartirildi', delete: 'Stavka o‘chirildi', effective: 'Amal qilish sanasi', daily: 'kun', monthly: 'oy', before: 'Oldin', after: 'Keyin', unknown: 'Muallif noma’lum', legacy: 'Saqlangan stavka · oldingi tahrirlar kuzatilmagan', empty: 'Maosh stavkasi o‘zgarishlari yo‘q.', error: 'To‘liq o‘zgarishlar tarixini yuklab bo‘lmadi.', retry: 'Qayta urinish', more: 'Yana ko‘rsatish', loading: 'O‘zgarishlar yuklanmoqda…' },
}

export default function SalaryRateHistory({ employeeId, rates, lang, canDelete, onDelete, onCancelDelete, confirmActionKey, saving, actionLabels }) {
  const l = LABELS[lang] || LABELS.en
  const [entries, setEntries] = useState([])
  const [failed, setFailed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [retry, setRetry] = useState(0)
  const [limit, setLimit] = useState(10)
  useEffect(() => {
    let active = true
    setLoading(true)
    setFailed(false)
    setEntries([])
    setLimit(10)
    async function load() {
      try {
        const audit = await loadSalaryRows(() => supabase.from('accounting_record_audit')
          .select('id,entity_id,action,old_record,new_record,changed_by,changed_by_name,changed_at')
          .eq('entity_type', 'salary_rate')
          .or(`old_record->>salary_profile_id.eq.${employeeId},new_record->>salary_profile_id.eq.${employeeId}`))
        const actorIds = [...new Set(rates.map(rate => rate.created_by).filter(Boolean))]
        const actors = actorIds.length
          ? await loadSalaryRows(() => supabase.from('profiles').select('id,full_name').in('id', actorIds))
          : { data: [], error: null }
        if (!active) return
        setEntries(buildSalaryRateHistory(rates, audit.data || [], actors.data || []))
        setFailed(Boolean(audit.error || actors.error))
      } catch {
        if (active) { setEntries(buildSalaryRateHistory(rates)); setFailed(true) }
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [employeeId, rates, retry])

  function snapshot(rate, label) {
    if (!rate) return null
    return <div className="mt-2 rounded-lg bg-slate-50 p-2 text-xs">
      {label && <p className="mb-1 text-slate-500">{label}</p>}
      <p className="font-black text-slate-800">{formatCurrency(rate.amount ?? rate.daily_amount)} / {rate.rate_unit === 'monthly' ? l.monthly : l.daily}</p>
      <p className="mt-1 text-slate-600">{l.effective}: {formatLongDate(rate.effective_from, lang, rate.effective_from)}</p>
      {rate.note && <p className="mt-1 break-words text-slate-600">{rate.note}</p>}
    </div>
  }

  return <aside aria-labelledby="salary-rate-history-heading" className="min-w-0 rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm sm:p-5">
    <h2 id="salary-rate-history-heading" className="text-base font-black text-[#1F2937]">{l.title}</h2>
    <p className="mt-1 text-xs text-slate-500">{l.help}</p>
    {failed && <div role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">{l.error} <button type="button" onClick={() => setRetry(value => value + 1)} className="font-bold underline">{l.retry}</button></div>}
    {loading ? <p role="status" className="mt-4 text-sm text-slate-500">{l.loading}</p> : <>
      {!entries.length && !failed && <p className="mt-4 text-sm text-slate-500">{l.empty}</p>}
      <ol className="mt-4 space-y-4">
        {entries.slice(0, limit).map(entry => <li key={entry.id} className="border-l-2 border-orange-200 pl-3">
          <p className="text-xs font-bold text-slate-500">{formatDateTime(entry.recordedAt, '—')}</p>
          <p className="mt-1 text-sm font-black text-slate-800">{l[entry.action]}</p>
          <p className="mt-1 break-words text-xs text-slate-600">{entry.actor || l.unknown}</p>
          {snapshot(entry.before, l.before)}
          {snapshot(entry.after, entry.before ? l.after : '')}
          {canDelete && entry.canDelete && <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={Boolean(saving)}
              onClick={() => onDelete({ id: entry.rateId, entryType: 'rate' })}
              className="min-h-10 rounded-lg bg-red-50 px-3 text-xs font-bold text-red-700 disabled:opacity-50">
              {confirmActionKey === `rate-history-delete-${entry.rateId}` ? actionLabels.confirm : actionLabels.delete}
            </button>
            {confirmActionKey === `rate-history-delete-${entry.rateId}` && <button type="button" disabled={Boolean(saving)} onClick={onCancelDelete}
              className="min-h-10 rounded-lg border px-3 text-xs font-bold text-slate-600">{actionLabels.cancel}</button>}
          </div>}
          {!entry.audited && <p className="mt-2 text-[11px] text-slate-400">{l.legacy}</p>}
        </li>)}
      </ol>
      {entries.length > limit && <button type="button" onClick={() => setLimit(value => value + 10)} className="mt-4 text-sm font-bold text-orange-600">{l.more}</button>}
    </>}
  </aside>
}
