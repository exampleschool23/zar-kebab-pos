import React, { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, Loader2, Plus, Power, RefreshCw, Save, Trash2, WalletCards } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import AppShell from '../components/AppShell'
import { useApp } from '../store/AppContext'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { formatCurrency } from '../lib/formatCurrency'
import {
  EXPENSE_PAYMENT_METHODS,
  SALARY_PAY_SCHEDULES,
  SALARY_RATE_UNITS,
  buildSalaryBonusExpenseRows,
  buildSalaryExpenseRows,
  convertSalaryAmountToDaily,
  expensePaymentMethodLabel,
  getDailySalaryAmount,
  getSalaryActiveUntil,
  getSalaryDue,
  getTotalSalaryDue,
  normalizeExpenseAmount,
} from '../lib/expenses'
import { todayExpenseDate } from '../lib/expenses'

const FIELD = 'w-full rounded-xl border border-[#E5E7EB] bg-white px-3 py-2.5 text-sm font-semibold text-[#1F2937] outline-none focus:border-[#ff5a00]'
const PAGE_SIZE = 12

function isMissingSalaryMigration(error) {
  const text = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return text.includes('employee_salary') && (
    text.includes('does not exist') ||
    text.includes('could not find the') ||
    text.includes('column') ||
    text.includes('amount') ||
    text.includes('schema cache') ||
    text.includes('42p01')
  )
}

function composeSalaryProfiles(rows = [], rates = [], payments = [], bonuses = [], profiles = []) {
  const profileMap = Object.fromEntries(profiles.map(profile => [profile.id, profile]))
  return rows.map(row => ({
    ...row,
    profile: profileMap[row.profile_id] || null,
    rates: rates
      .filter(rate => rate.salary_profile_id === row.id)
      .sort((a, b) => b.effective_from.localeCompare(a.effective_from)),
    payments: payments
      .filter(payment => payment.salary_profile_id === row.id)
      .sort((a, b) => b.paid_date.localeCompare(a.paid_date)),
    bonuses: bonuses
      .filter(bonus => bonus.salary_profile_id === row.id)
      .sort((a, b) => b.bonus_date.localeCompare(a.bonus_date)),
  }))
}

function payScheduleLabel(key, lang) {
  const labels = {
    daily: { uz: 'Kunlik', ru: 'Ежедневно', en: 'Daily' },
    twice_weekly: { uz: 'Haftasiga 2 marta', ru: '2 раза в неделю', en: 'Twice weekly' },
    monthly: { uz: 'Oylik', ru: 'Ежемесячно', en: 'Monthly' },
  }
  return labels[key]?.[lang] || labels[key]?.en || key
}

function salaryRateUnitLabel(key, lang) {
  const labels = {
    daily: { uz: 'Kunlik', ru: 'Дневная', en: 'Daily' },
    monthly: { uz: 'Oylik', ru: 'Месячная', en: 'Monthly' },
  }
  return labels[key]?.[lang] || labels[key]?.en || key
}

function formatAmountInput(value) {
  const digits = String(value || '').replace(/\D+/g, '')
  if (!digits) return ''
  return new Intl.NumberFormat('uz-UZ').format(Number(digits))
}

function parseAmountInput(value) {
  return String(value || '').replace(/\D+/g, '')
}

function buildSalaryRatePayload({ salaryProfileId, effectiveFrom, amount, salaryUnit, note = '', createdBy = null }) {
  return {
    salary_profile_id: salaryProfileId,
    effective_from: effectiveFrom,
    amount,
    rate_unit: salaryUnit,
    daily_amount: convertSalaryAmountToDaily(amount, salaryUnit),
    note,
    created_by: createdBy,
  }
}

