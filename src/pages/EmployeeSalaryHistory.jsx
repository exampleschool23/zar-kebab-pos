import React, { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  BadgeMinus,
  Banknote,
  CalendarDays,
  CalendarX2,
  ChevronLeft,
  ChevronRight,
  Gift,
  Loader2,
  RefreshCw,
  Trash2,
  UserRound,
  X,
} from 'lucide-react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import AppShell from '../components/AppShell'
import { OperationalLoading } from '../components/OperationalState'
import { useApp } from '../store/AppContext'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { formatCurrency } from '../lib/formatCurrency'
import { formatLongDate, formatMonthYear, formatTime } from '../lib/dateFormat'
import { expensePaymentMethodLabel, todayExpenseDate } from '../lib/expenses'
import { canEditFeature, normalizeRole } from '../lib/permissions'
import {
  buildSalaryHistoryCalendar,
  buildSalaryHistoryEntries,
  filterSalaryHistoryEntries,
  groupSalaryHistoryEntries,
  normalizeSalaryHistoryMonth,
  shiftSalaryHistoryMonth,
  summarizeSalaryHistoryMonth,
} from '../lib/salaryHistory'

const PAGE_SIZE = 10
const HISTORY_TABLE_BY_TYPE = {
  payment: 'employee_salary_payments',
  bonus: 'employee_salary_bonuses',
  fine: 'employee_salary_fines',
  absence: 'employee_salary_absences',
}
const HISTORY_TYPES = ['all', 'payment', 'bonus', 'fine', 'absence']
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function isMissingSalaryMigration(error) {
  const text = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return text.includes('employee_salary') && (
    text.includes('does not exist') ||
    text.includes('could not find the') ||
    text.includes('column') ||
    text.includes('schema cache') ||
    text.includes('42p01')
  )
}

function employeeName(employee, fallback) {
  return employee?.employee_name || fallback
}

