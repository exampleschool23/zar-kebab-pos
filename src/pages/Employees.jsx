import React, { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CalendarDays, CalendarX2, History, Loader2, Power, RefreshCw, UserRound, Users, WalletCards, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import AppShell from '../components/AppShell'
import { useApp } from '../store/AppContext'
import { supabase } from '../lib/supabase'
import { formatCurrency } from '../lib/formatCurrency'
import { formatLongDate } from '../lib/dateFormat'
import {
  expensePaymentMethodLabel,
  getDailySalaryAmount,
  getSalaryActiveUntil,
  getSalaryDue,
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

function composeEmployees(rows = [], rates = [], payments = [], bonuses = [], absences = [], profiles = []) {
  const profileMap = Object.fromEntries(profiles.map(profile => [profile.id, profile]))
  return rows.map(row => ({
    ...row,
    profile: profileMap[row.profile_id] || null,
    rates: rates
      .filter(rate => rate.salary_profile_id === row.id)
      .sort((a, b) => String(b.effective_from || '').localeCompare(String(a.effective_from || ''))),
    payments: payments.filter(payment => payment.salary_profile_id === row.id),
    bonuses: bonuses.filter(bonus => bonus.salary_profile_id === row.id),
    absences: absences.filter(absence => absence.salary_profile_id === row.id),
  }))
}

function employeeName(employee) {
  return employee.employee_name || employee.profile?.full_name || employee.profile?.email || 'Employee'
}

export default function Employees() {
  const { state } = useApp()
  const navigate = useNavigate()
  const lang = state.lang || 'ru'
  const today = todayExpenseDate()

  const L = {
    uz: {
      title: 'Xodimlar',
      sub: 'Maosh tizimidagi xodimlar ro‘yxati',
      back: 'Maoshlarga qaytish',
      refresh: 'Yangilash',
      active: 'Faol',
      inactive: 'Nofaol',
      joined: 'Ishga kirgan',
      ended: 'Tugagan',
      daily: 'Kunlik',
      due: 'Qarz',
      status: 'Holat',
      history: 'Maosh tarixi',
      historyBtn: 'Tarix',
      paymentHistory: 'To‘lovlar / bonuslar',
      paymentLabel: 'To‘lov',
      bonusLabel: 'Bonus',
      absenceHistory: 'Kelmagan kunlar',
      absentLabel: 'Kelmagan',
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
      joined: 'Дата выхода',
      ended: 'Дата окончания',
      daily: 'За день',
      due: 'Долг',
      status: 'Статус',
      history: 'История зарплаты',
      historyBtn: 'История',
      paymentHistory: 'Выплаты / бонусы',
      paymentLabel: 'Выплата',
      bonusLabel: 'Бонус',
      absenceHistory: 'Дни отсутствия',
      absentLabel: 'Отсутствовал',
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
      joined: 'Joined',
      ended: 'Ended',
      daily: 'Daily',
      due: 'Due',
      status: 'Status',
      history: 'Salary history',
      historyBtn: 'History',
      paymentHistory: 'Payments / bonuses',
      paymentLabel: 'Payment',
      bonusLabel: 'Bonus',
      absenceHistory: 'Absent dates',
      absentLabel: 'Absent',
      deactivate: 'Deactivate',
      reactivate: 'Reactivate',
      confirm: 'Confirm',
      empty: 'No employees added yet',
      migration: 'Salary tables are not up to date. Run the employee_salary migrations in Supabase SQL Editor.',
    },
  }
  const l = L[lang] || L.en

  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState('')
  const [confirmActionKey, setConfirmActionKey] = useState('')
  const [historyOpenId, setHistoryOpenId] = useState(null)
  const [error, setError] = useState('')

  async function loadEmployees() {
    setLoading(true)
    setError('')
    const [teamRes, profileRes, rateRes, paymentRes, bonusRes, absenceRes] = await Promise.all([
      supabase.from('profiles').select('id, full_name, email, role, status, created_at').order('full_name'),
      supabase.from('employee_salary_profiles').select('*').order('employee_name'),
      supabase.from('employee_salary_rates').select('*').order('effective_from', { ascending: false }),
      supabase.from('employee_salary_payments').select('*'),
      supabase.from('employee_salary_bonuses').select('*'),
      supabase.from('employee_salary_absences').select('*'),
    ])

    const salaryError = profileRes.error || rateRes.error || paymentRes.error || bonusRes.error || absenceRes.error
    if (salaryError) {
      setError(isMissingSalaryMigration(salaryError) ? l.migration : salaryError.message)
      setEmployees([])
    } else {
      setEmployees(composeEmployees(
        profileRes.data || [],
        rateRes.data || [],
        paymentRes.data || [],
        bonusRes.data || [],
        absenceRes.data || [],
        teamRes.data || [],
      ))
    }
    setLoading(false)
  }

  useEffect(() => { loadEmployees() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const sortedEmployees = useMemo(() => (
    [...employees].sort((a, b) => {
      if (Boolean(a.is_active) !== Boolean(b.is_active)) return a.is_active ? -1 : 1
      return employeeName(a).localeCompare(employeeName(b))
    })
  ), [employees])

  const activeCount = useMemo(() => employees.filter(item => item.is_active !== false).length, [employees])
  const totalDue = useMemo(() => employees.reduce((sum, item) => sum + getSalaryDue(item, today), 0), [employees, today])

  async function toggleEmployeeActive(employee) {
    if (!employee?.id) return
    const key = `employee-toggle-${employee.id}`
    if (confirmActionKey !== key) {
      setConfirmActionKey(key)
      return
    }
    setSaving(key)
    setError('')
    const nextActive = employee.is_active === false
    const patch = nextActive
      ? { is_active: true, ended_at: null }
      : { is_active: false, ended_at: today }
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
              <Kpi icon={WalletCards} label={l.due} value={formatCurrency(totalDue)} hot={totalDue > 0} />
              <button onClick={loadEmployees} className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-xs font-black text-[#6B7280] shadow-sm">
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />{l.refresh}
              </button>
            </div>
          </div>

          {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}

          {loading ? (
            <div className="flex justify-center py-20"><Loader2 size={30} className="animate-spin text-gray-300" /></div>
          ) : sortedEmployees.length === 0 ? (
            <div className="rounded-2xl border border-[#E5E7EB] bg-white px-4 py-16 text-center text-sm font-bold text-[#9CA3AF]">{l.empty}</div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {sortedEmployees.map(employee => {
                const inactive = employee.is_active === false
                const activeUntil = getSalaryActiveUntil(employee, today)
                return (
                  <section key={employee.id} className={`rounded-2xl border p-4 shadow-sm ${inactive ? 'border-[#E5E7EB] bg-[#F3F4F6]' : 'border-[#E5E7EB] bg-white'}`}>
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${inactive ? 'bg-gray-200 text-[#6B7280]' : 'bg-orange-50 text-[#ff5a00]'}`}>
                          <UserRound size={19} />
                        </div>
                        <div className="min-w-0">
                          <h2 className={`truncate text-base font-black ${inactive ? 'text-[#6B7280]' : 'text-[#1F2937]'}`}>{employeeName(employee)}</h2>
                          <p className="mt-1 text-xs font-bold text-[#9CA3AF]">{employee.profile?.role || l.status}</p>
                        </div>
                      </div>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-black ${inactive ? 'bg-gray-100 text-[#6B7280]' : 'bg-green-50 text-green-700'}`}>
                        {inactive ? l.inactive : l.active}
                      </span>
                    </div>

                    <div className="space-y-2 text-xs font-bold text-[#6B7280]">
                      <Row label={l.joined} value={formatLongDate(employee.joined_at, lang, employee.joined_at)} icon={CalendarDays} />
                      {inactive && employee.ended_at && <Row label={l.ended} value={formatLongDate(employee.ended_at, lang, employee.ended_at)} icon={CalendarDays} />}
                      <Row label={l.daily} value={formatCurrency(getDailySalaryAmount(employee, activeUntil))} />
                      <Row label={l.due} value={formatCurrency(getSalaryDue(employee, today))} hot />
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setHistoryOpenId(employee.id)}
                        className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs font-black text-[#6B7280]"
                      >
                        <History size={14} />{l.historyBtn}
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleEmployeeActive(employee)}
                        disabled={saving === `employee-toggle-${employee.id}`}
                        className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-xs font-black ${
                          inactive ? 'border-[#E5E7EB] bg-white text-[#1F2937]' : 'border-red-200 bg-red-50 text-red-600'
                        }`}
                      >
                        {saving === `employee-toggle-${employee.id}` ? <Loader2 size={14} className="animate-spin" /> : <Power size={14} />}
                        {confirmActionKey === `employee-toggle-${employee.id}` ? l.confirm : inactive ? l.reactivate : l.deactivate}
                      </button>
                    </div>
                  </section>
                )
              })}
            </div>
          )}
        </div>
      </div>
      {(() => {
        const drawerEmployee = historyOpenId ? employees.find(item => item.id === historyOpenId) : null
        if (!drawerEmployee) return null
        const drawerInactive = drawerEmployee.is_active === false
        const transactionHistory = [
          ...drawerEmployee.payments.map(payment => ({
            id: payment.id,
            entryType: 'payment',
            date: payment.paid_date,
            amount: payment.amount,
            detail: payment.note || expensePaymentMethodLabel(payment.payment_method, lang),
          })),
          ...drawerEmployee.bonuses.map(bonus => ({
            id: bonus.id,
            entryType: 'bonus',
            date: bonus.bonus_date,
            amount: bonus.amount,
            detail: bonus.note || expensePaymentMethodLabel(bonus.payment_method, lang),
          })),
        ].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))

        return (
          <>
            <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setHistoryOpenId(null)} />
            <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-2xl">
              <div className="flex flex-shrink-0 items-center justify-between border-b border-[#E5E7EB] px-5 py-4">
                <div>
                  <h2 className="text-base font-black text-[#1F2937]">{employeeName(drawerEmployee)}</h2>
                  <p className="mt-0.5 text-xs font-bold text-[#6B7280]">{l.history}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setHistoryOpenId(null)}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#E5E7EB] text-[#6B7280] hover:text-[#1F2937]"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
                <div>
                  <p className="mb-2 text-xs font-black uppercase tracking-wide text-[#6B7280]">{l.paymentHistory}</p>
                  <div className="space-y-1">
                    {transactionHistory.map(entry => (
                      <div key={`${entry.entryType}-${entry.id}`} className={`flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-xs font-bold ${drawerInactive ? 'bg-[#F3F4F6] text-[#9CA3AF]' : 'bg-[#F9FAFB] text-[#6B7280]'}`}>
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{formatLongDate(entry.date, lang, entry.date)}</span>
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-black ${entry.entryType === 'bonus' ? 'bg-blue-50 text-blue-700' : 'bg-orange-50 text-[#ff5a00]'}`}>
                            {entry.entryType === 'bonus' ? l.bonusLabel : l.paymentLabel}
                          </span>
                          {entry.detail && <span className="text-[#9CA3AF]">{entry.detail}</span>}
                        </div>
                        <span className="font-black text-[#1F2937]">{formatCurrency(entry.amount)}</span>
                      </div>
                    ))}
                    {transactionHistory.length === 0 && (
                      <p className="py-4 text-center text-xs font-bold text-[#9CA3AF]">—</p>
                    )}
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-xs font-black uppercase tracking-wide text-[#6B7280]">{l.absenceHistory}</p>
                  <div className="space-y-1">
                    {drawerEmployee.absences.map(absence => (
                      <div key={absence.id} className={`flex flex-wrap items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold ${drawerInactive ? 'bg-[#F3F4F6] text-[#9CA3AF]' : 'bg-red-50 text-red-700'}`}>
                        <CalendarX2 size={13} />
                        <span>{formatLongDate(absence.absence_date, lang, absence.absence_date)}</span>
                        <span className="inline-flex rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-black">{l.absentLabel}</span>
                        {absence.note && <span className="text-[#9CA3AF]">{absence.note}</span>}
                      </div>
                    ))}
                    {drawerEmployee.absences.length === 0 && (
                      <p className="py-4 text-center text-xs font-bold text-[#9CA3AF]">—</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        )
      })()}
    </AppShell>
  )
}

function Kpi({ icon: Icon, label, value, hot = false }) {
  return (
    <div className={`rounded-xl border px-3 py-2 shadow-sm ${hot ? 'border-orange-200 bg-orange-50' : 'border-[#E5E7EB] bg-white'}`}>
      <p className={`flex items-center gap-1 text-[11px] font-black uppercase tracking-wide ${hot ? 'text-[#ff5a00]' : 'text-[#9CA3AF]'}`}>
        <Icon size={13} />{label}
      </p>
      <p className="text-sm font-black text-[#1F2937]">{value}</p>
    </div>
  )
}

function Row({ icon: Icon, label, value, hot = false }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-[#F9FAFB] px-3 py-2">
      <span className="inline-flex items-center gap-1.5 text-[#9CA3AF]">{Icon && <Icon size={13} />}{label}</span>
      <span className={`text-right font-black ${hot ? 'text-[#ff5a00]' : 'text-[#1F2937]'}`}>{value}</span>
    </div>
  )
}