export default function Salaries() {
  const { state } = useApp()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const lang = state.lang || 'ru'
  const role = (profile?.role || state.user?.role || 'guest').toLowerCase()
  const canManage = role === 'owner'
  const today = todayExpenseDate()

  const L = {
    uz: {
      title: 'Maoshlar',
      sub: 'Xodim maoshi, to‘lov jadvali va qarzdorlik',
      back: 'Xarajatlarga qaytish',
      add: 'Xodim maoshi qo‘shish',
      employee: 'Xodim',
      staffAccount: 'Tizim akkaunti',
      optional: 'Ixtiyoriy',
      employeeName: 'Xodim ismi',
      joined: 'Ishga kirgan sana',
      salaryAmount: 'Maosh summasi',
      salaryUnit: 'Maosh turi',
      schedule: 'To‘lov jadvali',
      method: 'To‘lov turi',
      effectiveFrom: 'Qachondan',
      save: 'Saqlash',
      delete: 'O‘chirish',
      remove: 'Butunlay o‘chirish',
      confirmDelete: 'Tasdiqlash',
      changeSalary: 'Maoshni o‘zgartirish',
      recordPayment: 'To‘lovni yozish',
      bonus: 'Bonus',
      addBonus: 'Bonus qo‘shish',
      paidDate: 'To‘lov sanasi',
      bonusDate: 'Bonus sanasi',
      amount: 'Summa',
      due: 'To‘lanishi kerak',
      totalDue: 'Jami qarzdorlik',
      accruedToday: 'Bugungi xarajat',
      history: 'Maosh tarixi',
      payments: 'To‘lovlar',
      active: 'Faol',
      inactive: 'Nofaol',
      deactivate: 'Faolsizlantirish',
      reactivate: 'Qayta yoqish',
      page: 'Sahifa',
      empty: 'Maosh sozlamalari yo‘q',
      migration: 'Maosh jadvallari yangilanmagan. supabase/054_employee_salary_profiles.sql, supabase/055_employee_salary_rate_amount_upgrade.sql, supabase/056_employee_salary_profile_end_date.sql va supabase/060_employee_salary_manual_names.sql migratsiyalarini ishga tushiring.',
      readOnly: 'Bu sahifa faqat egasi uchun.',
    },
    ru: {
      title: 'Зарплаты',
      sub: 'Дата выхода, дневная зарплата, график выплат и долг',
      back: 'Назад к расходам',
      add: 'Добавить зарплату сотрудника',
      employee: 'Сотрудник',
      staffAccount: 'Аккаунт в системе',
      optional: 'Необязательно',
      employeeName: 'Имя сотрудника',
      joined: 'Дата выхода',
      salaryAmount: 'Сумма зарплаты',
      salaryUnit: 'Тип зарплаты',
      schedule: 'График выплат',
      method: 'Способ оплаты',
      effectiveFrom: 'Действует с',
      save: 'Сохранить',
      delete: 'Удалить',
      remove: 'Удалить полностью',
      confirmDelete: 'Подтвердить',
      changeSalary: 'Изменить зарплату',
      recordPayment: 'Записать выплату',
      bonus: 'Бонус',
      addBonus: 'Добавить бонус',
      paidDate: 'Дата выплаты',
      bonusDate: 'Дата бонуса',
      amount: 'Сумма',
      due: 'К выплате',
      totalDue: 'Общий долг',
      accruedToday: 'Расход за день',
      history: 'История зарплаты',
      payments: 'Выплаты',
      active: 'Активен',
      inactive: 'Неактивен',
      deactivate: 'Деактивировать',
      reactivate: 'Включить снова',
      page: 'Страница',
      empty: 'Настроек зарплаты пока нет',
      migration: 'Таблицы зарплат не обновлены. Запустите supabase/054_employee_salary_profiles.sql, supabase/055_employee_salary_rate_amount_upgrade.sql, supabase/056_employee_salary_profile_end_date.sql и supabase/060_employee_salary_manual_names.sql.',
      readOnly: 'Эта страница доступна только владельцу.',
    },
    en: {
      title: 'Salaries',
      sub: 'Joining date, daily salary, payment schedule, and amount due',
      back: 'Back to expenses',
      add: 'Add employee salary',
      employee: 'Employee',
      staffAccount: 'System account',
      optional: 'Optional',
      employeeName: 'Employee name',
      joined: 'Joining date',
      salaryAmount: 'Salary amount',
      salaryUnit: 'Salary type',
      schedule: 'Payment schedule',
      method: 'Payment method',
      effectiveFrom: 'Effective from',
      save: 'Save',
      delete: 'Delete',
      remove: 'Remove completely',
      confirmDelete: 'Confirm',
      changeSalary: 'Change salary',
      recordPayment: 'Record payment',
      bonus: 'Bonus',
      addBonus: 'Add bonus',
      paidDate: 'Paid date',
      bonusDate: 'Bonus date',
      amount: 'Amount',
      due: 'Salary due',
      totalDue: 'Total due',
      accruedToday: 'Daily expense',
      history: 'Salary history',
      payments: 'Payments',
      active: 'Active',
      inactive: 'Inactive',
      deactivate: 'Deactivate',
      reactivate: 'Reactivate',
      page: 'Page',
      empty: 'No salary settings yet',
      migration: 'Salary tables are not up to date. Run supabase/054_employee_salary_profiles.sql, supabase/055_employee_salary_rate_amount_upgrade.sql, supabase/056_employee_salary_profile_end_date.sql, and supabase/060_employee_salary_manual_names.sql.',
      readOnly: 'Only the owner can manage this page.',
    },
  }
  const l = L[lang] || L.en

  const [team, setTeam] = useState([])
  const [salaryProfiles, setSalaryProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [confirmActionKey, setConfirmActionKey] = useState('')
  const [page, setPage] = useState(1)
  const [form, setForm] = useState({
    profile_id: '',
    employee_name: '',
    joined_at: today,
    salary_amount: '',
    salary_unit: 'daily',
    pay_schedule: 'monthly',
    payment_method: 'cash',
    effective_from: today,
  })
  const [rateForms, setRateForms] = useState({})
  const [paymentForms, setPaymentForms] = useState({})
  const [bonusForm, setBonusForm] = useState({
    salary_profile_id: '',
    bonus_date: today,
    amount: '',
    payment_method: 'cash',
    note: '',
  })

  async function loadData() {
    setLoading(true)
    setError('')
    const [teamRes, profileRes, rateRes, paymentRes, bonusRes] = await Promise.all([
      supabase.from('profiles').select('id, full_name, email, role, status, created_at').order('full_name'),
      supabase.from('employee_salary_profiles').select('*').order('employee_name'),
      supabase.from('employee_salary_rates').select('*').order('effective_from', { ascending: false }),
      supabase.from('employee_salary_payments').select('*').order('paid_date', { ascending: false }),
      supabase.from('employee_salary_bonuses').select('*').order('bonus_date', { ascending: false }),
    ])
    if (profileRes.error || rateRes.error || paymentRes.error || bonusRes.error) {
      const err = profileRes.error || rateRes.error || paymentRes.error || bonusRes.error
      setError(isMissingSalaryMigration(err) ? l.migration : err.message)
      setSalaryProfiles([])
    } else {
      const teamRows = teamRes.data || []
      setTeam(teamRows)
      setSalaryProfiles(composeSalaryProfiles(profileRes.data || [], rateRes.data || [], paymentRes.data || [], bonusRes.data || [], teamRows))
    }
    if (!teamRes.error) setTeam(teamRes.data || [])
    setLoading(false)
  }

  useEffect(() => { loadData() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const usedProfileIds = useMemo(() => new Set(salaryProfiles.map(item => item.profile_id).filter(Boolean)), [salaryProfiles])
  const availableEmployees = team.filter(member => !usedProfileIds.has(member.id) && member.status !== 'disabled')
  const sortedSalaryProfiles = useMemo(() => (
    [...salaryProfiles].sort((a, b) => {
      if (Boolean(a.is_active) !== Boolean(b.is_active)) return a.is_active ? -1 : 1
      const dueDiff = getSalaryDue(b, today) - getSalaryDue(a, today)
      if (dueDiff !== 0) return dueDiff
      return String(a.employee_name || '').localeCompare(String(b.employee_name || ''))
    })
  ), [salaryProfiles, today])
  const totalDue = useMemo(() => getTotalSalaryDue(salaryProfiles, today), [salaryProfiles, today])
  const pageCount = Math.max(1, Math.ceil(sortedSalaryProfiles.length / PAGE_SIZE))
  const pagedSalaryProfiles = useMemo(() => (
    sortedSalaryProfiles.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  ), [sortedSalaryProfiles, page])
  const activeSalaryProfiles = useMemo(() => (
    sortedSalaryProfiles.filter(item => item.is_active !== false)
  ), [sortedSalaryProfiles])

  useEffect(() => {
    setPage(current => Math.min(current, pageCount))
  }, [pageCount])

  async function createSalaryProfile(event) {
    event.preventDefault()
    if (!canManage) return
    setError('')
    setMessage('')
    const employee = team.find(item => item.id === form.profile_id)
    const employeeName = (form.employee_name || employee?.full_name || employee?.email || '').trim()
    const amount = normalizeExpenseAmount(form.salary_amount)
    if (!employeeName || !form.joined_at || !form.effective_from || amount <= 0) return
    setSaving('create')
    const { data: salaryProfile, error: profileError } = await supabase
      .from('employee_salary_profiles')
      .insert({
        profile_id: employee?.id || null,
        employee_name: employeeName,
        joined_at: form.joined_at,
        pay_schedule: form.pay_schedule,
        payment_method: form.payment_method,
        created_by: profile?.id || null,
      })
      .select()
      .single()
    if (profileError) {
      setError(profileError.message)
      setSaving('')
      return
    }
    const { error: rateError } = await supabase
      .from('employee_salary_rates')
      .insert(buildSalaryRatePayload({
        salaryProfileId: salaryProfile.id,
        effectiveFrom: form.effective_from,
        amount,
        salaryUnit: form.salary_unit,
        createdBy: profile?.id || null,
      }))
    setSaving('')
    if (rateError) {
      await supabase.from('employee_salary_profiles').delete().eq('id', salaryProfile.id)
      setError(rateError.message)
      return
    }
    setMessage(l.save)
    setForm(current => ({ ...current, profile_id: '', employee_name: '', salary_amount: '' }))
    await loadData()
  }

  async function updateSalaryProfile(salaryProfile, patch) {
    if (!canManage) return
    setSaving(salaryProfile.id)
    const { error: updateError } = await supabase
      .from('employee_salary_profiles')
      .update(patch)
      .eq('id', salaryProfile.id)
    setSaving('')
    if (updateError) {
      setError(updateError.message)
      return
    }
    await loadData()
  }

  async function addRate(salaryProfile) {
    const rateForm = rateForms[salaryProfile.id] || {}
    const amount = normalizeExpenseAmount(rateForm.salary_amount)
    const effectiveFrom = rateForm.effective_from || today
    if (!canManage || amount <= 0) return
    setSaving(`rate-${salaryProfile.id}`)
    const { error: rateError } = await supabase.from('employee_salary_rates').insert(buildSalaryRatePayload({
      salaryProfileId: salaryProfile.id,
      effectiveFrom,
      amount,
      salaryUnit: rateForm.salary_unit || 'daily',
      note: rateForm.note || '',
      createdBy: profile?.id || null,
    }))
    setSaving('')
    if (rateError) {
      setError(rateError.message)
      return
    }
    setRateForms(current => ({ ...current, [salaryProfile.id]: { effective_from: today, salary_amount: '', salary_unit: 'daily', note: '' } }))
    await loadData()
  }

  async function addPayment(salaryProfile) {
    const paymentForm = paymentForms[salaryProfile.id] || {}
    const paidDate = paymentForm.paid_date || today
    const due = getSalaryDue(salaryProfile, paidDate)
    const amount = normalizeExpenseAmount(paymentForm.amount || due)
    if (!canManage || amount <= 0) return
    setSaving(`payment-${salaryProfile.id}`)
    const { error: paymentError } = await supabase.from('employee_salary_payments').insert({
      salary_profile_id: salaryProfile.id,
      paid_date: paidDate,
      period_from: salaryProfile.joined_at,
      period_to: paidDate,
      amount,
      payment_method: paymentForm.payment_method || salaryProfile.payment_method || 'cash',
      note: paymentForm.note || '',
      created_by: profile?.id || null,
      created_by_name: profile?.full_name || profile?.email || state.user?.name || '',
    })
    setSaving('')
    if (paymentError) {
      setError(paymentError.message)
      return
    }
    setPaymentForms(current => ({ ...current, [salaryProfile.id]: { paid_date: today, amount: '', payment_method: salaryProfile.payment_method || 'cash', note: '' } }))
    await loadData()
  }

  async function addBonus() {
    const salaryProfile = salaryProfiles.find(item => item.id === bonusForm.salary_profile_id)
    const amount = normalizeExpenseAmount(bonusForm.amount)
    if (!canManage || amount <= 0) return
    if (!salaryProfile) return
    setSaving('bonus-create')
    const { error: bonusError } = await supabase.from('employee_salary_bonuses').insert({
      salary_profile_id: salaryProfile.id,
      bonus_date: bonusForm.bonus_date || today,
      amount,
      payment_method: bonusForm.payment_method || salaryProfile.payment_method || 'cash',
      note: bonusForm.note || '',
      created_by: profile?.id || null,
      created_by_name: profile?.full_name || profile?.email || state.user?.name || '',
    })
    setSaving('')
    if (bonusError) {
      setError(bonusError.message)
      return
    }
    setBonusForm({
      salary_profile_id: '',
      bonus_date: today,
      amount: '',
      payment_method: 'cash',
      note: '',
    })
    await loadData()
  }

  async function deleteRate(rate) {
    if (!canManage || !rate?.id) return
    const key = `rate-delete-${rate.id}`
    if (confirmActionKey !== key) {
      setConfirmActionKey(key)
      return
    }
    setSaving(key)
    const { error: deleteError } = await supabase.from('employee_salary_rates').delete().eq('id', rate.id)
    setSaving('')
    setConfirmActionKey('')
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    await loadData()
  }

  async function deletePayment(payment) {
    if (!canManage || !payment?.id) return
    const key = `payment-delete-${payment.id}`
    if (confirmActionKey !== key) {
      setConfirmActionKey(key)
      return
    }
    setSaving(key)
    const { error: deleteError } = await supabase.from('employee_salary_payments').delete().eq('id', payment.id)
    setSaving('')
    setConfirmActionKey('')
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    await loadData()
  }

  async function toggleSalaryProfileActive(salaryProfile) {
    if (!canManage || !salaryProfile?.id) return
    const key = `profile-toggle-${salaryProfile.id}`
    if (confirmActionKey !== key) {
      setConfirmActionKey(key)
      return
    }
    setSaving(key)
    const nextActive = !salaryProfile.is_active
    const patch = nextActive
      ? { is_active: true, ended_at: null }
      : { is_active: false, ended_at: today }
    const { error: updateError } = await supabase
      .from('employee_salary_profiles')
      .update(patch)
      .eq('id', salaryProfile.id)
    setSaving('')
    setConfirmActionKey('')
    if (updateError) {
      setError(updateError.message)
      return
    }
    await loadData()
  }

  async function removeSalaryProfile(salaryProfile) {
    if (!canManage || !salaryProfile?.id) return
    const key = `profile-remove-${salaryProfile.id}`
    if (confirmActionKey !== key) {
      setConfirmActionKey(key)
      return
    }
    setSaving(key)
    const { error: deleteError } = await supabase
      .from('employee_salary_profiles')
      .delete()
      .eq('id', salaryProfile.id)
    setSaving('')
    setConfirmActionKey('')
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    await loadData()
  }

  return (
    <AppShell title={l.title}>
      <div className="h-full overflow-y-auto bg-[#FAF7F0]">
        <div className="mx-auto max-w-[1200px] px-4 py-5 sm:px-5 sm:py-6">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <button onClick={() => navigate('/admin/expenses')} className="mb-3 inline-flex items-center gap-2 text-xs font-black text-[#6B7280] hover:text-[#ff5a00]">
                <ArrowLeft size={14} />{l.back}
              </button>
              <h1 className="text-2xl font-black text-[#1F2937]">{l.title}</h1>
              <p className="mt-1 text-sm font-medium text-[#6B7280]">{l.sub}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2">
                <p className="text-[11px] font-black uppercase tracking-wide text-[#ff5a00]">{l.totalDue}</p>
                <p className="text-sm font-black text-[#1F2937]">{formatCurrency(totalDue)}</p>
              </div>
              <button onClick={loadData} className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-xs font-black text-[#6B7280] shadow-sm">
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />Refresh
              </button>
            </div>
          </div>

          {!canManage && <div className="mb-5 rounded-xl border border-orange-100 bg-orange-50 px-4 py-3 text-sm font-bold text-[#ff5a00]">{l.readOnly}</div>}
          {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}
          {message && !error && <div className="mb-5 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-bold text-green-700">{message}</div>}

          <section className="mb-5 rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
            <h2 className="mb-4 text-base font-black text-[#1F2937]">{l.add}</h2>
            <form onSubmit={createSalaryProfile} className="grid gap-3 lg:grid-cols-[1.3fr_1.2fr_repeat(6,1fr)_120px] lg:items-end">
              <Field label={l.employeeName}>
                <input
                  type="text"
                  value={form.employee_name}
                  onChange={event => setForm(current => ({ ...current, employee_name: event.target.value }))}
                  className={FIELD}
                  disabled={!canManage}
                />
              </Field>
              <Field label={`${l.staffAccount} (${l.optional})`}>
                <select
                  value={form.profile_id}
                  onChange={event => {
                    const selectedEmployee = team.find(member => member.id === event.target.value)
                    setForm(current => ({
                      ...current,
                      profile_id: event.target.value,
                      employee_name: current.employee_name || selectedEmployee?.full_name || selectedEmployee?.email || '',
                    }))
                  }}
                  className={FIELD}
                  disabled={!canManage}
                >
                  <option value="">—</option>
                  {availableEmployees.map(member => <option key={member.id} value={member.id}>{member.full_name || member.email}</option>)}
                </select>
              </Field>
              <Field label={l.joined}><input type="date" value={form.joined_at} onChange={event => setForm(current => ({ ...current, joined_at: event.target.value }))} className={FIELD} disabled={!canManage} /></Field>
              <Field label={l.salaryAmount}><input type="text" inputMode="numeric" value={formatAmountInput(form.salary_amount)} onChange={event => setForm(current => ({ ...current, salary_amount: parseAmountInput(event.target.value) }))} className={FIELD} disabled={!canManage} /></Field>
              <Field label={l.salaryUnit}>
                <select value={form.salary_unit} onChange={event => setForm(current => ({ ...current, salary_unit: event.target.value }))} className={FIELD} disabled={!canManage}>
                  {SALARY_RATE_UNITS.map(item => <option key={item} value={item}>{salaryRateUnitLabel(item, lang)}</option>)}
                </select>
              </Field>
              <Field label={l.schedule}>
                <select value={form.pay_schedule} onChange={event => setForm(current => ({ ...current, pay_schedule: event.target.value }))} className={FIELD} disabled={!canManage}>
                  {SALARY_PAY_SCHEDULES.map(item => <option key={item} value={item}>{payScheduleLabel(item, lang)}</option>)}
                </select>
              </Field>
              <Field label={l.method}>
                <select value={form.payment_method} onChange={event => setForm(current => ({ ...current, payment_method: event.target.value }))} className={FIELD} disabled={!canManage}>
                  {EXPENSE_PAYMENT_METHODS.map(item => <option key={item} value={item}>{expensePaymentMethodLabel(item, lang)}</option>)}
                </select>
              </Field>
              <Field label={l.effectiveFrom}><input type="date" value={form.effective_from} onChange={event => setForm(current => ({ ...current, effective_from: event.target.value }))} className={FIELD} disabled={!canManage} /></Field>
              <button disabled={!canManage || saving === 'create'} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#ff5a00] px-4 text-sm font-black text-white disabled:bg-gray-200">
                {saving === 'create' ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}{l.save}
              </button>
            </form>
          </section>

          <section className="mb-5 rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
            <h2 className="mb-4 text-base font-black text-[#1F2937]">{l.bonus}</h2>
            <div className="grid gap-3 lg:grid-cols-[1.5fr_1fr_1fr_140px] lg:items-end">
              <Field label={l.employee}>
                <select
                  value={bonusForm.salary_profile_id}
                  onChange={event => {
                    const selectedProfile = salaryProfiles.find(item => item.id === event.target.value)
                    setBonusForm(current => ({
                      ...current,
                      salary_profile_id: event.target.value,
                      payment_method: selectedProfile?.payment_method || 'cash',
                    }))
                  }}
                  className={FIELD}
                  disabled={!canManage}
                >
                  <option value="">—</option>
                  {activeSalaryProfiles.map(item => (
                    <option key={item.id} value={item.id}>{item.employee_name || item.profile?.full_name || item.profile?.email}</option>
                  ))}
                </select>
              </Field>
              <Field label={l.bonusDate}>
                <input
                  type="date"
                  value={bonusForm.bonus_date}
                  onChange={event => setBonusForm(current => ({ ...current, bonus_date: event.target.value }))}
                  className={FIELD}
                  disabled={!canManage}
                />
              </Field>
              <Field label={l.amount}>
                <input
                  type="text"
                  inputMode="numeric"
                  value={formatAmountInput(bonusForm.amount)}
                  onChange={event => setBonusForm(current => ({ ...current, amount: parseAmountInput(event.target.value) }))}
                  className={FIELD}
                  disabled={!canManage}
                />
              </Field>
              <button
                type="button"
                onClick={addBonus}
                disabled={!canManage || !bonusForm.salary_profile_id || saving === 'bonus-create'}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#1F2937] px-4 text-sm font-black text-white disabled:bg-gray-200"
              >
                {saving === 'bonus-create' ? <Loader2 size={16} className="animate-spin" /> : <Plus size={15} />}
                {l.addBonus}
              </button>
            </div>
          </section>

          {loading ? (
            <div className="flex justify-center py-20"><Loader2 size={30} className="animate-spin text-gray-300" /></div>
          ) : salaryProfiles.length === 0 ? (
            <div className="rounded-2xl border border-[#E5E7EB] bg-white px-4 py-16 text-center text-sm font-bold text-[#9CA3AF]">{l.empty}</div>
          ) : (
            <div className="space-y-4">
              {pagedSalaryProfiles.map(item => {
                const isInactive = item.is_active === false
                const asOfDate = getSalaryActiveUntil(item, today)
                const due = getSalaryDue(item, today)
                const dailyAmount = getDailySalaryAmount(item, asOfDate)
                const rateForm = rateForms[item.id] || { effective_from: today, salary_amount: '', salary_unit: 'daily', note: '' }
                const paymentForm = paymentForms[item.id] || { paid_date: today, amount: due || '', payment_method: item.payment_method || 'cash', note: '' }
                return (
                  <section key={item.id} className={`rounded-2xl border p-4 shadow-sm ${isInactive ? 'border-[#E5E7EB] bg-[#F3F4F6]' : 'border-[#E5E7EB] bg-white'}`}>
                    <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_180px_220px] lg:items-start">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className={`text-lg font-black ${isInactive ? 'text-[#6B7280]' : 'text-[#1F2937]'}`}>{item.employee_name || item.profile?.full_name || item.profile?.email}</h2>
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-black ${item.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-[#6B7280]'}`}>
                            {item.is_active ? l.active : l.inactive}
                          </span>
                        </div>
                        <p className={`mt-1 flex flex-wrap items-center gap-2 text-xs font-bold ${isInactive ? 'text-[#9CA3AF]' : 'text-[#6B7280]'}`}>
                          <span className="inline-flex items-center gap-1"><CalendarDays size={13} />{item.joined_at}</span>
                          <span>{payScheduleLabel(item.pay_schedule, lang)}</span>
                          <span>{expensePaymentMethodLabel(item.payment_method, lang)}</span>
                          {!item.is_active && item.ended_at && <span>{l.to}: {item.ended_at}</span>}
                        </p>
                      </div>
                      <Metric label={l.accruedToday} value={formatCurrency(dailyAmount)} />
                      <Metric label={l.due} value={formatCurrency(due)} hot />
                    </div>

                    <div className="mb-4 flex flex-wrap items-center justify-end gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => removeSalaryProfile(item)}
                          disabled={!canManage || saving === `profile-remove-${item.id}`}
                          className="inline-flex h-10 items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 text-xs font-black text-red-600"
                        >
                          {saving === `profile-remove-${item.id}` ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                          {confirmActionKey === `profile-remove-${item.id}` ? l.confirmDelete : l.remove}
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleSalaryProfileActive(item)}
                          disabled={!canManage || saving === `profile-toggle-${item.id}`}
                          className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-xs font-black ${
                            item.is_active ? 'border-red-200 bg-red-50 text-red-600' : 'border-[#E5E7EB] bg-white text-[#1F2937]'
                          }`}
                        >
                          {saving === `profile-toggle-${item.id}` ? <Loader2 size={14} className="animate-spin" /> : <Power size={14} />}
                          {confirmActionKey === `profile-toggle-${item.id}` ? l.confirmDelete : item.is_active ? l.deactivate : l.reactivate}
                        </button>
                      </div>
                    </div>

                    <div className="mb-4 grid gap-3 md:grid-cols-3">
                      <Field label={l.schedule}>
                        <select value={item.pay_schedule} onChange={event => updateSalaryProfile(item, { pay_schedule: event.target.value })} className={FIELD} disabled={!canManage || isInactive || saving === item.id}>
                          {SALARY_PAY_SCHEDULES.map(schedule => <option key={schedule} value={schedule}>{payScheduleLabel(schedule, lang)}</option>)}
                        </select>
                      </Field>
                      <Field label={l.method}>
                        <select value={item.payment_method} onChange={event => updateSalaryProfile(item, { payment_method: event.target.value })} className={FIELD} disabled={!canManage || isInactive || saving === item.id}>
                          {EXPENSE_PAYMENT_METHODS.map(method => <option key={method} value={method}>{expensePaymentMethodLabel(method, lang)}</option>)}
                        </select>
                      </Field>
                      <Field label={l.joined}>
                        <input type="date" value={item.joined_at} onChange={event => updateSalaryProfile(item, { joined_at: event.target.value })} className={FIELD} disabled={!canManage || isInactive || saving === item.id} />
                      </Field>
                    </div>

                    <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
                      <div className="space-y-4">
                        <div className={`rounded-xl border p-3 ${isInactive ? 'border-[#E5E7EB] bg-[#F9FAFB]' : 'border-[#EEF0F3] bg-[#FBFCFD]'}`}>
                          <h3 className={`mb-3 text-sm font-black ${isInactive ? 'text-[#9CA3AF]' : 'text-[#1F2937]'}`}>{l.changeSalary}</h3>
                          <div className="grid gap-2 md:grid-cols-[1fr_1fr] xl:grid-cols-[1fr_1fr_150px_auto]">
                            <input type="date" value={rateForm.effective_from || today} onChange={event => setRateForms(current => ({ ...current, [item.id]: { ...rateForm, effective_from: event.target.value } }))} className={FIELD} disabled={!canManage || isInactive} />
                            <input type="text" inputMode="numeric" value={formatAmountInput(rateForm.salary_amount || '')} onChange={event => setRateForms(current => ({ ...current, [item.id]: { ...rateForm, salary_amount: parseAmountInput(event.target.value) } }))} placeholder={l.salaryAmount} className={FIELD} disabled={!canManage || isInactive} />
                            <select value={rateForm.salary_unit || 'daily'} onChange={event => setRateForms(current => ({ ...current, [item.id]: { ...rateForm, salary_unit: event.target.value } }))} className={FIELD} disabled={!canManage || isInactive}>
                              {SALARY_RATE_UNITS.map(unit => <option key={unit} value={unit}>{salaryRateUnitLabel(unit, lang)}</option>)}
                            </select>
                            <button type="button" onClick={() => addRate(item)} disabled={!canManage || isInactive || saving === `rate-${item.id}`} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#1F2937] px-4 text-sm font-black text-white disabled:bg-gray-200">
                              <Save size={15} />{l.save}
                            </button>
                          </div>
                          <div className="mt-3 space-y-1">
                            {item.rates.slice(0, 4).map(rate => (
                              <div key={rate.id} className={`flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs font-bold ${isInactive ? 'bg-[#F3F4F6] text-[#9CA3AF]' : 'bg-white text-[#6B7280]'}`}>
                                <span>{rate.effective_from}</span>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span>{formatCurrency(rate.amount ?? rate.daily_amount)} · {salaryRateUnitLabel(rate.rate_unit || 'daily', lang)} · {formatCurrency(convertSalaryAmountToDaily(rate.amount ?? rate.daily_amount, rate.rate_unit))}/day</span>
                                  <button
                                    type="button"
                                    onClick={() => deleteRate(rate)}
                                    disabled={!canManage || isInactive || saving === `rate-delete-${rate.id}`}
                                    className={`inline-flex h-8 items-center justify-center rounded-lg border px-2 text-[11px] font-black ${
                                      confirmActionKey === `rate-delete-${rate.id}` ? 'border-red-200 bg-red-50 text-red-600' : 'border-[#E5E7EB] text-[#6B7280]'
                                    }`}
                                  >
                                    {saving === `rate-delete-${rate.id}` ? <Loader2 size={12} className="animate-spin" /> : <><Trash2 size={12} className="mr-1" />{confirmActionKey === `rate-delete-${rate.id}` ? l.confirmDelete : l.delete}</>}
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                      </div>

                      <div className={`rounded-xl border p-3 ${isInactive ? 'border-[#E5E7EB] bg-[#F9FAFB]' : 'border-[#EEF0F3] bg-[#FBFCFD]'}`}>
                        <h3 className={`mb-3 text-sm font-black ${isInactive ? 'text-[#9CA3AF]' : 'text-[#1F2937]'}`}>{l.recordPayment}</h3>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <Field label={l.paidDate}>
                            <input type="date" value={paymentForm.paid_date || today} onChange={event => setPaymentForms(current => ({ ...current, [item.id]: { ...paymentForm, paid_date: event.target.value } }))} className={FIELD} disabled={!canManage || isInactive} />
                          </Field>
                          <Field label={l.amount}>
                            <input type="text" inputMode="numeric" value={formatAmountInput(paymentForm.amount || '')} onChange={event => setPaymentForms(current => ({ ...current, [item.id]: { ...paymentForm, amount: parseAmountInput(event.target.value) } }))} placeholder={l.amount} className={FIELD} disabled={!canManage || isInactive} />
                          </Field>
                        </div>
                        <button type="button" onClick={() => addPayment(item)} disabled={!canManage || isInactive || saving === `payment-${item.id}`} className="mt-2 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#ff5a00] px-4 text-sm font-black text-white disabled:bg-gray-200">
                          <WalletCards size={15} />{l.recordPayment}
                        </button>
                        <div className="mt-3 space-y-1">
                          {item.payments.slice(0, 4).map(payment => (
                            <div key={payment.id} className={`flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs font-bold ${isInactive ? 'bg-[#F3F4F6] text-[#9CA3AF]' : 'bg-white text-[#6B7280]'}`}>
                              <span>{payment.paid_date} · {payment.period_from} - {payment.period_to}</span>
                              <div className="flex items-center gap-2">
                                <span>{formatCurrency(payment.amount)}</span>
                                <button
                                  type="button"
                                  onClick={() => deletePayment(payment)}
                                  disabled={!canManage || isInactive || saving === `payment-delete-${payment.id}`}
                                  className={`inline-flex h-8 items-center justify-center rounded-lg border px-2 text-[11px] font-black ${
                                    confirmActionKey === `payment-delete-${payment.id}` ? 'border-red-200 bg-red-50 text-red-600' : 'border-[#E5E7EB] text-[#6B7280]'
                                  }`}
                                >
                                  {saving === `payment-delete-${payment.id}` ? <Loader2 size={12} className="animate-spin" /> : <><Trash2 size={12} className="mr-1" />{confirmActionKey === `payment-delete-${payment.id}` ? l.confirmDelete : l.delete}</>}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </section>
                )
              })}

              {pageCount > 1 && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 shadow-sm">
                  <p className="text-sm font-bold text-[#6B7280]">{l.page} {page} / {pageCount}</p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPage(current => Math.max(1, current - 1))}
                      disabled={page === 1}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#E5E7EB] bg-white text-[#6B7280] disabled:opacity-40"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPage(current => Math.min(pageCount, current + 1))}
                      disabled={page === pageCount}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#E5E7EB] bg-white text-[#6B7280] disabled:opacity-40"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-[#6B7280]">{label}</span>
      {children}
    </label>
  )
}

function Metric({ label, value, hot = false }) {
  return (
    <div className={`rounded-xl px-3 py-3 ${hot ? 'bg-orange-50 text-[#ff5a00]' : 'bg-gray-50 text-[#1F2937]'}`}>
      <p className="text-[11px] font-black uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-1 text-lg font-black">{value}</p>
    </div>
  )
}
