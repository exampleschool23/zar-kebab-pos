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
  SALARY_RATE_UNITS,
  buildSalaryBonusExpenseRows,
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
      sub: 'Ishga kirgan sana, maosh va to‘lanishi kerak summa',
      back: 'Xarajatlarga qaytish',
      add: 'Xodim maoshi qo‘shish',
      employee: 'Xodim',
      employeeName: 'Xodim ismi',
      joined: 'Ishga kirgan sana',
      salaryAmount: 'Maosh summasi',
      salaryUnit: 'Maosh turi',
      method: 'To‘lov turi',
      save: 'Saqlash',
      delete: 'O‘chirish',
      remove: 'Butunlay o‘chirish',
      confirmDelete: 'Tasdiqlash',
      changeSalary: 'Maoshni o‘zgartirish',
      selectEmployee: 'Xodimni tanlang',
      recordPayment: 'To‘lovni yozish',
      paymentBonus: 'To‘lov / bonus yozish',
      paymentEntry: 'To‘lov',
      bonusEntry: 'Bonus',
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
      paymentHistory: 'To‘lovlar / bonuslar',
      paymentLabel: 'To‘lov',
      bonusLabel: 'Bonus',
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
      sub: 'Дата выхода, зарплата и сумма к выплате',
      back: 'Назад к расходам',
      add: 'Добавить зарплату сотрудника',
      employee: 'Сотрудник',
      employeeName: 'Имя сотрудника',
      joined: 'Дата выхода',
      salaryAmount: 'Сумма зарплаты',
      salaryUnit: 'Тип зарплаты',
      method: 'Способ оплаты',
      save: 'Сохранить',
      delete: 'Удалить',
      remove: 'Удалить полностью',
      confirmDelete: 'Подтвердить',
      changeSalary: 'Изменить зарплату',
      selectEmployee: 'Выберите сотрудника',
      recordPayment: 'Записать выплату',
      paymentBonus: 'Записать выплату / бонус',
      paymentEntry: 'Выплата',
      bonusEntry: 'Бонус',
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
      paymentHistory: 'Выплаты / бонусы',
      paymentLabel: 'Выплата',
      bonusLabel: 'Бонус',
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
      sub: 'Joining date, salary, and amount due',
      back: 'Back to expenses',
      add: 'Add employee salary',
      employee: 'Employee',
      employeeName: 'Employee name',
      joined: 'Joining date',
      salaryAmount: 'Salary amount',
      salaryUnit: 'Salary type',
      method: 'Payment method',
      save: 'Save',
      delete: 'Delete',
      remove: 'Remove completely',
      confirmDelete: 'Confirm',
      changeSalary: 'Change salary',
      selectEmployee: 'Select employee',
      recordPayment: 'Record payment',
      paymentBonus: 'Record payment / bonus',
      paymentEntry: 'Payment',
      bonusEntry: 'Bonus',
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
      paymentHistory: 'Payments / bonuses',
      paymentLabel: 'Payment',
      bonusLabel: 'Bonus',
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
    employee_name: '',
    joined_at: today,
    salary_amount: '',
    salary_unit: 'daily',
    payment_method: 'cash',
  })
  const [changeForm, setChangeForm] = useState({
    salary_profile_id: '',
    effective_from: today,
    salary_amount: '',
    salary_unit: 'daily',
    note: '',
  })
  const [transactionForm, setTransactionForm] = useState({
    salary_profile_id: '',
    entry_type: 'payment',
    paid_date: today,
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
    const employeeName = String(form.employee_name || '').trim()
    const amount = normalizeExpenseAmount(form.salary_amount)
    if (!employeeName || !form.joined_at || amount <= 0) return
    setSaving('create')
    const { data: salaryProfile, error: profileError } = await supabase
      .from('employee_salary_profiles')
      .insert({
        profile_id: null,
        employee_name: employeeName,
        joined_at: form.joined_at,
        pay_schedule: 'monthly',
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
        effectiveFrom: form.joined_at,
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
    setForm(current => ({ ...current, employee_name: '', salary_amount: '' }))
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

  async function addRate() {
    const selectedProfile = salaryProfiles.find(item => item.id === changeForm.salary_profile_id)
    if (!selectedProfile) return
    const amount = normalizeExpenseAmount(changeForm.salary_amount)
    const effectiveFrom = changeForm.effective_from || today
    if (!canManage || amount <= 0) return
    setSaving('rate-create')
    const { error: rateError } = await supabase.from('employee_salary_rates').insert(buildSalaryRatePayload({
      salaryProfileId: selectedProfile.id,
      effectiveFrom,
      amount,
      salaryUnit: changeForm.salary_unit || 'daily',
      note: changeForm.note || '',
      createdBy: profile?.id || null,
    }))
    setSaving('')
    if (rateError) {
      setError(rateError.message)
      return
    }
    setChangeForm({
      salary_profile_id: '',
      effective_from: today,
      salary_amount: '',
      salary_unit: 'daily',
      note: '',
    })
    await loadData()
  }

  async function addTransaction() {
    const salaryProfile = salaryProfiles.find(item => item.id === transactionForm.salary_profile_id)
    if (!salaryProfile) return
    const paidDate = transactionForm.paid_date || today
    const due = getSalaryDue(salaryProfile, paidDate)
    const amount = normalizeExpenseAmount(transactionForm.amount || due)
    if (!canManage || amount <= 0) return
    const isBonus = transactionForm.entry_type === 'bonus'
    setSaving(isBonus ? 'bonus-create' : 'payment-create')
    const { error: writeError } = isBonus
      ? await supabase.from('employee_salary_bonuses').insert({
          salary_profile_id: salaryProfile.id,
          bonus_date: paidDate,
          amount,
          payment_method: transactionForm.payment_method || salaryProfile.payment_method || 'cash',
          note: transactionForm.note || '',
          created_by: profile?.id || null,
          created_by_name: profile?.full_name || profile?.email || state.user?.name || '',
        })
      : await supabase.from('employee_salary_payments').insert({
          salary_profile_id: salaryProfile.id,
          paid_date: paidDate,
          period_from: salaryProfile.joined_at,
          period_to: paidDate,
          amount,
          payment_method: transactionForm.payment_method || salaryProfile.payment_method || 'cash',
          note: transactionForm.note || '',
          created_by: profile?.id || null,
          created_by_name: profile?.full_name || profile?.email || state.user?.name || '',
        })
    setSaving('')
    if (writeError) {
      setError(writeError.message)
      return
    }
    setTransactionForm({
      salary_profile_id: '',
      entry_type: 'payment',
      paid_date: today,
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

  async function deleteBonus(bonus) {
    if (!canManage || !bonus?.id) return
    const key = `bonus-delete-${bonus.id}`
    if (confirmActionKey !== key) {
      setConfirmActionKey(key)
      return
    }
    setSaving(key)
    const { error: deleteError } = await supabase.from('employee_salary_bonuses').delete().eq('id', bonus.id)
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
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(360px,0.9fr)]">
              <div className="rounded-xl border border-[#EEF0F3] bg-[#FBFCFD] p-4">
                <div className="grid gap-5">
                  <div>
                    <h2 className="mb-4 text-base font-black text-[#1F2937]">{l.add}</h2>
                    <form onSubmit={createSalaryProfile} className="grid gap-3 lg:grid-cols-[minmax(190px,1.3fr)_150px_minmax(140px,1fr)_130px_140px_110px] lg:items-end">
                      <Field label={l.employeeName}>
                        <input
                          type="text"
                          value={form.employee_name}
                          onChange={event => setForm(current => ({ ...current, employee_name: event.target.value }))}
                          className={FIELD}
                          disabled={!canManage}
                        />
                      </Field>
                      <Field label={l.joined}><input type="date" value={form.joined_at} onChange={event => setForm(current => ({ ...current, joined_at: event.target.value }))} className={FIELD} disabled={!canManage} /></Field>
                      <Field label={l.salaryAmount}><input type="text" inputMode="numeric" value={formatAmountInput(form.salary_amount)} onChange={event => setForm(current => ({ ...current, salary_amount: parseAmountInput(event.target.value) }))} className={FIELD} disabled={!canManage} /></Field>
                      <Field label={l.salaryUnit}>
                        <select value={form.salary_unit} onChange={event => setForm(current => ({ ...current, salary_unit: event.target.value }))} className={FIELD} disabled={!canManage}>
                          {SALARY_RATE_UNITS.map(item => <option key={item} value={item}>{salaryRateUnitLabel(item, lang)}</option>)}
                        </select>
                      </Field>
                      <Field label={l.method}>
                        <select value={form.payment_method} onChange={event => setForm(current => ({ ...current, payment_method: event.target.value }))} className={FIELD} disabled={!canManage}>
                          {EXPENSE_PAYMENT_METHODS.map(item => <option key={item} value={item}>{expensePaymentMethodLabel(item, lang)}</option>)}
                        </select>
                      </Field>
                      <button disabled={!canManage || saving === 'create'} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#ff5a00] px-4 text-sm font-black text-white disabled:bg-gray-200">
                        {saving === 'create' ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}{l.save}
                      </button>
                    </form>
                  </div>

                  <div className="border-t border-[#E5E7EB] pt-5">
                    <h2 className="mb-4 text-base font-black text-[#1F2937]">{l.changeSalary}</h2>
                    <div className="grid gap-3 lg:grid-cols-[minmax(190px,1.4fr)_150px_minmax(140px,1fr)_130px_110px] lg:items-end">
                      <Field label={l.selectEmployee}>
                        <select
                          value={changeForm.salary_profile_id}
                          onChange={event => {
                            const selectedProfile = salaryProfiles.find(item => item.id === event.target.value)
                            setChangeForm(current => ({
                              ...current,
                              salary_profile_id: event.target.value,
                              effective_from: selectedProfile?.joined_at || current.effective_from,
                              salary_unit: selectedProfile?.rates?.[0]?.rate_unit || current.salary_unit,
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
                      <Field label={l.joined}>
                        <input
                          type="date"
                          value={changeForm.effective_from}
                          onChange={event => setChangeForm(current => ({ ...current, effective_from: event.target.value }))}
                          className={FIELD}
                          disabled={!canManage}
                        />
                      </Field>
                      <Field label={l.salaryAmount}>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={formatAmountInput(changeForm.salary_amount)}
                          onChange={event => setChangeForm(current => ({ ...current, salary_amount: parseAmountInput(event.target.value) }))}
                          className={FIELD}
                          disabled={!canManage}
                        />
                      </Field>
                      <Field label={l.salaryUnit}>
                        <select value={changeForm.salary_unit} onChange={event => setChangeForm(current => ({ ...current, salary_unit: event.target.value }))} className={FIELD} disabled={!canManage}>
                          {SALARY_RATE_UNITS.map(item => <option key={item} value={item}>{salaryRateUnitLabel(item, lang)}</option>)}
                        </select>
                      </Field>
                      <button type="button" onClick={() => addRate()} disabled={!canManage || !changeForm.salary_profile_id || saving === 'rate-create'} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#1F2937] px-4 text-sm font-black text-white disabled:bg-gray-200">
                        {saving === 'rate-create' ? <Loader2 size={16} className="animate-spin" /> : <Save size={15} />}{l.save}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-[#EEF0F3] bg-[#FBFCFD] p-4">
                <h2 className="mb-4 text-base font-black text-[#1F2937]">{l.paymentBonus}</h2>
                <div className="mb-3 grid grid-cols-2 gap-2">
                  {['payment', 'bonus'].map(entryType => {
                    const active = transactionForm.entry_type === entryType
                    return (
                      <button
                        key={entryType}
                        type="button"
                        onClick={() => setTransactionForm(current => ({ ...current, entry_type: entryType }))}
                        className={`flex h-11 items-center justify-center rounded-xl border text-sm font-black ${
                          active ? 'border-[#ff5a00] bg-orange-50 text-[#ff5a00]' : 'border-[#E5E7EB] bg-white text-[#6B7280]'
                        }`}
                      >
                        {entryType === 'bonus' ? l.bonusEntry : l.paymentEntry}
                      </button>
                    )
                  })}
                </div>
                <div className="grid gap-3">
                  <Field label={l.employee}>
                    <select
                      value={transactionForm.salary_profile_id}
                      onChange={event => {
                        const selectedProfile = salaryProfiles.find(item => item.id === event.target.value)
                        const nextPaidDate = transactionForm.paid_date || today
                        const due = selectedProfile && transactionForm.entry_type === 'payment'
                          ? getSalaryDue(selectedProfile, nextPaidDate)
                          : ''
                        setTransactionForm(current => ({
                          ...current,
                          salary_profile_id: event.target.value,
                          amount: due ? String(due) : current.amount,
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
                  <Field label={transactionForm.entry_type === 'bonus' ? l.bonusDate : l.paidDate}>
                    <input
                      type="date"
                      value={transactionForm.paid_date}
                      onChange={event => {
                        const nextPaidDate = event.target.value
                        const selectedProfile = salaryProfiles.find(item => item.id === transactionForm.salary_profile_id)
                        const due = selectedProfile && transactionForm.entry_type === 'payment'
                          ? getSalaryDue(selectedProfile, nextPaidDate)
                          : ''
                        setTransactionForm(current => ({
                          ...current,
                          paid_date: nextPaidDate,
                          amount: due ? String(due) : current.amount,
                        }))
                      }}
                      className={FIELD}
                      disabled={!canManage}
                    />
                  </Field>
                  <Field label={l.amount}>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatAmountInput(transactionForm.amount)}
                      onChange={event => setTransactionForm(current => ({ ...current, amount: parseAmountInput(event.target.value) }))}
                      className={FIELD}
                      disabled={!canManage}
                    />
                  </Field>
                  <button
                    type="button"
                    onClick={addTransaction}
                    disabled={!canManage || !transactionForm.salary_profile_id || (saving !== '' && (saving === 'payment-create' || saving === 'bonus-create'))}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#ff5a00] px-4 text-sm font-black text-white disabled:bg-gray-200"
                  >
                    {(saving === 'payment-create' || saving === 'bonus-create') ? <Loader2 size={16} className="animate-spin" /> : transactionForm.entry_type === 'bonus' ? <Plus size={15} /> : <WalletCards size={15} />}
                    {transactionForm.entry_type === 'bonus' ? l.addBonus : l.recordPayment}
                  </button>
                </div>
              </div>
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
                const transactionHistory = [
                  ...item.payments.map(payment => ({
                    id: payment.id,
                    entryType: 'payment',
                    date: payment.paid_date,
                    amount: payment.amount,
                    detail: `${payment.period_from} - ${payment.period_to}`,
                    row: payment,
                  })),
                  ...item.bonuses.map(bonus => ({
                    id: bonus.id,
                    entryType: 'bonus',
                    date: bonus.bonus_date,
                    amount: bonus.amount,
                    detail: bonus.note || expensePaymentMethodLabel(bonus.payment_method, lang),
                    row: bonus,
                  })),
                ].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
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

                    <div className="mb-4 grid gap-3 md:grid-cols-2">
                      <Field label={l.method}>
                        <select value={item.payment_method} onChange={event => updateSalaryProfile(item, { payment_method: event.target.value })} className={FIELD} disabled={!canManage || isInactive || saving === item.id}>
                          {EXPENSE_PAYMENT_METHODS.map(method => <option key={method} value={method}>{expensePaymentMethodLabel(method, lang)}</option>)}
                        </select>
                      </Field>
                      <Field label={l.joined}>
                        <input type="date" value={item.joined_at} onChange={event => updateSalaryProfile(item, { joined_at: event.target.value })} className={FIELD} disabled={!canManage || isInactive || saving === item.id} />
                      </Field>
                    </div>

                    <div className="grid gap-4">
                      <div className="space-y-4">
                        <div className={`rounded-xl border p-3 ${isInactive ? 'border-[#E5E7EB] bg-[#F9FAFB]' : 'border-[#EEF0F3] bg-[#FBFCFD]'}`}>
                          <h3 className={`mb-3 text-sm font-black ${isInactive ? 'text-[#9CA3AF]' : 'text-[#1F2937]'}`}>{l.history}</h3>
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
                        <div className={`rounded-xl border p-3 ${isInactive ? 'border-[#E5E7EB] bg-[#F9FAFB]' : 'border-[#EEF0F3] bg-[#FBFCFD]'}`}>
                          <h3 className={`mb-3 text-sm font-black ${isInactive ? 'text-[#9CA3AF]' : 'text-[#1F2937]'}`}>{l.paymentHistory}</h3>
                          <div className="mt-3 space-y-1">
                            {transactionHistory.slice(0, 6).map(entry => (
                              <div key={`${entry.entryType}-${entry.id}`} className={`flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs font-bold ${isInactive ? 'bg-[#F3F4F6] text-[#9CA3AF]' : 'bg-white text-[#6B7280]'}`}>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span>{entry.date}</span>
                                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-black ${entry.entryType === 'bonus' ? 'bg-blue-50 text-blue-700' : 'bg-orange-50 text-[#ff5a00]'}`}>
                                    {entry.entryType === 'bonus' ? l.bonusLabel : l.paymentLabel}
                                  </span>
                                  {entry.detail && <span>{entry.detail}</span>}
                                </div>
                                <div className="flex items-center gap-2">
                                  <span>{formatCurrency(entry.amount)}</span>
                                  <button
                                    type="button"
                                    onClick={() => (entry.entryType === 'bonus' ? deleteBonus(entry.row) : deletePayment(entry.row))}
                                    disabled={!canManage || isInactive || saving === `${entry.entryType}-delete-${entry.id}`}
                                    className={`inline-flex h-8 items-center justify-center rounded-lg border px-2 text-[11px] font-black ${
                                      confirmActionKey === `${entry.entryType}-delete-${entry.id}` ? 'border-red-200 bg-red-50 text-red-600' : 'border-[#E5E7EB] text-[#6B7280]'
                                    }`}
                                  >
                                    {saving === `${entry.entryType}-delete-${entry.id}` ? <Loader2 size={12} className="animate-spin" /> : <><Trash2 size={12} className="mr-1" />{confirmActionKey === `${entry.entryType}-delete-${entry.id}` ? l.confirmDelete : l.delete}</>}
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
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
