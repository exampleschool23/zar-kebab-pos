import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, CalendarCheck2, CalendarDays, CalendarX2, Check, ChevronDown, ChevronUp, History, Loader2, Pencil, Percent, Power, RefreshCw, UserRound, Users, WalletCards, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import AppShell from '../components/AppShell'
import { useApp } from '../store/AppContext'
import { supabase } from '../lib/supabase'
import { formatCurrency } from '../lib/formatCurrency'
import { formatLongDate } from '../lib/dateFormat'
import { useAuth } from '../contexts/AuthContext'
import { canEditFeature, normalizeRole } from '../lib/permissions'
import { compareSalaryAbsencesNewestFirst } from '../lib/salaryTransactions'
import { formatKpiRatePercent, getEffectiveKpiRule } from '../lib/dailyKpi'
import {
  getDailySalaryAmount,
  getSalaryAbsenceForDate,
  getSalaryAbsenceDates,
  getSalaryActiveUntil,
  getSalaryBalance,
  getTotalSalaryDue,
  buildSalaryReactivationAbsenceRows,
  normalizeSalaryEndDate,
  todayExpenseDate,
} from '../lib/expenses'

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

function composeEmployees(rows = [], rates = [], payments = [], fines = [], absences = [], profiles = []) {
  const profileMap = Object.fromEntries(profiles.map(profile => [profile.id, profile]))
  return rows.map(row => ({
    ...row,
    profile: profileMap[row.profile_id] || null,
    rates: rates
      .filter(rate => rate.salary_profile_id === row.id)
      .sort((a, b) => String(b.effective_from || '').localeCompare(String(a.effective_from || ''))),
    payments: payments.filter(payment => payment.salary_profile_id === row.id),
    fines: fines.filter(fine => fine.salary_profile_id === row.id),
    absences: absences
      .filter(absence => absence.salary_profile_id === row.id)
      .sort(compareSalaryAbsencesNewestFirst),
  }))
}

function employeeName(employee) {
  return employee.employee_name || employee.profile?.full_name || employee.profile?.email || 'Employee'
}