export default function EmployeeSalaryHistory() {
  const { employeeId } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { state } = useApp()
  const { profile } = useAuth()
  const lang = state.lang || 'ru'
  const today = todayExpenseDate()
  const currentMonth = today.slice(0, 7)
  const visibleMonth = normalizeSalaryHistoryMonth(searchParams.get('month'), currentMonth)
  const requestedDay = String(searchParams.get('day') || '')
  const selectedDate = ISO_DATE_PATTERN.test(requestedDay) && requestedDay.startsWith(visibleMonth)
    ? requestedDay
    : ''
  const requestedType = String(searchParams.get('type') || 'all')
  const activeType = HISTORY_TYPES.includes(requestedType) ? requestedType : 'all'
  const canManage = canEditFeature(profile || { role: state.user?.role }, 'expenses')
  const isOwner = normalizeRole(profile?.role || state.user?.role) === 'owner'
  const canDeleteHistory = canManage && isOwner

  const L = {
    uz: {
      title: 'Maosh tarixi',
      back: 'Xodimlarga qaytish',
      employee: 'Xodim',
      active: 'Faol',
      inactive: 'Nofaol',
      joined: 'Ishga kirgan',
      refresh: 'Yangilash',
      loadingTitle: 'Maosh tarixi yuklanmoqda',
      loadingDescription: 'Taqvim va maosh operatsiyalari tayyorlanmoqda.',
      loadFailed: 'Maosh tarixini yuklab bo‘lmadi.',
      notFound: 'Xodim topilmadi yoki o‘chirilgan.',
      migration: 'Maosh jadvallari yangilanmagan. Supabase SQL editorida employee_salary migratsiyalarini ishga tushiring.',
      currentMonth: 'Joriy oy',
      previousMonth: 'Oldingi oy',
      nextMonth: 'Keyingi oy',
      calendar: 'Faoliyat taqvimi',
      calendarHelp: 'Kunni tanlab, faqat shu kundagi yozuvlarni ko‘ring.',
      allMonth: 'Butun oy',
      monthActivity: 'Oylik faoliyat',
      selectedDayActivity: 'Tanlangan kun',
      clearDay: 'Butun oyni ko‘rish',
      records: 'yozuv',
      all: 'Hammasi',
      payments: 'To‘lovlar',
      bonuses: 'Bonuslar',
      fines: 'Jarimalar',
      absences: 'Kelmagan kunlar',
      payment: 'To‘lov',
      bonus: 'Bonus',
      fine: 'Jarima',
      absence: 'Kelmagan',
      paidTotal: 'To‘langan',
      bonusTotal: 'Bonuslar',
      fineTotal: 'Jarimalar',
      absenceTotal: 'Kelmagan kunlar',
      empty: 'Bu davrda yozuvlar yo‘q.',
      delete: 'O‘chirish',
      confirm: 'Tasdiqlash',
      cancel: 'Bekor qilish',
      deleteFailed: 'Yozuvni o‘chirib bo‘lmadi.',
      previous: 'Oldingi',
      next: 'Keyingi',
      page: 'Sahifa',
      of: '/',
      weekdays: ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'],
    },
    ru: {
      title: 'История зарплаты',
      back: 'Назад к сотрудникам',
      employee: 'Сотрудник',
      active: 'Активен',
      inactive: 'Неактивен',
      joined: 'Дата выхода',
      refresh: 'Обновить',
      loadingTitle: 'Загружаем историю зарплаты',
      loadingDescription: 'Готовим календарь и операции сотрудника.',
      loadFailed: 'Не удалось загрузить историю зарплаты.',
      notFound: 'Сотрудник не найден или удалён.',
      migration: 'Таблицы зарплат не обновлены. Запустите миграции employee_salary в Supabase SQL Editor.',
      currentMonth: 'Текущий месяц',
      previousMonth: 'Предыдущий месяц',
      nextMonth: 'Следующий месяц',
      calendar: 'Календарь операций',
      calendarHelp: 'Выберите день, чтобы увидеть только его записи.',
      allMonth: 'Весь месяц',
      monthActivity: 'Операции за месяц',
      selectedDayActivity: 'Выбранный день',
      clearDay: 'Показать весь месяц',
      records: 'записей',
      all: 'Все',
      payments: 'Выплаты',
      bonuses: 'Бонусы',
      fines: 'Штрафы',
      absences: 'Отсутствия',
      payment: 'Выплата',
      bonus: 'Бонус',
      fine: 'Штраф',
      absence: 'Отсутствовал',
      paidTotal: 'Выплачено',
      bonusTotal: 'Бонусы',
      fineTotal: 'Штрафы',
      absenceTotal: 'Дни отсутствия',
      empty: 'За этот период записей нет.',
      delete: 'Удалить',
      confirm: 'Подтвердить',
      cancel: 'Отмена',
      deleteFailed: 'Не удалось удалить запись.',
      previous: 'Назад',
      next: 'Далее',
      page: 'Страница',
      of: 'из',
      weekdays: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
    },
    en: {
      title: 'Salary history',
      back: 'Back to employees',
      employee: 'Employee',
      active: 'Active',
      inactive: 'Inactive',
      joined: 'Joined',
      refresh: 'Refresh',
      loadingTitle: 'Loading salary history',
      loadingDescription: 'Preparing the employee calendar and activity.',
      loadFailed: 'Could not load salary history.',
      notFound: 'Employee was not found or has been removed.',
      migration: 'Salary tables are not up to date. Run the employee_salary migrations in Supabase SQL Editor.',
      currentMonth: 'Current month',
      previousMonth: 'Previous month',
      nextMonth: 'Next month',
      calendar: 'Activity calendar',
      calendarHelp: 'Choose a day to see only its records.',
      allMonth: 'All month',
      monthActivity: 'Monthly activity',
      selectedDayActivity: 'Selected day',
      clearDay: 'Show all month',
      records: 'records',
      all: 'All',
      payments: 'Payments',
      bonuses: 'Bonuses',
      fines: 'Fines',
      absences: 'Absences',
      payment: 'Payment',
      bonus: 'Bonus',
      fine: 'Fine',
      absence: 'Absent',
      paidTotal: 'Paid',
      bonusTotal: 'Bonuses',
      fineTotal: 'Fines',
      absenceTotal: 'Absent days',
      empty: 'There are no records for this period.',
      delete: 'Delete',
      confirm: 'Confirm',
      cancel: 'Cancel',
      deleteFailed: 'Could not delete the record.',
      previous: 'Previous',
      next: 'Next',
      page: 'Page',
      of: 'of',
      weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    },
  }
  const l = L[lang] || L.en

  const [employee, setEmployee] = useState(null)
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState('')
  const [confirmActionKey, setConfirmActionKey] = useState('')
  const [page, setPage] = useState(1)

  async function loadHistory({ showLoader = true } = {}) {
    if (!employeeId) return
    if (showLoader) setLoading(true)
    setError('')
    try {
      const [employeeRes, paymentRes, bonusRes, fineRes, absenceRes] = await Promise.all([
        supabase.from('employee_salary_profiles').select('*').eq('id', employeeId).maybeSingle(),
        supabase.from('employee_salary_payments').select('*').eq('salary_profile_id', employeeId),
        supabase.from('employee_salary_bonuses').select('*').eq('salary_profile_id', employeeId),
        supabase.from('employee_salary_fines').select('*').eq('salary_profile_id', employeeId),
        supabase.from('employee_salary_absences').select('*').eq('salary_profile_id', employeeId),
      ])
      const loadError = employeeRes.error || paymentRes.error || bonusRes.error || absenceRes.error
      if (loadError) throw loadError
      if (!employeeRes.data || employeeRes.data.deleted_at) {
        setEmployee(null)
        setEntries([])
        setError(l.notFound)
        return
      }

      setEmployee(employeeRes.data)
      setEntries(buildSalaryHistoryEntries({
        payments: paymentRes.data || [],
        bonuses: bonusRes.data || [],
        fines: fineRes.error ? [] : fineRes.data || [],
        absences: absenceRes.data || [],
      }))
      if (fineRes.error) setError(isMissingSalaryMigration(fineRes.error) ? l.migration : fineRes.error.message)
    } catch (loadError) {
      setEmployee(null)
      setEntries([])
      setError(isMissingSalaryMigration(loadError) ? l.migration : loadError?.message || l.loadFailed)
    } finally {
      if (showLoader) setLoading(false)
    }
  }

  useEffect(() => { loadHistory() }, [employeeId]) // eslint-disable-line react-hooks/exhaustive-deps

  const calendarDays = useMemo(
    () => buildSalaryHistoryCalendar(visibleMonth, entries, today),
    [visibleMonth, entries, today]
  )
  const monthEntries = useMemo(
    () => filterSalaryHistoryEntries(entries, { month: visibleMonth }),
    [entries, visibleMonth]
  )
  const visibleEntries = useMemo(
    () => filterSalaryHistoryEntries(entries, {
      month: visibleMonth,
      date: selectedDate,
      entryType: activeType,
    }),
    [entries, visibleMonth, selectedDate, activeType]
  )
  const monthSummary = useMemo(
    () => summarizeSalaryHistoryMonth(entries, visibleMonth),
    [entries, visibleMonth]
  )
  const pageCount = Math.max(1, Math.ceil(visibleEntries.length / PAGE_SIZE))
  const pagedEntries = useMemo(
    () => visibleEntries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [visibleEntries, page]
  )
  const entryGroups = useMemo(() => groupSalaryHistoryEntries(pagedEntries), [pagedEntries])
  const typeCounts = useMemo(() => ({
    all: monthEntries.length,
    payment: monthEntries.filter(entry => entry.entryType === 'payment').length,
    bonus: monthEntries.filter(entry => entry.entryType === 'bonus').length,
    fine: monthEntries.filter(entry => entry.entryType === 'fine').length,
    absence: monthEntries.filter(entry => entry.entryType === 'absence').length,
  }), [monthEntries])

  useEffect(() => { setPage(1) }, [visibleMonth, selectedDate, activeType])
  useEffect(() => { setPage(current => Math.min(current, pageCount)) }, [pageCount])

  function updateView({ month = visibleMonth, day = selectedDate, type = activeType }, replace = false) {
    const next = new URLSearchParams(searchParams)
    next.set('month', month)
    if (day) next.set('day', day)
    else next.delete('day')
    if (type && type !== 'all') next.set('type', type)
    else next.delete('type')
    setSearchParams(next, { replace })
    setConfirmActionKey('')
  }

  function selectCalendarDay(day) {
    const nextMonth = day.date.slice(0, 7)
    const nextDay = selectedDate === day.date ? '' : day.date
    updateView({ month: nextMonth, day: nextDay })
  }

  async function deleteHistoryEntry(entry) {
    if (!canDeleteHistory || !entry?.id) return
    const table = HISTORY_TABLE_BY_TYPE[entry.entryType]
    if (!table) return
    const key = `${entry.entryType}-history-delete-${entry.id}`
    if (confirmActionKey !== key) {
      setConfirmActionKey(key)
      return
    }

    setSaving(key)
    setError('')
    const { error: deleteError } = await supabase
      .from(table)
      .delete()
      .eq('id', entry.id)
      .eq('salary_profile_id', employeeId)
    setSaving('')
    setConfirmActionKey('')
    if (deleteError) {
      setError(deleteError.message || l.deleteFailed)
      return
    }
    setEntries(current => current.filter(item => !(
      item.id === entry.id && item.entryType === entry.entryType
    )))
  }

  if (loading) {
    return (
      <AppShell title={l.title}>
        <div className="min-h-full bg-[#FAF7F0]">
          <OperationalLoading title={l.loadingTitle} description={l.loadingDescription} />
        </div>
      </AppShell>
    )
  }

  if (!employee) {
    return (
      <AppShell title={l.title}>
        <div className="min-h-full bg-[#FAF7F0] px-4 py-6 sm:px-5">
          <div className="mx-auto max-w-2xl">
            <button
              type="button"
              onClick={() => navigate('/admin/accounting/employees')}
              className="inline-flex items-center gap-2 text-xs font-black text-[#6B7280] transition-colors hover:text-[#ff5a00]"
            >
              <ArrowLeft size={14} />{l.back}
            </button>
            <div className="mt-5 rounded-2xl border border-red-100 bg-white p-8 text-center shadow-sm">
              <p className="text-base font-black text-[#1F2937]">{l.loadFailed}</p>
              <p className="mt-1 text-sm font-semibold text-[#6B7280]">{error || l.notFound}</p>
              <button
                type="button"
                onClick={() => loadHistory()}
                className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-[#ff5a00] px-4 text-sm font-black text-white"
              >
                <RefreshCw size={15} />{l.refresh}
              </button>
            </div>
          </div>
        </div>
      </AppShell>
    )
  }

  const inactive = employee.is_active === false
  const filters = [
    { key: 'all', label: l.all },
    { key: 'payment', label: l.payments },
    { key: 'bonus', label: l.bonuses },
    { key: 'fine', label: l.fines },
    { key: 'absence', label: l.absences },
  ]

  return (
    <AppShell title={l.title}>
      <div className="min-h-full bg-[#FAF7F0]">
        <div className="mx-auto max-w-[1280px] px-4 py-5 sm:px-5 sm:py-6">
          <header className="mb-5">
            <button
              type="button"
              onClick={() => navigate('/admin/accounting/employees')}
              className="mb-3 inline-flex items-center gap-2 text-xs font-black text-[#6B7280] transition-colors hover:text-[#ff5a00]"
            >
              <ArrowLeft size={14} />{l.back}
            </button>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <span className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl ${inactive ? 'bg-gray-200 text-gray-500' : 'bg-orange-100 text-[#ff5a00]'}`}>
                  <UserRound size={22} />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="truncate text-2xl font-black text-[#1F2937] sm:text-3xl">{employeeName(employee, l.employee)}</h1>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${inactive ? 'bg-gray-200 text-gray-600' : 'bg-emerald-100 text-emerald-700'}`}>
                      {inactive ? l.inactive : l.active}
                    </span>
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-[#6B7280]">
                    <span>{l.title}</span>
                    {employee.joined_at && <span>· {l.joined}: {formatLongDate(employee.joined_at, lang, employee.joined_at)}</span>}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => updateView({ month: currentMonth, day: '', type: activeType })}
                  className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-xs font-black shadow-sm ${visibleMonth === currentMonth && !selectedDate ? 'border-orange-200 bg-orange-50 text-[#ff5a00]' : 'border-[#E5E7EB] bg-white text-[#6B7280]'}`}
                >
                  <CalendarDays size={14} />{l.currentMonth}
                </button>
                <button
                  type="button"
                  onClick={() => loadHistory({ showLoader: false })}
                  disabled={saving !== ''}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs font-black text-[#6B7280] shadow-sm disabled:opacity-60"
                >
                  <RefreshCw size={14} />{l.refresh}
                </button>
              </div>
            </div>
          </header>

          {error && employee && (
            <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
              {error}
            </div>
          )}

          <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label={formatMonthYear(visibleMonth, lang, visibleMonth)}>
            <SummaryCard icon={Banknote} label={l.paidTotal} value={formatCurrency(monthSummary.paymentAmount)} tone="orange" />
            <SummaryCard icon={Gift} label={l.bonusTotal} value={formatCurrency(monthSummary.bonusAmount)} tone="blue" />
            <SummaryCard icon={BadgeMinus} label={l.fineTotal} value={formatCurrency(monthSummary.fineAmount)} tone="red" />
            <SummaryCard icon={CalendarX2} label={l.absenceTotal} value={monthSummary.absenceCount} tone="violet" />
          </section>

          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(380px,1.05fr)]">
            <section className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm sm:p-5 xl:sticky xl:top-4" aria-labelledby="salary-history-calendar-heading">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 id="salary-history-calendar-heading" className="text-base font-black text-[#1F2937]">{l.calendar}</h2>
                  <p className="mt-0.5 text-xs font-semibold text-[#6B7280]">{l.calendarHelp}</p>
                </div>
                {selectedDate && (
                  <button
                    type="button"
                    onClick={() => updateView({ day: '' })}
                    className="inline-flex h-8 flex-shrink-0 items-center gap-1 rounded-lg bg-orange-50 px-2.5 text-[10px] font-black text-[#ff5a00]"
                  >
                    <X size={12} />{l.allMonth}
                  </button>
                )}
              </div>

              <div className="mb-4 grid grid-cols-[40px_minmax(0,1fr)_40px] items-center gap-2">
                <button
                  type="button"
                  onClick={() => updateView({ month: shiftSalaryHistoryMonth(visibleMonth, -1), day: '' })}
                  aria-label={l.previousMonth}
                  title={l.previousMonth}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#E5E7EB] bg-white text-[#6B7280] transition-colors hover:border-orange-200 hover:text-[#ff5a00]"
                >
                  <ChevronLeft size={18} />
                </button>
                <p className="text-center text-base font-black text-[#1F2937] sm:text-lg">{formatMonthYear(visibleMonth, lang, visibleMonth)}</p>
                <button
                  type="button"
                  onClick={() => updateView({ month: shiftSalaryHistoryMonth(visibleMonth, 1), day: '' })}
                  aria-label={l.nextMonth}
                  title={l.nextMonth}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#E5E7EB] bg-white text-[#6B7280] transition-colors hover:border-orange-200 hover:text-[#ff5a00]"
                >
                  <ChevronRight size={18} />
                </button>
              </div>

              <div className="grid grid-cols-7 gap-1" role="grid" aria-label={`${l.calendar}: ${formatMonthYear(visibleMonth, lang, visibleMonth)}`}>
                {l.weekdays.map(day => (
                  <div key={day} role="columnheader" className="pb-1 text-center text-[10px] font-black uppercase tracking-wide text-[#9CA3AF] sm:text-xs">
                    {day}
                  </div>
                ))}
                {calendarDays.map(day => {
                  const selected = selectedDate === day.date
                  return (
                    <button
                      key={day.date}
                      type="button"
                      role="gridcell"
                      aria-label={`${formatLongDate(day.date, lang, day.date)} · ${day.entries.length} ${l.records}`}
                      aria-current={day.isToday ? 'date' : undefined}
                      aria-pressed={selected}
                      onClick={() => selectCalendarDay(day)}
                      className={`relative flex min-h-[52px] min-w-0 flex-col items-center justify-between rounded-xl border px-1 py-1.5 text-sm font-black transition-all sm:min-h-[66px] sm:py-2 ${
                        selected
                          ? 'border-[#ff5a00] bg-[#ff5a00] text-white shadow-sm shadow-orange-200'
                          : day.isToday
                            ? 'border-orange-300 bg-orange-50 text-[#ff5a00]'
                            : day.inMonth
                              ? 'border-transparent bg-[#F9FAFB] text-[#1F2937] hover:border-orange-200 hover:bg-orange-50/60'
                              : 'border-transparent bg-white text-[#D1D5DB] hover:bg-gray-50'
                      }`}
                    >
                      <span>{day.day}</span>
                      <span className="flex min-h-2 items-center justify-center gap-0.5" aria-hidden="true">
                        {day.entryTypes.map(type => (
                          <span key={type} className={`h-1.5 w-1.5 rounded-full ${selected ? 'bg-white' : calendarDotClass(type)}`} />
                        ))}
                      </span>
                      {day.entries.length > 1 && (
                        <span className={`absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[8px] font-black ${selected ? 'bg-white/20 text-white' : 'bg-white text-[#6B7280] shadow-sm'}`}>
                          {day.entries.length}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>

              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-[#F0F1F3] pt-4">
                {[
                  ['payment', l.payment],
                  ['bonus', l.bonus],
                  ['fine', l.fine],
                  ['absence', l.absence],
                ].map(([type, label]) => (
                  <span key={type} className="inline-flex items-center gap-1.5 text-[10px] font-bold text-[#6B7280]">
                    <span className={`h-2 w-2 rounded-full ${calendarDotClass(type)}`} />{label}
                  </span>
                ))}
              </div>
            </section>

            <section className="min-w-0 rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm sm:p-5" aria-labelledby="salary-history-activity-heading">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 id="salary-history-activity-heading" className="text-base font-black text-[#1F2937]">
                    {selectedDate ? l.selectedDayActivity : l.monthActivity}
                  </h2>
                  <p className="mt-0.5 text-xs font-semibold text-[#6B7280]">
                    {selectedDate ? formatLongDate(selectedDate, lang, selectedDate) : formatMonthYear(visibleMonth, lang, visibleMonth)} · {visibleEntries.length} {l.records}
                  </p>
                </div>
                {selectedDate && (
                  <button
                    type="button"
                    onClick={() => updateView({ day: '' })}
                    className="inline-flex h-9 items-center justify-center rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs font-black text-[#6B7280]"
                  >
                    {l.clearDay}
                  </button>
                )}
              </div>

              <div className="mb-5 flex gap-2 overflow-x-auto pb-1" role="group" aria-label={l.monthActivity}>
                {filters.map(filter => {
                  const active = activeType === filter.key
                  return (
                    <button
                      key={filter.key}
                      type="button"
                      aria-pressed={active}
                      onClick={() => updateView({ type: filter.key })}
                      className={`inline-flex h-9 flex-shrink-0 items-center gap-1.5 rounded-xl border px-3 text-xs font-black transition-colors ${active ? 'border-[#ff5a00] bg-[#ff5a00] text-white shadow-sm shadow-orange-100' : 'border-[#E5E7EB] bg-white text-[#6B7280] hover:border-orange-200'}`}
                    >
                      {filter.label}
                      <span className={`rounded-full px-1.5 py-0.5 text-[9px] ${active ? 'bg-white/20 text-white' : 'bg-[#F3F4F6] text-[#9CA3AF]'}`}>
                        {typeCounts[filter.key]}
                      </span>
                    </button>
                  )
                })}
              </div>

              {entryGroups.length === 0 ? (
                <div className="flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-[#E5E7EB] bg-[#F9FAFB] px-6 text-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[#9CA3AF] shadow-sm">
                    <CalendarDays size={21} />
                  </span>
                  <p className="mt-3 text-sm font-black text-[#6B7280]">{l.empty}</p>
                </div>
              ) : (
                <div className="space-y-5">
                  {entryGroups.map(group => (
                    <div key={group.date}>
                      <div className="mb-2 flex items-center gap-3">
                        <p className="flex-shrink-0 text-xs font-black text-[#6B7280]">{formatLongDate(group.date, lang, group.date)}</p>
                        <span className="h-px flex-1 bg-[#E5E7EB]" />
                        <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-[#F3F4F6] px-2 text-[10px] font-black text-[#9CA3AF]">{group.entries.length}</span>
                      </div>
                      <div className="space-y-2">
                        {group.entries.map(entry => (
                          <HistoryEntryCard
                            key={`${entry.entryType}-${entry.id}`}
                            entry={entry}
                            lang={lang}
                            labels={l}
                            canDelete={canDeleteHistory}
                            confirming={confirmActionKey === `${entry.entryType}-history-delete-${entry.id}`}
                            saving={saving === `${entry.entryType}-history-delete-${entry.id}`}
                            onDelete={() => deleteHistoryEntry(entry)}
                            onCancelDelete={() => setConfirmActionKey('')}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {pageCount > 1 && (
                <nav aria-label={l.monthActivity} className="mt-5 flex items-center justify-between gap-3 border-t border-[#E5E7EB] pt-4">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage(current => Math.max(1, current - 1))}
                    className="inline-flex h-9 items-center gap-1 rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs font-black text-[#6B7280] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronLeft size={14} />{l.previous}
                  </button>
                  <span className="text-xs font-black text-[#6B7280]">{l.page} {page} {l.of} {pageCount}</span>
                  <button
                    type="button"
                    disabled={page >= pageCount}
                    onClick={() => setPage(current => Math.min(pageCount, current + 1))}
                    className="inline-flex h-9 items-center gap-1 rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs font-black text-[#6B7280] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {l.next}<ChevronRight size={14} />
                  </button>
                </nav>
              )}
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  )
}

function SummaryCard({ icon: Icon, label, value, tone }) {
  const tones = {
    orange: 'border-orange-200 bg-orange-50 text-[#ff5a00]',
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    red: 'border-red-200 bg-red-50 text-red-700',
    violet: 'border-violet-200 bg-violet-50 text-violet-700',
  }
  return (
    <div className={`rounded-2xl border p-3 shadow-sm sm:p-4 ${tones[tone] || tones.orange}`}>
      <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide sm:text-[11px]"><Icon size={14} />{label}</p>
      <p className="mt-1 truncate text-sm font-black text-[#1F2937] sm:text-base" title={value}>{value}</p>
    </div>
  )
}

function calendarDotClass(entryType) {
  if (entryType === 'bonus') return 'bg-blue-500'
  if (entryType === 'fine') return 'bg-red-500'
  if (entryType === 'absence') return 'bg-violet-500'
  return 'bg-[#ff5a00]'
}

function HistoryEntryCard({ entry, lang, labels, canDelete, confirming, saving, onDelete, onCancelDelete }) {
  const styles = {
    payment: {
      row: 'border-l-[#ff5a00] bg-orange-50/40',
      icon: 'bg-orange-100 text-[#ff5a00]',
      pill: 'bg-orange-100 text-[#d94d00]',
      amount: 'text-[#1F2937]',
      Icon: Banknote,
    },
    bonus: {
      row: 'border-l-blue-500 bg-blue-50/40',
      icon: 'bg-blue-100 text-blue-700',
      pill: 'bg-blue-100 text-blue-700',
      amount: 'text-blue-700',
      Icon: Gift,
    },
    fine: {
      row: 'border-l-red-500 bg-red-50/40',
      icon: 'bg-red-100 text-red-700',
      pill: 'bg-red-100 text-red-700',
      amount: 'text-red-700',
      Icon: BadgeMinus,
    },
    absence: {
      row: 'border-l-violet-500 bg-violet-50/40',
      icon: 'bg-violet-100 text-violet-700',
      pill: 'bg-violet-100 text-violet-700',
      amount: 'text-violet-700',
      Icon: CalendarX2,
    },
  }
  const style = styles[entry.entryType] || styles.payment
  const Icon = style.Icon
  const label = labels[entry.entryType]
  const detail = entry.detail || (entry.paymentMethod ? expensePaymentMethodLabel(entry.paymentMethod, lang) : '')

  return (
    <article className={`rounded-xl border border-[#E5E7EB] border-l-4 p-3 ${style.row}`}>
      <div className="flex items-start gap-3">
        <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${style.icon}`}>
          <Icon size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${style.pill}`}>{label}</span>
              {entry.createdAt && <span className="text-[10px] font-bold tabular-nums text-[#9CA3AF]">{formatTime(entry.createdAt, '—')}</span>}
            </div>
            {entry.entryType === 'absence' ? (
              <span className={`text-xs font-black ${style.amount}`}>{label}</span>
            ) : (
              <span className={`text-sm font-black ${style.amount}`}>
                {entry.entryType === 'fine' ? '− ' : entry.entryType === 'bonus' ? '+ ' : ''}{formatCurrency(entry.amount)}
              </span>
            )}
          </div>
          {detail && <p className="mt-1.5 break-words text-xs font-semibold leading-relaxed text-[#6B7280]">{detail}</p>}
          {canDelete && (
            <div className="mt-2 flex items-center justify-end gap-2">
              {confirming && (
                <button
                  type="button"
                  onClick={onCancelDelete}
                  disabled={saving}
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#E5E7EB] bg-white px-2.5 text-[10px] font-black text-[#6B7280] disabled:opacity-50"
                >
                  <X size={12} />{labels.cancel}
                </button>
              )}
              <button
                type="button"
                onClick={onDelete}
                disabled={saving}
                aria-label={`${labels.delete}: ${label}`}
                className={`inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-red-200 bg-white text-[10px] font-black text-red-600 disabled:opacity-50 ${confirming ? 'px-2.5' : 'w-8'}`}
              >
                {saving ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                {confirming && labels.confirm}
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  )
}
