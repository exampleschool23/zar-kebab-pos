import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Banknote,
  CreditCard,
  Download,
  HandCoins,
  Plus,
  ReceiptText,
  RefreshCw,
  Users,
  Terminal,
  Trash2,
  WalletCards,
} from 'lucide-react'
import AppShell from '../components/AppShell'
import { OperationalError, OperationalLoading } from '../components/OperationalState'
import { supabase } from '../lib/supabase'
import { useApp } from '../store/AppContext'
import { useAuth } from '../contexts/AuthContext'
import { getOrderTotal, isPaidOrder, matchesRange, toLocalDateStr } from '../lib/analytics'
import { formatCurrency } from '../lib/formatCurrency'
import { formatLongDate } from '../lib/dateFormat'
import { formatMoneyInput, normalizeMoneyInput } from '../lib/moneyInput'
import {
  EXPENSE_CATEGORIES,
  EXPENSE_ENTRY_TYPES,
  EXPENSE_PAYMENT_METHODS,
  INCOME_CATEGORIES,
  MANUAL_EXPENSE_CATEGORIES,
  buildSalaryBonusExpenseRows,
  buildSalaryPaymentExpenseRows,
  expenseCategoryLabel,
  expensePaymentMethodLabel,
  getNetIncome,
  getTotalSalaryDue,
  normalizeExpenseAmount,
  normalizeExpenseEntryType,
  summarizeExpenseCashflow,
  summarizeExpenses,
  summarizeIncomeEntries,
  todayExpenseDate,
} from '../lib/expenses'
import { downloadCsv } from '../lib/closeout'

const SELECT_COLUMNS = 'id, entry_type, expense_date, category, payment_method, amount, vendor, description, created_by, created_by_name, created_at, updated_at'
const FIELD_INPUT_CLASS = 'w-full rounded-xl border border-[#E5E7EB] bg-white px-3 py-2.5 text-sm font-semibold text-[#1F2937] outline-none transition-colors focus:border-[#ff5a00]'
const DATE_INPUT_CLASS = `${FIELD_INPUT_CLASS} text-transparent caret-transparent`
const RANGE_DATE_INPUT_CLASS = 'h-6 w-[138px] bg-transparent text-sm text-transparent caret-transparent outline-none'