export default function Employees() {
  const { state } = useApp()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const lang = state.lang || 'ru'
  const today = todayExpenseDate()
  const canManage = canEditFeature(profile || { role: state.user?.role }, 'expenses')
  const isOwner = normalizeRole(profile?.role || state.user?.role) === 'owner'
  const canEditName = canManage && isOwner

  const L = {
    uz: {
      title: 'Xodimlar',
      sub: 'Maosh tizimidagi xodimlar ro‘yxati',
      back: 'Maoshlarga qaytish',
      refresh: 'Yangilash',
      active: 'Faol',
      inactive: 'Nofaol',
      inactiveSection: 'Faolsizlantirilgan xodimlar',
      inactiveNewestFirst: 'Eng oxirgi faolsizlantirilgan xodim birinchi',
      joined: 'Ishga kirgan',
      ended: 'Tugagan',
      daily: 'Kunlik',
      kpi: 'KPI',
      kpiEnabled: 'Faol',
      kpiDisabled: 'O‘chirilgan',
      kpiNotConfigured: 'Belgilanmagan',
      kpiUnavailable: 'Mavjud emas',
      activeDaily: 'Kunlik faol',
      absentToday: 'Bugun kelmagan',
      undoAbsence: 'Yo‘qlikni bekor qilish',
      undoAbsenceWarning: 'Bugungi maosh qayta hisoblanadi. Telegramdagi yuborilgan xabarlar o‘chirilmaydi.',
      undoAbsenceFailed: 'Bugungi yo‘qlikni bekor qilib bo‘lmadi.',
      balance: 'Balans',
      due: 'Qarz',
      endDate: 'Tugash sanasi',
      status: 'Holat',
      history: 'Maosh tarixi',
      historyBtn: 'Tarix',
      paymentHistory: 'To‘lovlar / bonuslar / jarimalar',
      paymentLabel: 'To‘lov',
      bonusLabel: 'Bonus',
      fineLabel: 'Jarima',
      absenceHistory: 'Kelmagan kunlar',
      absentLabel: 'Kelmagan',
      editName: 'Ismni o‘zgartirish',
      employeeName: 'Xodim ismi',
      saveName: 'Saqlash',
      cancel: 'Bekor qilish',
      nameRequired: 'Xodim ismini kiriting.',
      deactivate: 'Faolsizlantirish',
      reactivate: 'Qayta yoqish',
      confirm: 'Tasdiqlash',
      empty: 'Xodimlar hali qo‘shilmagan',
      migration: 'Maosh jadvallari yangilanmagan. Supabase SQL editorida employee_salary migratsiyalarini ishga tushiring.',
    },
    ru: {
      title: 'Сотрудники',
      sub: 'Список сотрудников в зарплатной системе',
      back: 'Назад к зарплатам',
      refresh: 'Обновить',
      active: 'Активен',
      inactive: 'Неактивен',
      inactiveSection: 'Деактивированные сотрудники',
      inactiveNewestFirst: 'Сначала недавно деактивированные',
      joined: 'Дата выхода',
      ended: 'Дата окончания',
      daily: 'За день',
      kpi: 'KPI',
      kpiEnabled: 'Включён',
      kpiDisabled: 'Выключен',
      kpiNotConfigured: 'Не настроен',
      kpiUnavailable: 'Недоступно',
      activeDaily: 'Активные за день',
      absentToday: 'Сегодня отсутствует',
      undoAbsence: 'Отменить отсутствие',
      undoAbsenceWarning: 'Зарплата за сегодня будет восстановлена. Отправленные сообщения Telegram не удаляются.',
      undoAbsenceFailed: 'Не удалось отменить сегодняшнее отсутствие.',
      balance: 'Баланс',
      due: 'Долг',
      endDate: 'Дата окончания',
      status: 'Статус',
      history: 'История зарплаты',
      historyBtn: 'История',
      paymentHistory: 'Выплаты / бонусы / штрафы',
      paymentLabel: 'Выплата',
      bonusLabel: 'Бонус',
      fineLabel: 'Штраф',
      absenceHistory: 'Дни отсутствия',
      absentLabel: 'Отсутствовал',
      editName: 'Изменить имя',
      employeeName: 'Имя сотрудника',
      saveName: 'Сохранить',
      cancel: 'Отмена',
      nameRequired: 'Введите имя сотрудника.',
      deactivate: 'Деактивировать',
      reactivate: 'Включить снова',
      confirm: 'Подтвердить',
      empty: 'Сотрудники еще не добавлены',
      migration: 'Таблицы зарплат не обновлены. Запустите миграции employee_salary в Supabase SQL Editor.',
    },
    en: {
      title: 'Employees',
      sub: 'Employee list from the salary system',
      back: 'Back to salaries',
      refresh: 'Refresh',
      active: 'Active',
      inactive: 'Inactive',
      inactiveSection: 'Deactivated employees',
      inactiveNewestFirst: 'Most recently deactivated first',
      joined: 'Joined',
      ended: 'Ended',
      daily: 'Daily',
      kpi: 'KPI',
      kpiEnabled: 'Enabled',
      kpiDisabled: 'Disabled',
      kpiNotConfigured: 'Not configured',
      kpiUnavailable: 'Unavailable',
      activeDaily: 'Active daily',
      absentToday: 'Absent today',
      undoAbsence: 'Undo absence',
      undoAbsenceWarning: "Today's salary will be restored. Sent Telegram messages are not recalled.",
      undoAbsenceFailed: "Could not undo today's absence.",
      balance: 'Balance',
      due: 'Due',
      endDate: 'End date',
      status: 'Status',
      history: 'Salary history',
      historyBtn: 'History',
      paymentHistory: 'Payments / bonuses / fines',
      paymentLabel: 'Payment',
      bonusLabel: 'Bonus',
      fineLabel: 'Fine',
      absenceHistory: 'Absent dates',
      absentLabel: 'Absent',
      editName: 'Edit name',
      employeeName: 'Employee name',
      saveName: 'Save',
      cancel: 'Cancel',
      nameRequired: 'Enter the employee name.',
      deactivate: 'Deactivate',
      reactivate: 'Reactivate',
      confirm: 'Confirm',
      empty: 'No employees added yet',
      migration: 'Salary tables are not up to date. Run the employee_salary migrations in Supabase SQL Editor.',
    },
  }
  const l = L[lang] || L.en

  const [employees, setEmployees] = useState([])
  const [kpiRules, setKpiRules] = useState([])
  const [kpiRulesAvailable, setKpiRulesAvailable] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState('')
  const [confirmActionKey, setConfirmActionKey] = useState('')
  const [deactivateDates, setDeactivateDates] = useState({})
  const [inactiveExpanded, setInactiveExpanded] = useState(false)
  const [editingNameId, setEditingNameId] = useState(null)
  const [editingName, setEditingName] = useState('')
  const [error, setError] = useState('')

  async function loadEmployees() {
    setLoading(true)
    setError('')
    const [teamRes, profileRes, rateRes, paymentRes, fineRes, absenceRes, kpiRuleRes] = await Promise.all([
      supabase.from('profiles').select('id, full_name, email, role, status, created_at').order('full_name'),
      supabase.from('employee_salary_profiles').select('*').order('employee_name'),
      supabase.from('employee_salary_rates').select('*').order('effective_from', { ascending: false }),
      supabase.from('employee_salary_payments').select('*'),
      supabase.from('employee_salary_fines').select('*'),
      supabase.from('employee_salary_absences').select('*'),
      supabase.from('employee_kpi_rules')
        .select('id, salary_profile_id, effective_from, rate_bps, is_enabled, created_at, updated_at')
        .lte('effective_from', today)
        .order('effective_from', { ascending: false })
        .order('updated_at', { ascending: false }),
    ])

    setKpiRules(kpiRuleRes.error ? [] : kpiRuleRes.data || [])
    setKpiRulesAvailable(!kpiRuleRes.error)

    const salaryError = profileRes.error || rateRes.error || paymentRes.error || absenceRes.error
    if (salaryError) {
      setError(isMissingSalaryMigration(salaryError) ? l.migration : salaryError.message)
      setEmployees([])
    } else {
      if (fineRes.error) setError(isMissingSalaryMigration(fineRes.error) ? l.migration : fineRes.error.message)
      setEmployees(composeEmployees(
        profileRes.data || [],
        rateRes.data || [],
        paymentRes.data || [],
        fineRes.error ? [] : fineRes.data || [],
        absenceRes.data || [],
        teamRes.data || [],
      ).filter(employee => !employee.deleted_at))
    }
    setLoading(false)
  }

  useEffect(() => { loadEmployees() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const activeEmployees = useMemo(() => employees.filter(item => item.is_active !== false), [employees])
  const absentTodayEmployeeIds = useMemo(() => new Set(
    activeEmployees
      .filter(employee => getSalaryAbsenceDates(employee).has(today))
      .map(employee => employee.id)
  ), [activeEmployees, today])
  const sortedActiveEmployees = useMemo(() => (
    [...activeEmployees].sort((a, b) => (
      Number(absentTodayEmployeeIds.has(b.id)) - Number(absentTodayEmployeeIds.has(a.id)) ||
      employeeName(a).localeCompare(employeeName(b))
    ))
  ), [activeEmployees, absentTodayEmployeeIds])
  const inactiveEmployees = useMemo(() => (
    employees
      .filter(item => item.is_active === false)
      .sort((a, b) => (
        String(b.ended_at || '').localeCompare(String(a.ended_at || '')) ||
        employeeName(a).localeCompare(employeeName(b))
      ))
  ), [employees])
  const employeeGridEntries = [
    ...sortedActiveEmployees.map(employee => ({ type: 'employee', employee })),
    ...(inactiveEmployees.length > 0 ? [{ type: 'inactive-toggle', id: 'inactive-toggle' }] : []),
    ...(inactiveExpanded ? inactiveEmployees.map(employee => ({ type: 'employee', employee })) : []),
  ]
  const activeCount = activeEmployees.length
  const absentTodayCount = absentTodayEmployeeIds.size
  const activeDailySalary = useMemo(() => (
    activeEmployees.reduce((sum, item) => sum + getDailySalaryAmount(item, today), 0)
  ), [activeEmployees, today])
  const totalDue = useMemo(() => getTotalSalaryDue(employees, today), [employees, today])

  async function toggleEmployeeActive(employee) {
    if (!canManage || !employee?.id) return
    const key = `employee-toggle-${employee.id}`
    const nextActive = employee.is_active === false
    if (confirmActionKey !== key) {
      setConfirmActionKey(key)
      if (!nextActive) {
        setDeactivateDates(current => ({
          ...current,
          [employee.id]: normalizeSalaryEndDate(employee, current[employee.id], today),
        }))
      }
      return
    }
    setSaving(key)
    setError('')
    if (nextActive) {
      const absenceRows = buildSalaryReactivationAbsenceRows(employee, today)
      if (absenceRows.length > 0) {
        const { error: absenceError } = await supabase
          .from('employee_salary_absences')
          .upsert(absenceRows, { onConflict: 'salary_profile_id,absence_date', ignoreDuplicates: true })
        if (absenceError) {
          setSaving('')
          setConfirmActionKey('')
          setError(absenceError.message)
          return
        }
      }
    }
    const patch = nextActive
      ? { is_active: true, ended_at: null }
      : { is_active: false, ended_at: normalizeSalaryEndDate(employee, deactivateDates[employee.id], today) }
    const { error: updateError } = await supabase
      .from('employee_salary_profiles')
      .update(patch)
      .eq('id', employee.id)
    setSaving('')
    setConfirmActionKey('')
    if (updateError) {
      setError(updateError.message)
      return
    }
    setDeactivateDates(current => {
      const next = { ...current }
      delete next[employee.id]
      return next
    })
    await loadEmployees()
  }

  async function undoEmployeeAbsence(employee) {
    if (!canManage || !employee?.id) return
    const absence = getSalaryAbsenceForDate(employee, today)
    if (!absence?.id) {
      setError(l.undoAbsenceFailed)
      await loadEmployees()
      return
    }
    const key = `absence-undo-${employee.id}`
    if (confirmActionKey !== key) {
      setConfirmActionKey(key)
      return
    }

    setSaving(key)
    setError('')
    const { data, error: deleteError } = await supabase
      .from('employee_salary_absences')
      .delete()
      .eq('id', absence.id)
      .eq('salary_profile_id', employee.id)
      .eq('absence_date', today)
      .select('id')
    setSaving('')
    setConfirmActionKey('')
    if (deleteError || !data?.length) {
      setError(deleteError?.message || l.undoAbsenceFailed)
      return
    }
    await loadEmployees()
  }
  function startNameEdit(employee) {
    if (!canEditName || !employee?.id) return
    setEditingNameId(employee.id)
    setEditingName(employeeName(employee))
    setConfirmActionKey('')
    setError('')
  }

  function cancelNameEdit() {
    setEditingNameId(null)
    setEditingName('')
  }

  async function saveEmployeeName(employee) {
    if (!canEditName || !employee?.id || editingNameId !== employee.id) return
    const nextName = editingName.trim()
    if (!nextName) {
      setError(l.nameRequired)
      return
    }

    const key = `employee-name-${employee.id}`
    setSaving(key)
    setError('')
    const { error: updateError } = await supabase
      .from('employee_salary_profiles')
      .update({ employee_name: nextName })
      .eq('id', employee.id)
    setSaving('')
    if (updateError) {
      setError(updateError.message)
      return
    }
    cancelNameEdit()
    await loadEmployees()
  }

  return (
    <AppShell title={l.title}>
      <div className="h-full overflow-y-auto bg-[#FAF7F0]">
        <div className="mx-auto max-w-[1200px] px-4 py-5 sm:px-5 sm:py-6">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <button onClick={() => navigate('/admin/accounting/salaries')} className="mb-3 inline-flex items-center gap-2 text-xs font-black text-[#6B7280] hover:text-[#ff5a00]">
                <ArrowLeft size={14} />{l.back}
              </button>
              <h1 className="text-2xl font-black text-[#1F2937]">{l.title}</h1>
              <p className="mt-1 text-sm font-medium text-[#6B7280]">{l.sub}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Kpi icon={Users} label={l.active} value={activeCount} />
              <Kpi icon={CalendarX2} label={l.absentToday} value={absentTodayCount} danger={absentTodayCount > 0} />
              <Kpi icon={CalendarDays} label={l.activeDaily} value={formatCurrency(activeDailySalary)} />
              <Kpi icon={WalletCards} label={l.due} value={formatCurrency(totalDue)} hot={totalDue > 0} />
              <button onClick={loadEmployees} className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-xs font-black text-[#6B7280] shadow-sm">
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />{l.refresh}
              </button>
            </div>
          </div>

          {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}

          {loading ? (
            <div className="flex justify-center py-20"><Loader2 size={30} className="animate-spin text-gray-300" /></div>
          ) : employees.length === 0 ? (
            <div className="rounded-2xl border border-[#E5E7EB] bg-white px-4 py-16 text-center text-sm font-bold text-[#9CA3AF]">{l.empty}</div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {employeeGridEntries.map(entry => {
                if (entry.type === 'inactive-toggle') {
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => setInactiveExpanded(current => !current)}
                      aria-expanded={inactiveExpanded}
                      className="flex min-h-20 items-center justify-between gap-4 rounded-2xl border border-[#E5E7EB] bg-[#F3F4F6] px-4 py-3 text-left shadow-sm transition-colors hover:border-gray-300 md:col-span-2 xl:col-span-3"
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gray-200 text-[#6B7280]">
                          <Users size={18} />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-black text-[#1F2937]">{l.inactiveSection}</span>
                          <span className="mt-0.5 block text-xs font-semibold text-[#9CA3AF]">{l.inactiveNewestFirst}</span>
                        </span>
                      </span>
                      <span className="flex flex-shrink-0 items-center gap-2">
                        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-[#6B7280]">{inactiveEmployees.length}</span>
                        {inactiveExpanded ? <ChevronUp size={18} className="text-[#6B7280]" /> : <ChevronDown size={18} className="text-[#6B7280]" />}
                      </span>
                    </button>
                  )
                }
                const employee = entry.employee
                const inactive = employee.is_active === false
                const todayAbsence = getSalaryAbsenceForDate(employee, today)
                const absentToday = !inactive && Boolean(todayAbsence)
                const activeUntil = getSalaryActiveUntil(employee, today)
                const salaryBalance = getSalaryBalance(employee, today)
                const toggleKey = `employee-toggle-${employee.id}`
                const confirmToggle = confirmActionKey === toggleKey
                const undoAbsenceKey = `absence-undo-${employee.id}`
                const confirmUndoAbsence = confirmActionKey === undoAbsenceKey
                const editingEmployeeName = editingNameId === employee.id
                const nameSavingKey = `employee-name-${employee.id}`
                const joinedDate = String(employee.joined_at || '').slice(0, 10)
                const deactivateDate = normalizeSalaryEndDate(employee, deactivateDates[employee.id], today)
                const effectiveKpiRule = getEffectiveKpiRule(kpiRules, employee.id, today)
                return (
                  <section key={employee.id} className={`rounded-2xl border p-4 shadow-sm ${
                    inactive
                      ? 'border-[#E5E7EB] bg-[#F3F4F6]'
                      : absentToday
                        ? 'border-red-300 bg-red-50/80 ring-2 ring-red-100'
                        : 'border-[#E5E7EB] bg-white'
                  }`}>
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${
                          inactive
                            ? 'bg-gray-200 text-[#6B7280]'
                            : absentToday
                              ? 'bg-red-100 text-red-600'
                              : 'bg-orange-50 text-[#ff5a00]'
                        }`}>
                          {absentToday ? <CalendarX2 size={19} /> : <UserRound size={19} />}
                        </div>
                        <div className="min-w-0 flex-1">
                          {editingEmployeeName ? (
                            <div className="flex min-w-0 items-center gap-1.5">
                              <input
                                type="text"
                                value={editingName}
                                onChange={event => setEditingName(event.target.value)}
                                onKeyDown={event => {
                                  if (event.key === 'Enter') saveEmployeeName(employee)
                                  if (event.key === 'Escape') cancelNameEdit()
                                }}
                                maxLength={120}
                                autoFocus
                                aria-label={l.employeeName}
                                className="h-9 min-w-0 flex-1 rounded-lg border border-orange-300 bg-white px-2.5 text-sm font-black text-[#1F2937] outline-none ring-2 ring-orange-100"
                              />
                              <button
                                type="button"
                                onClick={() => saveEmployeeName(employee)}
                                disabled={saving === nameSavingKey}
                                title={l.saveName}
                                aria-label={l.saveName}
                                className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[#ff5a00] text-white disabled:opacity-60"
                              >
                                {saving === nameSavingKey ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                              </button>
                              <button
                                type="button"
                                onClick={cancelNameEdit}
                                disabled={saving === nameSavingKey}
                                title={l.cancel}
                                aria-label={l.cancel}
                                className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-[#E5E7EB] bg-white text-[#6B7280] disabled:opacity-60"
                              >
                                <X size={15} />
                              </button>
                            </div>
                          ) : (
                            <div className="flex min-w-0 items-center gap-1.5">
                              <h2 className={`truncate text-base font-black ${inactive ? 'text-[#6B7280]' : 'text-[#1F2937]'}`}>{employeeName(employee)}</h2>
                              {canEditName && (
                                <button
                                  type="button"
                                  onClick={() => startNameEdit(employee)}
                                  title={l.editName}
                                  aria-label={`${l.editName}: ${employeeName(employee)}`}
                                  className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-[#9CA3AF] transition-colors hover:bg-orange-50 hover:text-[#ff5a00]"
                                >
                                  <Pencil size={13} />
                                </button>
                              )}
                            </div>
                          )}
                          <p className="mt-1 text-xs font-bold text-[#9CA3AF]">{employee.profile?.role || l.status}</p>
                        </div>
                      </div>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-black ${
                        inactive
                          ? 'bg-gray-100 text-[#6B7280]'
                          : absentToday
                            ? 'bg-red-100 text-red-700 ring-1 ring-red-200'
                            : 'bg-green-50 text-green-700'
                      }`}>
                        {inactive ? l.inactive : absentToday ? l.absentToday : l.active}
                      </span>
                    </div>

                    <div className="space-y-2 text-xs font-bold text-[#6B7280]">
                      <Row label={l.joined} value={formatLongDate(employee.joined_at, lang, employee.joined_at)} icon={CalendarDays} />
                      {inactive && employee.ended_at && <Row label={l.ended} value={formatLongDate(employee.ended_at, lang, employee.ended_at)} icon={CalendarDays} />}
                      <Row label={l.daily} value={formatCurrency(getDailySalaryAmount(employee, activeUntil))} />
                      <EmployeeKpiRow
                        label={l.kpi}
                        rule={effectiveKpiRule}
                        lang={lang}
                        available={kpiRulesAvailable}
                        enabledLabel={l.kpiEnabled}
                        disabledLabel={l.kpiDisabled}
                        notConfiguredLabel={l.kpiNotConfigured}
                        unavailableLabel={l.kpiUnavailable}
                      />
                      <Row
                        label={l.balance}
                        value={formatCurrency(salaryBalance)}
                        hot={salaryBalance > 0}
                        negative={salaryBalance < 0}
                      />
                    </div>

                    {!inactive && confirmToggle && (
                      <label className="mt-3 block rounded-xl border border-red-100 bg-red-50 px-3 py-2">
                        <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-red-600">{l.endDate}</span>
                        <DateInput
                          value={deactivateDate}
                          min={joinedDate || undefined}
                          max={today}
                          lang={lang}
                          onChange={value => setDeactivateDates(current => ({
                            ...current,
                            [employee.id]: normalizeSalaryEndDate(employee, value, today),
                          }))}
                        />
                      </label>
                    )}

                    {confirmUndoAbsence && (
                      <p role="alert" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold leading-relaxed text-amber-800">
                        {l.undoAbsenceWarning}
                      </p>
                    )}

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => navigate(`/admin/accounting/employees/${employee.id}/history`)}
                        className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs font-black text-[#6B7280]"
                      >
                        <History size={14} />{l.historyBtn}
                      </button>
                      {canManage && (
                        <>
                          {absentToday && (
                            <button
                              type="button"
                              onClick={() => undoEmployeeAbsence(employee)}
                              disabled={saving === undoAbsenceKey}
                              className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-xs font-black ${
                                confirmUndoAbsence
                                  ? 'border-red-200 bg-red-50 text-red-600'
                                  : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                              }`}
                            >
                              {saving === undoAbsenceKey
                                ? <Loader2 size={14} className="animate-spin" />
                                : <CalendarCheck2 size={14} />}
                              {confirmUndoAbsence ? l.confirm : l.undoAbsence}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => toggleEmployeeActive(employee)}
                            disabled={saving === `employee-toggle-${employee.id}`}
                            className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-xs font-black ${
                              inactive ? 'border-[#E5E7EB] bg-white text-[#1F2937]' : 'border-red-200 bg-red-50 text-red-600'
                            }`}
                          >
                            {saving === toggleKey ? <Loader2 size={14} className="animate-spin" /> : <Power size={14} />}
                            {confirmToggle ? l.confirm : inactive ? l.reactivate : l.deactivate}
                          </button>
                        </>
                      )}
                    </div>
                  </section>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}

function Kpi({ icon: Icon, label, value, hot = false, danger = false }) {
  const highlighted = hot || danger
  return (
    <div className={`rounded-xl border px-3 py-2 shadow-sm ${danger ? 'border-red-200 bg-red-50' : hot ? 'border-orange-200 bg-orange-50' : 'border-[#E5E7EB] bg-white'}`}>
      <p className={`flex items-center gap-1 text-[11px] font-black uppercase tracking-wide ${danger ? 'text-red-600' : hot ? 'text-[#ff5a00]' : 'text-[#9CA3AF]'}`}>
        <Icon size={13} />{label}
      </p>
      <p className={`text-sm font-black ${highlighted && danger ? 'text-red-700' : 'text-[#1F2937]'}`}>{value}</p>
    </div>
  )
}

function Row({ icon: Icon, label, value, hot = false, negative = false }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-[#F9FAFB] px-3 py-2">
      <span className="inline-flex items-center gap-1.5 text-[#9CA3AF]">{Icon && <Icon size={13} />}{label}</span>
      <span className={`text-right font-black ${negative ? 'text-red-600' : hot ? 'text-[#ff5a00]' : 'text-[#1F2937]'}`}>{value}</span>
    </div>
  )
}

function EmployeeKpiRow({
  label,
  rule,
  lang,
  available,
  enabledLabel,
  disabledLabel,
  notConfiguredLabel,
  unavailableLabel,
}) {
  const configured = Boolean(rule)
  const enabled = configured && rule.is_enabled !== false
  const statusLabel = !available
    ? unavailableLabel
    : !configured
      ? notConfiguredLabel
      : enabled
        ? enabledLabel
        : disabledLabel

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-[#F9FAFB] px-3 py-2">
      <span className="inline-flex items-center gap-1.5 text-[#9CA3AF]"><Percent size={13} />{label}</span>
      <span className="flex min-w-0 items-center justify-end gap-2 text-right">
        {configured && available && (
          <span className={`font-black ${enabled ? 'text-violet-600' : 'text-[#6B7280]'}`}>
            {formatKpiRatePercent(rule.rate_bps, lang)}
          </span>
        )}
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${
          enabled
            ? 'bg-violet-100 text-violet-700'
            : configured && available
              ? 'bg-gray-200 text-[#6B7280]'
              : 'bg-gray-100 text-[#9CA3AF]'
        }`}>
          {statusLabel}
        </span>
      </span>
    </div>
  )
}

function DateInput({ value, lang, onChange, min, max }) {
  const inputRef = useRef(null)

  function openPicker(event) {
    if (event.button && event.button !== 0) return
    const input = inputRef.current
    if (!input) return
    input.focus()
    if (typeof input.showPicker === 'function') {
      try {
        input.showPicker()
      } catch {
        // Some browsers only allow showPicker during specific user gestures.
      }
    }
  }

  return (
    <div className="relative cursor-pointer" onPointerDown={openPicker}>
      <span className="pointer-events-none absolute inset-y-0 left-3 right-10 flex items-center overflow-hidden whitespace-nowrap text-sm font-black text-[#1F2937]">
        {formatLongDate(value, lang, value)}
      </span>
      <input
        ref={inputRef}
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={event => onChange(event.target.value)}
        className="w-full cursor-pointer rounded-lg border border-red-100 bg-white px-2 py-2 text-sm font-black text-transparent caret-transparent outline-none focus:border-red-300"
      />
    </div>
  )
}
