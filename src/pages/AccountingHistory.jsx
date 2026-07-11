import React, { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import AppShell from '../components/AppShell'
import { OperationalLoading } from '../components/OperationalState'
import { useApp } from '../store/AppContext'
import { supabase } from '../lib/supabase'
import { formatCurrency } from '../lib/formatCurrency'
import { formatLongDate } from '../lib/dateFormat'
import { getOrderRevenueTotal, isPaidOrder, matchesRange } from '../lib/analytics'
import {
  buildSalaryBonusExpenseRows,
  buildSalaryPaymentExpenseRows,
  expenseCategoryLabel,
  expensePaymentMethodLabel,
  normalizeExpenseEntryType,
  summarizeExpenses,
  summarizeIncomeEntries,
  todayExpenseDate,
} from '../lib/expenses'

const EXPENSE_COLUMNS = 'id, entry_type, expense_date, category, payment_method, amount, vendor, description, created_by_name, created_at'
const HISTORY_START_DATE = '2000-01-01'
const EXPENSE_TONES = [
  { row: 'border-l-orange-500 bg-orange-50/30', text: 'text-[#ff5a00]', badge: 'bg-orange-100 text-orange-700' },
  { row: 'border-l-teal-500 bg-teal-50/30', text: 'text-teal-700', badge: 'bg-teal-100 text-teal-700' },
  { row: 'border-l-purple-500 bg-purple-50/30', text: 'text-purple-700', badge: 'bg-purple-100 text-purple-700' },
  { row: 'border-l-red-500 bg-red-50/30', text: 'text-red-700', badge: 'bg-red-100 text-red-700' },
  { row: 'border-l-amber-500 bg-amber-50/30', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-700' },
  { row: 'border-l-cyan-500 bg-cyan-50/30', text: 'text-cyan-700', badge: 'bg-cyan-100 text-cyan-700' },
]

function expenseTone(row) {
  if (normalizeExpenseEntryType(row.entry_type) === 'income') {
    return { row: 'border-l-green-500 bg-green-50/30', text: 'text-green-700', badge: 'bg-green-100 text-green-700' }
  }
  if (row.is_salary_payment || row.is_salary_bonus || String(row.category || '').startsWith('salary_')) {
    return { row: 'border-l-blue-500 bg-blue-50/30', text: 'text-blue-700', badge: 'bg-blue-100 text-blue-700' }
  }
  const key = String(row.category || 'other')
  const hash = [...key].reduce((sum, character) => sum + character.charCodeAt(0), 0)
  return EXPENSE_TONES[hash % EXPENSE_TONES.length]
}

function composeSalaryProfiles(profiles, rates, payments, bonuses, absences, team) {
  const teamById = Object.fromEntries(team.map(member => [member.id, member]))
  return profiles.map(profile => ({
    ...profile,
    profile: teamById[profile.profile_id] || null,
    rates: rates.filter(row => row.salary_profile_id === profile.id),
    payments: payments.filter(row => row.salary_profile_id === profile.id),
    bonuses: bonuses.filter(row => row.salary_profile_id === profile.id),
    absences: absences.filter(row => row.salary_profile_id === profile.id),
  }))
}

export default function AccountingHistory() {
  const { state } = useApp()
  const navigate = useNavigate()
  const lang = state.lang || 'ru'
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [type, setType] = useState('all')

  const labels = {
    uz: { title: 'Barcha buxgalteriya', back: 'Buxgalteriyaga qaytish', search: 'Qidirish', all: 'Barchasi', expense: 'Xarajat', income: 'Daromad', date: 'Sana', category: 'Kategoriya', method: 'To‘lov turi', vendor: 'Yetkazuvchi / xodim', description: 'Izoh', author: 'Kiritgan', amount: 'Summa', totalExpenses: 'Jami xarajat', totalIncome: 'Jami boshqa daromad', cafeIncome: 'Kafe daromadi', investorIncome: 'Investor daromadi', empty: 'Yozuv topilmadi', loadFailed: 'Buxgalteriya tarixini yuklab bo‘lmadi', salaryPayment: 'Maosh to‘lovi', salaryBonus: 'Maosh bonusi' },
    ru: { title: 'Вся бухгалтерия', back: 'Назад к бухгалтерии', search: 'Поиск', all: 'Все', expense: 'Расход', income: 'Доход', date: 'Дата', category: 'Категория', method: 'Способ оплаты', vendor: 'Поставщик / сотрудник', description: 'Описание', author: 'Добавил', amount: 'Сумма', totalExpenses: 'Всего расходов', totalIncome: 'Всего внешних доходов', cafeIncome: 'Доход кафе', investorIncome: 'Доход инвестора', empty: 'Записей не найдено', loadFailed: 'Не удалось загрузить историю бухгалтерии', salaryPayment: 'Выплата зарплаты', salaryBonus: 'Бонус к зарплате' },
    en: { title: 'All accounting', back: 'Back to accounting', search: 'Search', all: 'All', expense: 'Expense', income: 'Income', date: 'Date', category: 'Category', method: 'Payment method', vendor: 'Vendor / employee', description: 'Description', author: 'Added by', amount: 'Amount', totalExpenses: 'Total expenses', totalIncome: 'Total other income', cafeIncome: 'Cafe income', investorIncome: 'Investor income', empty: 'No entries found', loadFailed: 'Could not load accounting history', salaryPayment: 'Salary payment', salaryBonus: 'Salary bonus' },
  }
  const l = labels[lang] || labels.en

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      setError('')
      const results = await Promise.all([
        supabase.from('expenses').select(EXPENSE_COLUMNS).order('expense_date', { ascending: false }).order('created_at', { ascending: false }),
        supabase.from('employee_salary_profiles').select('*'),
        supabase.from('employee_salary_rates').select('*'),
        supabase.from('employee_salary_payments').select('*'),
        supabase.from('employee_salary_bonuses').select('*'),
        supabase.from('employee_salary_absences').select('*'),
        supabase.from('profiles').select('id, full_name, email, role, status'),
      ])
      if (!active) return
      const firstError = results.find(result => result.error)?.error
      if (firstError) {
        setError(firstError.message || l.loadFailed)
        setRows([])
      } else {
        const [expenseResult, profileResult, rateResult, paymentResult, bonusResult, absenceResult, teamResult] = results
        const salaryProfiles = composeSalaryProfiles(profileResult.data || [], rateResult.data || [], paymentResult.data || [], bonusResult.data || [], absenceResult.data || [], teamResult.data || [])
        const salaryPayments = buildSalaryPaymentExpenseRows(salaryProfiles, HISTORY_START_DATE, todayExpenseDate())
          .map(row => ({ ...row, description: row.description || l.salaryPayment }))
        const salaryBonuses = buildSalaryBonusExpenseRows(salaryProfiles, HISTORY_START_DATE, todayExpenseDate())
        setRows([...(expenseResult.data || []), ...salaryPayments, ...salaryBonuses].sort((a, b) => b.expense_date.localeCompare(a.expense_date) || String(b.created_at || '').localeCompare(String(a.created_at || ''))))
      }
      setLoading(false)
    }
    load()
    return () => { active = false }
  }, [l.loadFailed, l.salaryPayment])

  const visibleRows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return rows.filter(row => {
      const entryType = normalizeExpenseEntryType(row.entry_type)
      if (type !== 'all' && entryType !== type) return false
      if (!needle) return true
      return [row.vendor, row.description, row.created_by_name, expenseCategoryLabel(row.category, lang), expensePaymentMethodLabel(row.payment_method, lang)]
        .some(value => String(value || '').toLowerCase().includes(needle))
    })
  }, [rows, query, type, lang])

  const expenseSummary = useMemo(() => summarizeExpenses(rows), [rows])
  const incomeSummary = useMemo(() => summarizeIncomeEntries(rows), [rows])
  const rowsByDate = useMemo(() => {
    const groups = []
    for (const row of visibleRows) {
      const date = row.expense_date || ''
      const current = groups[groups.length - 1]
      if (!current || current.date !== date) groups.push({ date, rows: [row] })
      else current.rows.push(row)
    }
    return groups.map(group => ({
      ...group,
      cafeIncome: state.orders
        .filter(order => isPaidOrder(order) && matchesRange(order, group.date, group.date))
        .reduce((sum, order) => sum + getOrderRevenueTotal(order), 0),
      investorIncome: rows
        .filter(row => row.expense_date === group.date && normalizeExpenseEntryType(row.entry_type) === 'income' && row.category === 'investor_support')
        .reduce((sum, row) => sum + Number(row.amount || 0), 0),
    }))
  }, [visibleRows, rows, state.orders])

  return (
    <AppShell title={l.title}>
      <div className="h-full overflow-y-auto bg-[#FAF7F0]">
        <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-5 sm:py-6">
          <button onClick={() => navigate('/admin/accounting')} className="mb-4 inline-flex items-center gap-2 text-xs font-black text-[#6B7280] hover:text-[#ff5a00]"><ArrowLeft size={15} />{l.back}</button>
          <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-2xl font-black text-[#1F2937]">{l.title}</h1>
              <p className="mt-1 text-sm font-bold text-[#9CA3AF]">{visibleRows.length} {l.all.toLowerCase()}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {['all', 'expense', 'income'].map(value => <button key={value} onClick={() => setType(value)} className={`rounded-xl border px-3 py-2 text-xs font-black ${type === value ? 'border-[#ff5a00] bg-[#ff5a00] text-white' : 'border-[#E5E7EB] bg-white text-[#6B7280]'}`}>{l[value]}</button>)}
              <label className="flex min-w-[240px] items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 py-2">
                <Search size={15} className="text-[#9CA3AF]" />
                <input value={query} onChange={event => setQuery(event.target.value)} placeholder={l.search} className="w-full bg-transparent text-sm font-semibold outline-none" />
              </label>
            </div>
          </div>
          <div className="mb-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm"><p className="text-xs font-black uppercase text-[#9CA3AF]">{l.totalExpenses}</p><p className="mt-1 text-2xl font-black text-[#ff5a00]">{formatCurrency(expenseSummary.total)}</p></div>
            <div className="rounded-2xl border border-green-100 bg-white p-4 shadow-sm"><p className="text-xs font-black uppercase text-[#9CA3AF]">{l.totalIncome}</p><p className="mt-1 text-2xl font-black text-green-600">{formatCurrency(incomeSummary.total)}</p></div>
          </div>
          {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}
          <section className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-sm">
            {loading ? <OperationalLoading title={l.title} description="" /> : visibleRows.length === 0 ? <div className="p-12 text-center text-sm font-bold text-[#9CA3AF]">{l.empty}</div> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] border-collapse text-left">
                  <thead className="bg-[#F9FAFB] text-[11px] font-black uppercase tracking-wide text-[#9CA3AF]"><tr>{[l.date, l.expense, l.category, l.amount, l.method, l.vendor, l.description, l.author].map(heading => <th key={heading} className="border-b border-[#E5E7EB] px-4 py-3">{heading}</th>)}</tr></thead>
                  {rowsByDate.map(group => (
                    <tbody key={group.date}>
                      <tr className="bg-blue-50/70">
                        <td colSpan={8} className="border-y border-blue-100 px-4 py-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-black text-blue-700">{formatLongDate(group.date, lang, group.date)}</span>
                              <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-blue-600 shadow-sm">{group.rows.length}</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-xs font-black tabular-nums">
                              <span className="rounded-full bg-green-50 px-3 py-1.5 text-green-700">{l.cafeIncome}: {formatCurrency(group.cafeIncome)}</span>
                              <span className="rounded-full bg-purple-50 px-3 py-1.5 text-purple-700">{l.investorIncome}: {formatCurrency(group.investorIncome)}</span>
                            </div>
                          </div>
                        </td>
                      </tr>
                      {group.rows.map(row => {
                        const isIncome = normalizeExpenseEntryType(row.entry_type) === 'income'
                        const category = row.is_salary_payment ? l.salaryPayment : row.is_salary_bonus ? l.salaryBonus : expenseCategoryLabel(row.category, lang)
                        const tone = expenseTone(row)
                        return <tr key={`${row.id}-${row.expense_date}`} className={`border-b border-l-4 border-[#F3F4F6] last:border-b-0 ${tone.row}`}>
                          <td className="whitespace-nowrap px-4 py-3 text-sm font-bold text-[#4B5563]">{formatLongDate(row.expense_date, lang, row.expense_date)}</td>
                          <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-black ${tone.badge}`}>{isIncome ? l.income : l.expense}</span></td>
                          <td className={`px-4 py-3 text-sm font-black ${tone.text}`}>{category}</td>
                          <td className={`whitespace-nowrap px-4 py-3 text-right text-sm font-black ${tone.text}`}>{formatCurrency(row.amount)}</td>
                          <td className="px-4 py-3 text-sm font-bold text-[#4B5563]">{expensePaymentMethodLabel(row.payment_method, lang)}</td>
                          <td className="max-w-[220px] px-4 py-3 text-sm font-semibold text-[#4B5563]">{row.vendor || '—'}</td>
                          <td className="max-w-[260px] break-words px-4 py-3 text-sm font-semibold text-[#4B5563]">{row.description || '—'}</td>
                          <td className="px-4 py-3 text-sm font-semibold text-[#6B7280]">{row.created_by_name || '—'}</td>
                        </tr>
                      })}
                    </tbody>
                  ))}
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  )
}