function addDays(isoDate, n) {
  const d = new Date(isoDate + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return toLocalDateStr(d.toISOString())
}

function methodIcon(method) {
  if (method === 'card') return CreditCard
  if (method === 'terminal') return Terminal
  return Banknote
}

function expenseTone(expense) {
  const category = String(expense?.category || '')
  if (normalizeExpenseEntryType(expense?.entry_type) === 'income') {
    return {
      row: 'border-l-4 border-l-green-500',
      title: 'text-green-700',
      badge: 'bg-green-50 text-green-700',
      amount: 'text-green-600',
    }
  }
  if (category.startsWith('salary_') || expense?.is_salary_payment || expense?.is_salary_bonus) {
    return {
      row: 'border-l-4 border-l-blue-500',
      title: 'text-blue-700',
      badge: 'bg-blue-50 text-blue-700',
      amount: 'text-blue-600',
    }
  }
  if (category === 'products_bazaar') {
    return {
      row: 'border-l-4 border-l-teal-500',
      title: 'text-teal-700',
      badge: 'bg-teal-50 text-teal-700',
      amount: 'text-teal-600',
    }
  }
  return {
    row: 'border-l-4 border-l-orange-500',
    title: 'text-[#1F2937]',
    badge: 'bg-gray-100 text-[#6B7280]',
    amount: 'text-[#ff5a00]',
  }
}

function DateInput({ value, lang, onChange, className = DATE_INPUT_CLASS }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center whitespace-nowrap text-sm font-semibold text-[#1F2937]">
        {formatLongDate(value, lang, value)}
      </span>
      <input
        type="date"
        value={value}
        onChange={event => onChange(event.target.value)}
        className={className}
      />
    </div>
  )
}

function isMissingExpensesMigration(error) {
  const text = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return text.includes('expenses') && (
    text.includes('does not exist') ||
    text.includes('schema cache') ||
    text.includes('42p01')
  )
}

function isMissingSalaryMigration(error) {
  const text = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return text.includes('employee_salary') && (
    text.includes('does not exist') ||
    text.includes('could not find the') ||
    text.includes('column') ||
    text.includes('schema cache') ||
    text.includes('42p01') ||
    text.includes('42703')
  )
}

function composeSalaryProfiles(rows = [], rates = [], payments = [], bonuses = [], absences = [], profiles = []) {
  const profileMap = Object.fromEntries(profiles.map(profile => [profile.id, profile]))
  return rows.map(row => ({
    ...row,
    profile: profileMap[row.profile_id] || null,
    rates: rates.filter(rate => rate.salary_profile_id === row.id),
    payments: payments.filter(payment => payment.salary_profile_id === row.id),
    bonuses: bonuses.filter(bonus => bonus.salary_profile_id === row.id),
    absences: absences.filter(absence => absence.salary_profile_id === row.id),
  }))
}

function exportExpensesCsv(expenses, lang) {
  const header = ['entry_type', 'date', 'category', 'payment_method', 'amount', 'vendor', 'description', 'created_by']
  const rows = expenses.map(expense => [
    normalizeExpenseEntryType(expense.entry_type),
    expense.expense_date,
    expenseCategoryLabel(expense.category, lang),
    expensePaymentMethodLabel(expense.payment_method, lang),
    expense.amount,
    expense.vendor || '',
    expense.description || '',
    expense.created_by_name || '',
  ])
  const csv = [header, ...rows]
    .map(row => row.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n')
  downloadCsv(`zar-kebab-expenses-${todayExpenseDate()}.csv`, csv)
}

export default function Expenses() {
  const { state } = useApp()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const lang = state.lang || 'ru'
  const role = (profile?.role || state.user?.role || 'guest').toLowerCase()
  const canAdd = role === 'owner'
  const canDelete = role === 'owner'

  const [dateFrom, setDateFrom] = useState(() => todayExpenseDate().slice(0, 8) + '01')
  const [dateTo, setDateTo] = useState(() => todayExpenseDate())
  const [expenses, setExpenses] = useState([])
  const [salaryProfiles, setSalaryProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState('')
  const [form, setForm] = useState({
    entry_type: 'expense',
    expense_date: todayExpenseDate(),
    category: 'products_bazaar',
    payment_method: 'cash',
    amount: '',
    vendor: '',
    description: '',
  })

  const L = {
    uz: {
      title: 'Buxgalteriya',
      sub: 'Daromad, xarajat, investor yordami va maoshlarni kuzatish',
      income: 'Daromad',
      investorSupport: 'Investor yordami',
      expenses: 'Xarajatlar',
      left: 'Qolgan pul',
      add: 'Xarajat qo‘shish',
      addIncome: 'Boshqa daromad qo‘shish',
      date: 'Sana',
      entryType: 'Yozuv turi',
      expenseType: 'Xarajat',
      incomeType: 'Daromad',
      category: 'Kategoriya',
      method: 'To‘lov turi',
      amount: 'Summa',
      vendor: 'Yetkazuvchi yoki xodim',
      source: 'Investor yoki manba',
      description: 'Izoh',
      save: 'Saqlash',
      saving: 'Saqlanmoqda...',
      refresh: 'Yangilash',
      export: 'Eksport',
      salaries: 'Maoshlar',
      salaryDue: 'Maosh qarzi',
      estimate: 'Taxmin',
      today: 'Bugun',
      week: '7 kun',
      month: 'Oy',
      from: 'Dan',
      to: 'Gacha',
      methodBalances: 'To‘lov turi qoldig‘i',
      moneyFlow: 'Pul qayerga ketmoqda',
      incomeSources: 'Qo‘shimcha daromad manbalari',
      incomeIn: 'Kirdi',
      spentOut: 'Chiqdi',
      remaining: 'Qoldi',
      investorHistory: 'Investor yordami',
      history: 'Xarajatlar tarixi',
      empty: 'Bu davrda xarajat yozilmagan',
      emptyInvestor: 'Bu davrda investor yordami yo‘q',
      salaryBonus: 'Maosh bonusi',
      required: 'Sana, kategoriya, to‘lov turi va summa kerak.',
      saveFailed: 'Xarajatni saqlab bo‘lmadi.',
      loadFailed: 'Xarajatlarni yuklab bo‘lmadi.',
      migrationMissing: 'Xarajatlar jadvali hali bazada tayyor emas. Supabase SQL editorida supabase/048_expenses.sql va supabase/059_expense_income_entries.sql migratsiyalarini ishga tushiring.',
      salaryMigrationMissing: 'Maosh jadvallari yangilanmagan. Supabase SQL editorida supabase/054_employee_salary_profiles.sql, supabase/055_employee_salary_rate_amount_upgrade.sql, supabase/056_employee_salary_profile_end_date.sql va supabase/063_employee_salary_absences.sql migratsiyalarini ishga tushiring.',
      automaticSalary: 'Maosh to‘lovi',
      delete: 'O‘chirish',
      confirmDelete: 'Tasdiqlash',
      deleteFailed: 'Xarajatni o‘chirib bo‘lmadi.',
      readOnly: 'Bu rol faqat ko‘ra oladi.',
    },
    ru: {
      title: 'Бухгалтерия',
      sub: 'Учёт доходов, расходов, поддержки инвестора и зарплат',
      income: 'Доход',
      investorSupport: 'Поддержка инвестора',
      expenses: 'Расходы',
      left: 'Остаток',
      add: 'Добавить расход',
      addIncome: 'Добавить внешний доход',
      date: 'Дата',
      entryType: 'Тип записи',
      expenseType: 'Расход',
      incomeType: 'Доход',
      category: 'Категория',
      method: 'Способ оплаты',
      amount: 'Сумма',
      vendor: 'Поставщик или сотрудник',
      source: 'Инвестор или источник',
      description: 'Описание',
      save: 'Сохранить',
      saving: 'Сохраняется...',
      refresh: 'Обновить',
      export: 'Экспорт',
      salaries: 'Зарплаты',
      salaryDue: 'Долг по зарплате',
      estimate: 'Прогноз',
      today: 'Сегодня',
      week: '7 дней',
      month: 'Месяц',
      from: 'С',
      to: 'По',
      methodBalances: 'Остаток по способам оплаты',
      moneyFlow: 'Куда уходят деньги',
      incomeSources: 'Источники внешнего дохода',
      incomeIn: 'Приход',
      spentOut: 'Расход',
      remaining: 'Остаток',
      investorHistory: 'Поддержка инвестора',
      history: 'История расходов',
      empty: 'За этот период расходов нет',
      emptyInvestor: 'За этот период поддержки инвестора нет',
      salaryBonus: 'Бонус к зарплате',
      required: 'Нужны дата, категория, способ оплаты и сумма.',
      saveFailed: 'Не удалось сохранить расход.',
      loadFailed: 'Не удалось загрузить расходы.',
      migrationMissing: 'Таблица расходов ещё не готова в базе. Запустите supabase/048_expenses.sql и supabase/059_expense_income_entries.sql в Supabase SQL Editor.',
      salaryMigrationMissing: 'Таблицы зарплат не обновлены. Запустите supabase/054_employee_salary_profiles.sql, supabase/055_employee_salary_rate_amount_upgrade.sql, supabase/056_employee_salary_profile_end_date.sql и supabase/063_employee_salary_absences.sql в Supabase SQL Editor.',
      automaticSalary: 'Выплата зарплаты',
      delete: 'Удалить',
      confirmDelete: 'Подтвердить',
      deleteFailed: 'Не удалось удалить расход.',
      readOnly: 'Эта роль может только просматривать.',
    },
    en: {
      title: 'Accounting',
      sub: 'Track income, expenses, investor support, and salaries',
      income: 'Income',
      investorSupport: 'Investor support',
      expenses: 'Expenses',
      left: 'Left',
      add: 'Add expense',
      addIncome: 'Add other income',
      date: 'Date',
      entryType: 'Entry type',
      expenseType: 'Expense',
      incomeType: 'Income',
      category: 'Category',
      method: 'Payment method',
      amount: 'Amount',
      vendor: 'Vendor or employee',
      source: 'Investor or source',
      description: 'Description',
      save: 'Save',
      saving: 'Saving...',
      refresh: 'Refresh',
      export: 'Export',
      salaries: 'Salaries',
      salaryDue: 'Salary due',
      estimate: 'Estimate',
      today: 'Today',
      week: '7 days',
      month: 'Month',
      from: 'From',
      to: 'To',
      methodBalances: 'Left by payment method',
      moneyFlow: 'Where money is going',
      incomeSources: 'Other income sources',
      incomeIn: 'In',
      spentOut: 'Out',
      remaining: 'Left',
      investorHistory: 'Investor support',
      history: 'Expense history',
      empty: 'No expenses in this period',
      emptyInvestor: 'No investor support in this period',
      salaryBonus: 'Salary bonus',
      required: 'Date, category, payment method, and amount are required.',
      saveFailed: 'Could not save expense.',
      loadFailed: 'Could not load expenses.',
      migrationMissing: 'Expenses table is not ready yet. Run supabase/048_expenses.sql and supabase/059_expense_income_entries.sql in Supabase SQL Editor.',
      salaryMigrationMissing: 'Salary tables are not up to date. Run supabase/054_employee_salary_profiles.sql, supabase/055_employee_salary_rate_amount_upgrade.sql, supabase/056_employee_salary_profile_end_date.sql, and supabase/063_employee_salary_absences.sql in Supabase SQL Editor.',
      automaticSalary: 'Salary payment',
      delete: 'Delete',
      confirmDelete: 'Confirm',
      deleteFailed: 'Could not delete expense.',
      readOnly: 'This role can view only.',
    },
  }
  const l = L[lang] || L.en
  const categoryOptions = form.entry_type === 'income' ? INCOME_CATEGORIES : MANUAL_EXPENSE_CATEGORIES

  async function loadExpenses() {
    setLoading(true)
    setError('')
    const [expenseResult, salaryProfileResult, salaryRateResult, salaryPaymentResult, salaryBonusResult, salaryAbsenceResult, teamResult] = await Promise.all([
      supabase
        .from('expenses')
        .select(SELECT_COLUMNS)
        .gte('expense_date', dateFrom)
        .lte('expense_date', dateTo)
        .order('expense_date', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase.from('employee_salary_profiles').select('*'),
      supabase.from('employee_salary_rates').select('*'),
      supabase.from('employee_salary_payments').select('*'),
      supabase.from('employee_salary_bonuses').select('*'),
      supabase.from('employee_salary_absences').select('*'),
      supabase.from('profiles').select('id, full_name, email, role, status'),
    ])

    if (expenseResult.error) {
      setError(isMissingExpensesMigration(expenseResult.error) ? l.migrationMissing : expenseResult.error.message || l.loadFailed)
      setExpenses([])
    } else {
      setExpenses(expenseResult.data || [])
    }
    const salaryError = salaryProfileResult.error || salaryRateResult.error || salaryPaymentResult.error || salaryBonusResult.error || salaryAbsenceResult.error
    if (salaryError) {
      setSalaryProfiles([])
      if (!expenseResult.error && isMissingSalaryMigration(salaryError)) setError(l.salaryMigrationMissing)
    } else {
      setSalaryProfiles(composeSalaryProfiles(
        salaryProfileResult.data || [],
        salaryRateResult.data || [],
        salaryPaymentResult.data || [],
        salaryBonusResult.data || [],
        salaryAbsenceResult.data || [],
        teamResult.data || [],
      ))
    }
    setLoading(false)
  }

  useEffect(() => {
    loadExpenses()
  }, [dateFrom, dateTo]) // eslint-disable-line react-hooks/exhaustive-deps

  const paidOrders = useMemo(() => (
    state.orders.filter(order => isPaidOrder(order) && matchesRange(order, dateFrom, dateTo))
  ), [state.orders, dateFrom, dateTo])

  const revenue = paidOrders.reduce((sum, order) => sum + getOrderTotal(order), 0)
  const salaryExpenses = useMemo(() => (
    buildSalaryPaymentExpenseRows(salaryProfiles, dateFrom, dateTo)
      .map(row => ({ ...row, description: l.automaticSalary }))
      .sort((a, b) => b.expense_date.localeCompare(a.expense_date) || String(a.vendor || '').localeCompare(String(b.vendor || '')))
  ), [salaryProfiles, dateFrom, dateTo, l.automaticSalary])
  const salaryBonusExpenses = useMemo(() => (
    buildSalaryBonusExpenseRows(salaryProfiles, dateFrom, dateTo)
      .sort((a, b) => b.expense_date.localeCompare(a.expense_date) || String(a.vendor || '').localeCompare(String(b.vendor || '')))
  ), [salaryProfiles, dateFrom, dateTo])

  const allExpenses = useMemo(() => (
    [...salaryExpenses, ...salaryBonusExpenses, ...expenses]
      .sort((a, b) => b.expense_date.localeCompare(a.expense_date))
  ), [salaryExpenses, salaryBonusExpenses, expenses])

  const filteredExpenses = allExpenses

  const filteredInvestorSupport = useMemo(() => (
    filteredExpenses.filter(expense => normalizeExpenseEntryType(expense.entry_type) === 'income')
  ), [filteredExpenses])
  const filteredExpenseRows = useMemo(() => (
    filteredExpenses.filter(expense => normalizeExpenseEntryType(expense.entry_type) !== 'income')
  ), [filteredExpenses])
  const incomeSummary = useMemo(() => summarizeIncomeEntries(filteredExpenses), [filteredExpenses])
  const summary = useMemo(() => summarizeExpenses(filteredExpenses), [filteredExpenses])
  const cashflow = useMemo(() => summarizeExpenseCashflow(paidOrders, filteredExpenses), [paidOrders, filteredExpenses])
  const netIncome = getNetIncome(revenue, filteredExpenses)
  const totalIncome = revenue + incomeSummary.total
  const investorSupportTotal = incomeSummary.byCategory.investor_support || 0
  const currentAccountingDate = todayExpenseDate()
  const salaryDueDate = dateTo < currentAccountingDate ? dateTo : currentAccountingDate
  const activeRangeKey = (() => {
    const today = todayExpenseDate()
    if (dateFrom === today && dateTo === today) return 'today'
    if (dateFrom === addDays(today, -6) && dateTo === today) return 'week'
    if (dateFrom === today.slice(0, 8) + '01' && dateTo === today) return 'month'
    return ''
  })()
  const totalSalaryDue = useMemo(() => getTotalSalaryDue(salaryProfiles, salaryDueDate), [salaryProfiles, salaryDueDate])
  const categoryRows = Object.entries(summary.byCategory)
    .sort((a, b) => b[1] - a[1])

  async function saveExpense(event) {
    event.preventDefault()
    setMessage('')
    setError('')
    const amount = normalizeExpenseAmount(form.amount)
    if (!form.expense_date || !form.category || !form.payment_method || amount <= 0) {
      setError(l.required)
      return
    }
    const entryType = normalizeExpenseEntryType(form.entry_type)
    setSaving(true)
    const payload = {
      entry_type: entryType,
      expense_date: form.expense_date,
      category: form.category,
      payment_method: form.payment_method,
      amount,
      vendor: form.vendor.trim(),
      description: form.description.trim(),
      created_by: profile?.id || null,
      created_by_name: profile?.full_name || profile?.email || state.user?.name || '',
    }
    const { error: saveError } = await supabase.from('expenses').insert(payload)
    setSaving(false)
    if (saveError) {
      setError(isMissingExpensesMigration(saveError) ? l.migrationMissing : saveError.message || l.saveFailed)
      return
    }
    setForm(current => ({
      ...current,
      category: entryType === 'income' ? 'investor_support' : current.category,
      amount: '',
      vendor: '',
      description: '',
    }))
    setMessage(l.save)
    await loadExpenses()
  }

  async function deleteExpense(expense) {
    if (!canDelete || !expense?.id) return
    if (confirmDeleteId !== expense.id) {
      setConfirmDeleteId(expense.id)
      return
    }
    setError('')
    const { error: deleteError } = await supabase.from('expenses').delete().eq('id', expense.id)
    if (deleteError) {
      setError(deleteError.message || l.deleteFailed)
      return
    }
    setConfirmDeleteId('')
    await loadExpenses()
  }

  return (
    <AppShell title={l.title}>
      <div className="h-full overflow-y-auto bg-[#FAF7F0]">
        <div className="mx-auto max-w-[1200px] px-4 py-5 sm:px-5 sm:py-6">
          <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h1 className="text-2xl font-black text-[#1F2937]">{l.title}</h1>
              <p className="mt-1 text-sm font-medium text-[#6B7280]">{l.sub}</p>
            </div>
          </div>

          <div className="mb-5 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 shadow-sm">
              <span className="text-[11px] font-bold text-[#9CA3AF]">{l.from}</span>
              <DateInput value={dateFrom} lang={lang} onChange={setDateFrom} className={RANGE_DATE_INPUT_CLASS} />
              <span className="text-[#9CA3AF]">—</span>
              <span className="text-[11px] font-bold text-[#9CA3AF]">{l.to}</span>
              <DateInput value={dateTo} lang={lang} onChange={setDateTo} className={RANGE_DATE_INPUT_CLASS} />
            </div>
            {[
              { key: 'today', label: l.today },
              { key: 'week', label: l.week },
              { key: 'month', label: l.month },
            ].map(option => {
              const selected = activeRangeKey === option.key
              return (
                <button
                  key={option.key}
                  onClick={() => {
                    const today = todayExpenseDate()
                    if (option.key === 'today') { setDateFrom(today); setDateTo(today) }
                    if (option.key === 'week') { setDateFrom(addDays(today, -6)); setDateTo(today) }
                    if (option.key === 'month') { setDateFrom(today.slice(0, 8) + '01'); setDateTo(today) }
                  }}
                  className={`rounded-xl border px-3 py-2 text-xs font-black shadow-sm ${
                    selected
                      ? 'border-[#ff5a00] bg-[#ff5a00] text-white shadow-orange-100'
                      : 'border-[#E5E7EB] bg-white text-[#6B7280] hover:border-orange-200 hover:text-[#ff5a00]'
                  }`}
                >
                  {option.label}
                </button>
              )
            })}
            <button onClick={loadExpenses} className="inline-flex items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-xs font-black text-[#6B7280] shadow-sm">
              <RefreshCw size={14} />{l.refresh}
            </button>
            <button onClick={() => navigate('/admin/accounting/salaries')} className="inline-flex items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-black text-[#ff5a00] shadow-sm">
              <Users size={14} />{l.salaries}
            </button>
            <button onClick={() => navigate('/admin/accounting/estimate')} className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-blue-600 shadow-sm">
              <ReceiptText size={14} />{l.estimate}
            </button>
            <button onClick={() => exportExpensesCsv(filteredExpenses, lang)} className="inline-flex items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-xs font-black text-[#6B7280] shadow-sm">
              <Download size={14} />{l.export}
            </button>
          </div>

          <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Kpi icon={WalletCards} label={l.income} value={formatCurrency(totalIncome)} tone="green" />
            <Kpi icon={HandCoins} label={l.investorSupport} value={formatCurrency(investorSupportTotal)} tone="purple" />
            <Kpi icon={ReceiptText} label={l.expenses} value={formatCurrency(summary.total)} sub={`${summary.count} ${l.expenses.toLowerCase()}`} tone="orange" />
            <Kpi icon={Banknote} label={l.left} value={formatCurrency(netIncome)} tone={netIncome >= 0 ? 'blue' : 'red'} />
            <Kpi icon={Users} label={l.salaryDue} value={formatCurrency(totalSalaryDue)} tone={totalSalaryDue > 0 ? 'orange' : 'green'} />
          </div>

          <section className="mb-5 rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-black text-[#1F2937]">{l.methodBalances}</h2>
              <span className="text-[11px] font-black uppercase tracking-wide text-[#9CA3AF]">{l.remaining}</span>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {cashflow.rows.map(row => {
                const Icon = methodIcon(row.method)
                return (
                  <div key={row.method} className="rounded-xl border border-[#EEF0F3] bg-[#FBFCFD] p-3">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-2 text-sm font-black text-[#1F2937]">
                        <Icon size={16} className="text-[#ff5a00]" />{expensePaymentMethodLabel(row.method, lang)}
                      </span>
                      <span className={`text-lg font-black ${row.left >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(row.left)}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs font-bold">
                      <div className="rounded-lg bg-green-50 px-2 py-2 text-green-700">
                        <span className="block text-[10px] uppercase text-green-500">{l.incomeIn}</span>
                        {formatCurrency(row.income)}
                      </div>
                      <div className="rounded-lg bg-orange-50 px-2 py-2 text-[#ff5a00]">
                        <span className="block text-[10px] uppercase text-orange-400">{l.spentOut}</span>
                        {formatCurrency(row.expenses)}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          {error && (
            <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
              {error}
            </div>
          )}
          {message && !error && (
            <div className="mb-5 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-bold text-green-700">
              {message}
            </div>
          )}

          <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
            <div className="space-y-5">
              <section className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className="text-base font-black text-[#1F2937]">{form.entry_type === 'income' ? l.addIncome : l.add}</h2>
                  <Plus size={18} className="text-[#ff5a00]" />
                </div>
                {!canAdd ? (
                  <p className="rounded-xl bg-gray-50 px-3 py-3 text-sm font-bold text-[#6B7280]">{l.readOnly}</p>
                ) : (
                  <form onSubmit={saveExpense} className="space-y-3">
                    <Field label={l.entryType}>
                      <div className="grid grid-cols-2 gap-2">
                        {EXPENSE_ENTRY_TYPES.map(entryType => {
                          const active = form.entry_type === entryType
                          return (
                            <button
                              key={entryType}
                              type="button"
                              onClick={() => setForm(current => ({
                                ...current,
                                entry_type: entryType,
                                category: entryType === 'income' ? 'investor_support' : 'products_bazaar',
                              }))}
                              className={`flex h-11 items-center justify-center rounded-xl border text-xs font-black transition-colors ${
                                active ? 'border-[#ff5a00] bg-orange-50 text-[#ff5a00]' : 'border-[#E5E7EB] bg-white text-[#6B7280]'
                              }`}
                            >
                              {entryType === 'income' ? l.incomeType : l.expenseType}
                            </button>
                          )
                        })}
                      </div>
                    </Field>
                    <Field label={l.date}>
                      <DateInput
                        value={form.expense_date}
                        lang={lang}
                        onChange={value => setForm(current => ({ ...current, expense_date: value }))}
                      />
                    </Field>
                    <Field label={l.category}>
                      <select value={form.category} onChange={event => setForm(current => ({ ...current, category: event.target.value }))} className={FIELD_INPUT_CLASS}>
                        {categoryOptions.map(category => (
                          <option key={category.key} value={category.key}>{expenseCategoryLabel(category.key, lang)}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label={l.method}>
                      <div className="grid grid-cols-3 gap-2">
                        {EXPENSE_PAYMENT_METHODS.map(method => {
                          const Icon = methodIcon(method)
                          const active = form.payment_method === method
                          return (
                            <button
                              key={method}
                              type="button"
                              onClick={() => setForm(current => ({ ...current, payment_method: method }))}
                              className={`flex h-11 items-center justify-center gap-1.5 rounded-xl border text-xs font-black transition-colors ${
                                active ? 'border-[#ff5a00] bg-orange-50 text-[#ff5a00]' : 'border-[#E5E7EB] bg-white text-[#6B7280]'
                              }`}
                            >
                              <Icon size={14} />{expensePaymentMethodLabel(method, lang)}
                            </button>
                          )
                        })}
                      </div>
                    </Field>
                    <Field label={l.amount}>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={formatMoneyInput(form.amount)}
                        onChange={event => setForm(current => ({ ...current, amount: normalizeMoneyInput(event.target.value) }))}
                        className={`${FIELD_INPUT_CLASS} text-lg font-black tabular-nums`}
                        placeholder="0"
                      />
                    </Field>
                    <Field label={form.entry_type === 'income' ? l.source : l.vendor}>
                      <input value={form.vendor} onChange={event => setForm(current => ({ ...current, vendor: event.target.value }))} className={FIELD_INPUT_CLASS} />
                    </Field>
                    <Field label={l.description}>
                      <textarea value={form.description} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} rows={3} className={`${FIELD_INPUT_CLASS} min-h-[92px] resize-y`} />
                    </Field>
                    <button disabled={saving} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#ff5a00] text-sm font-black text-white shadow-sm shadow-orange-200 disabled:cursor-not-allowed disabled:bg-gray-200">
                      <Plus size={16} />{saving ? l.saving : l.save}
                    </button>
                  </form>
                )}
              </section>

              <ExpenseHistorySection
                title={l.investorHistory}
                rows={filteredInvestorSupport}
                loading={loading}
                emptyText={l.emptyInvestor}
                loadingTitle={l.loadFailed.replace('Не удалось ', '').replace('Could not ', '')}
                lang={lang}
                canDelete={canDelete}
                confirmDeleteId={confirmDeleteId}
                confirmDeleteLabel={l.confirmDelete}
                deleteLabel={l.delete}
                onDelete={deleteExpense}
                salaryPaymentLabel={l.automaticSalary}
                salaryBonusLabel={l.salaryBonus}
              />
            </div>

            <div className="min-w-0 space-y-5">
              <ExpenseCategoryChart title={l.moneyFlow} rows={categoryRows} total={summary.total} lang={lang} />
              <ExpenseHistorySection
                title={l.history}
                rows={filteredExpenseRows}
                loading={loading}
                emptyText={l.empty}
                loadingTitle={l.loadFailed.replace('Не удалось ', '').replace('Could not ', '')}
                lang={lang}
                canDelete={canDelete}
                confirmDeleteId={confirmDeleteId}
                confirmDeleteLabel={l.confirmDelete}
                deleteLabel={l.delete}
                onDelete={deleteExpense}
                salaryPaymentLabel={l.automaticSalary}
                salaryBonusLabel={l.salaryBonus}
              />
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  )
}

function ExpenseHistorySection({
  title,
  rows,
  loading,
  emptyText,
  loadingTitle,
  lang,
  canDelete,
  confirmDeleteId,
  confirmDeleteLabel,
  deleteLabel,
  onDelete,
  salaryPaymentLabel,
  salaryBonusLabel,
}) {
  return (
    <section className="rounded-2xl border border-[#E5E7EB] bg-white shadow-sm">
      <div className="border-b border-[#F3F4F6] px-4 py-4">
        <h2 className="text-base font-black text-[#1F2937]">{title}</h2>
      </div>
      {loading ? (
        <OperationalLoading title={loadingTitle} description="" />
      ) : rows.length === 0 ? (
        <div className="px-4 py-12 text-center text-sm font-bold text-[#9CA3AF]">{emptyText}</div>
      ) : (
        <div className="max-h-[520px] overflow-y-auto">
          {rows.map(expense => {
            const Icon = methodIcon(expense.payment_method)
            const tone = expenseTone(expense)
            const title = expense.is_salary_payment
              ? salaryPaymentLabel
              : expense.is_salary_bonus
                ? salaryBonusLabel
                : expenseCategoryLabel(expense.category, lang)
            return (
              <div key={expense.id} className={`flex flex-col gap-3 border-b border-[#F3F4F6] px-4 py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between ${tone.row}`}>
                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className={`text-sm font-black ${tone.title}`}>{title}</span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-black ${tone.badge}`}>
                      <Icon size={11} />{expensePaymentMethodLabel(expense.payment_method, lang)}
                    </span>
                  </div>
                  <p className="text-xs font-bold text-[#9CA3AF]">{formatLongDate(expense.expense_date, lang, expense.expense_date)} · {expense.created_by_name || '—'}</p>
                  {(expense.vendor || expense.description) && (
                    <p className="mt-1 break-words text-sm font-semibold text-[#4B5563]">
                      {[expense.vendor, expense.description].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
                <div className="flex flex-shrink-0 items-center justify-between gap-3 sm:justify-end">
                  <p className={`text-lg font-black ${tone.amount}`}>{formatCurrency(expense.amount)}</p>
                  {canDelete && !expense.is_salary_auto && (
                    <button onClick={() => onDelete(expense)} className={`inline-flex h-10 items-center gap-1.5 rounded-xl border px-3 text-xs font-black ${
                      confirmDeleteId === expense.id ? 'border-red-200 bg-red-50 text-red-600' : 'border-[#E5E7EB] text-[#6B7280]'
                    }`}>
                      <Trash2 size={14} />{confirmDeleteId === expense.id ? confirmDeleteLabel : deleteLabel}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function ExpenseCategoryChart({ title, rows, total, lang }) {
  const palette = ['#ff5a00', '#16a34a', '#2563eb', '#9333ea', '#dc2626', '#0f766e']
  const visibleRows = rows.slice(0, 6)

  return (
    <section className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
      <h2 className="mb-4 text-base font-black text-[#1F2937]">{title}</h2>
      {visibleRows.length === 0 ? (
        <p className="py-6 text-sm font-bold text-[#9CA3AF]">—</p>
      ) : (
        <div className="space-y-3">
          {visibleRows.map(([key, amount], index) => {
            const width = total > 0 ? Math.max(6, Math.round((amount / total) * 100)) : 0
            return (
              <div key={key} className="grid gap-2 sm:grid-cols-[180px_1fr_120px] sm:items-center">
                <span className="truncate text-sm font-black text-[#374151]">{expenseCategoryLabel(key, lang)}</span>
                <div className="h-8 overflow-hidden rounded-xl bg-gray-100">
                  <div
                    className="flex h-full items-center justify-end rounded-xl pr-2 text-[11px] font-black text-white"
                    style={{ width: `${width}%`, backgroundColor: palette[index % palette.length] }}
                  >
                    {width >= 18 ? `${width}%` : ''}
                  </div>
                </div>
                <span className="text-sm font-black text-[#1F2937] sm:text-right">{formatCurrency(amount)}</span>
              </div>
            )
          })}
        </div>
      )}
    </section>
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

function Kpi({ icon: Icon, label, value, sub = '', tone = 'orange' }) {
  const tones = {
    green: 'bg-green-50 text-green-600',
    orange: 'bg-orange-50 text-[#ff5a00]',
    blue: 'bg-blue-50 text-blue-600',
    red: 'bg-red-50 text-red-600',
    purple: 'bg-purple-50 text-purple-600',
  }
  return (
    <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
      <div className={`mb-4 flex h-11 w-11 items-center justify-center rounded-xl ${tones[tone] || tones.orange}`}>
        <Icon size={20} />
      </div>
      <p className="text-xs font-black uppercase tracking-wide text-[#9CA3AF]">{label}</p>
      <p className="mt-1 text-2xl font-black text-[#1F2937]">{value}</p>
      {sub && <p className="mt-1 text-xs font-bold text-[#9CA3AF]">{sub}</p>}
    </div>
  )
}

function Breakdown({ title, rows, total, lang, type }) {
  return (
    <section className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-black text-[#1F2937]">{title}</h2>
      {rows.length === 0 ? (
        <p className="py-4 text-sm font-bold text-[#9CA3AF]">—</p>
      ) : (
        <div className="space-y-3">
          {rows.map(([key, amount]) => {
            const label = type === 'method' ? expensePaymentMethodLabel(key, lang) : expenseCategoryLabel(key, lang)
            const width = total > 0 ? Math.max(4, Math.round((amount / total) * 100)) : 0
            return (
              <div key={key}>
                <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                  <span className="font-bold text-[#4B5563]">{label}</span>
                  <span className="font-black text-[#1F2937]">{formatCurrency(amount)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                  <div className="h-full rounded-full bg-[#ff5a00]" style={{ width: `${width}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
