import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Banknote,
  CalendarDays,
  CreditCard,
  Home,
  Monitor,
  QrCode,
  ReceiptText,
  RefreshCw,
  Tag,
  TrendingDown,
  TrendingUp,
  Users,
  WalletCards,
} from 'lucide-react'
import AppShell from '../components/AppShell'
import { OperationalError, OperationalLoading } from '../components/OperationalState'
import { getOrderPayments, getOrderTotal, isPaidOrder, matchesRange, toLocalDateStr } from '../lib/analytics'
import { formatLongDate } from '../lib/dateFormat'
import {
  buildSalaryBonusExpenseRows,
  buildSalaryPaymentExpenseRows,
  expensePaymentMethodLabel,
  getEstimatedMonthlyExpenseSummary,
  normalizeExpenseAmount,
  normalizeExpenseEntryType,
  summarizeExpenses,
  summarizeIncomeEntries,
  todayExpenseDate,
} from '../lib/expenses'
import { formatCurrency } from '../lib/formatCurrency'
import { supabase } from '../lib/supabase'
import { useApp } from '../store/AppContext'

const SELECT_COLUMNS = 'id, entry_type, expense_date, category, payment_method, amount, vendor, description, created_by, created_by_name, created_at, updated_at'

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

function monthStartFor(date) {
  return String(date || todayExpenseDate()).slice(0, 8) + '01'
}

function monthEndFor(monthStart) {
  const [year, month] = String(monthStart || todayExpenseDate()).split('-').map(Number)
  if (!year || !month) return monthStart
  const date = new Date(Date.UTC(year, month, 0, 12, 0, 0))
  return toLocalDateStr(date.toISOString())
}

function addMonths(monthStart, delta) {
  const [year, month] = String(monthStart || todayExpenseDate()).split('-').map(Number)
  const date = new Date(Date.UTC(year, (month || 1) - 1 + delta, 1, 12, 0, 0))
  return monthStartFor(toLocalDateStr(date.toISOString()))
}

function formatUsd(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Math.max(0, Math.round(Number(amount) || 0)))
}

function methodLabel(method, lang) {
  if (['cash', 'card', 'terminal'].includes(method)) return expensePaymentMethodLabel(method, lang)
  if (method === 'qr') return 'QR'
  if (method === 'loyalty_card') return lang === 'uz' ? 'Sodiqlik' : lang === 'ru' ? 'Лояльность' : 'Loyalty'
  return method || '—'
}

function addToMap(map, key, amount) {
  const normalizedKey = key || 'unknown'
  map[normalizedKey] = (map[normalizedKey] || 0) + normalizeExpenseAmount(amount)
}

export default function MonthlyEstimate() {
  const { state } = useApp()
  const navigate = useNavigate()
  const lang = state.lang || 'ru'
  const today = todayExpenseDate()
  const [monthStart, setMonthStart] = useState(monthStartFor(today))
  const monthEnd = useMemo(() => monthEndFor(monthStart), [monthStart])
  const actualThroughDate = today < monthStart ? monthStart : today > monthEnd ? monthEnd : today

  const [expenses, setExpenses] = useState([])
  const [salaryProfiles, setSalaryProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const L = {
    uz: {
      title: 'Oylik taxmin',
      sub: 'Pul qayerdan keldi, qayerga ketdi va oy oxirigacha nimalar qolgan',
      back: 'Buxgalteriyaga qaytish',
      refresh: 'Yangilash',
      currentMonth: 'Joriy oy',
      moneyCame: 'Pul qayerdan keldi',
      moneyWent: 'Pul qayerga ketdi',
      methodFlow: 'To‘lov turi bo‘yicha oqim',
      monthPlan: 'Oy rejasi',
      clearOverview: 'Asosiy raqamlar',
      salesRevenue: 'Kafe savdosi',
      cafePaidIn: 'Kafedan kelgan pul',
      investorInvested: 'Investor kiritgan pul',
      investorSupport: 'Investor yordami',
      otherIncome: 'Boshqa daromad',
      salaryPaid: 'Xodimlarga to‘langan',
      productsSpent: 'Mahsulotlarga ketgan',
      salaryBonus: 'Bonuslar',
      recordedExpenses: 'Yozilgan xarajatlar',
      salaryRemaining: 'Oy oxirigacha maosh',
      rentRemaining: 'To‘lanishi kerak ijara',
      rent: 'Ijara',
      actualIn: 'Hozirgacha kirim',
      actualOut: 'Hozirgacha chiqim',
      netLeft: 'Hozirgi qoldiq',
      plannedUzs: 'Oy oxirigacha UZS xarajat',
      paidOrders: 'To‘langan buyurtmalar',
      rentNote: 'Alohida USD majburiyat',
      rentPaid: 'Bu oy ijara to‘langan',
      inflow: 'Kirim',
      outflow: 'Chiqim',
      balance: 'Farq',
      loading: 'Taxmin yuklanmoqda',
      loadFailed: 'Taxminni yuklab bo‘lmadi',
      migrationMissing: 'Buxgalteriya yoki maosh jadvallari bazada tayyor emas. Supabase migratsiyalarini tekshiring.',
      noData: 'Bu oy uchun ma’lumot hali yo‘q',
    },
    ru: {
      title: 'Прогноз месяца',
      sub: 'Откуда поступили деньги, на что они ушли и сколько ещё нужно оплатить до конца месяца',
      back: 'Назад к бухгалтерии',
      refresh: 'Обновить',
      currentMonth: 'Текущий месяц',
      moneyCame: 'Откуда поступили деньги',
      moneyWent: 'На что ушли деньги',
      methodFlow: 'Движение по способам оплаты',
      monthPlan: 'План месяца',
      clearOverview: 'Главные цифры',
      salesRevenue: 'Выручка кафе',
      cafePaidIn: 'Пришло из кафе',
      investorInvested: 'Инвестор вложил',
      investorSupport: 'Поддержка инвестора',
      otherIncome: 'Прочие поступления',
      salaryPaid: 'Выплачено сотрудникам',
      productsSpent: 'Потрачено на продукты',
      salaryBonus: 'Бонусы',
      recordedExpenses: 'Учтённые расходы',
      salaryRemaining: 'Осталось выплатить зарплаты',
      rentRemaining: 'Осталось оплатить аренду',
      rent: 'Аренда',
      actualIn: 'Пришло до сегодня',
      actualOut: 'Ушло на сегодня',
      netLeft: 'Текущий остаток',
      plannedUzs: 'План расходов в UZS до конца месяца',
      paidOrders: 'Оплаченные заказы',
      rentNote: 'Отдельное обязательство в USD',
      rentPaid: 'Аренда за месяц оплачена',
      inflow: 'Поступления',
      outflow: 'Расход',
      balance: 'Разница',
      loading: 'Загружаем прогноз',
      loadFailed: 'Не удалось загрузить прогноз',
      migrationMissing: 'Таблицы бухгалтерии или зарплат не готовы в базе. Проверьте миграции Supabase.',
      noData: 'За этот месяц данных пока нет',
    },
    en: {
      title: 'Monthly estimate',
      sub: 'Where money came from, where it went, and what remains due by month end',
      back: 'Back to accounting',
      refresh: 'Refresh',
      currentMonth: 'Current month',
      moneyCame: 'Where money came from',
      moneyWent: 'Where money went',
      methodFlow: 'Flow by payment method',
      monthPlan: 'Month plan',
      clearOverview: 'Main numbers',
      salesRevenue: 'Cafe sales',
      cafePaidIn: 'Came from cafe',
      investorInvested: 'Investor invested',
      investorSupport: 'Investor support',
      otherIncome: 'Other income',
      salaryPaid: 'Paid to employees',
      productsSpent: 'Spent on products',
      salaryBonus: 'Bonuses',
      recordedExpenses: 'Recorded expenses',
      salaryRemaining: 'Salary left this month',
      rentRemaining: 'Rent still due',
      rent: 'Rent',
      actualIn: 'In so far',
      actualOut: 'Out so far',
      netLeft: 'Current left',
      plannedUzs: 'UZS spend by month end',
      paidOrders: 'Paid orders',
      rentNote: 'Separate USD commitment',
      rentPaid: 'Rent recorded as paid this month',
      inflow: 'Inflow',
      outflow: 'Outflow',
      balance: 'Balance',
      loading: 'Loading estimate',
      loadFailed: 'Could not load estimate',
      migrationMissing: 'Accounting or salary tables are not ready in the database. Check Supabase migrations.',
      noData: 'No data for this month yet',
    },
  }
  const l = L[lang] || L.en

  async function loadEstimate() {
    setLoading(true)
    setError('')
    const [expenseResult, salaryProfileResult, salaryRateResult, salaryPaymentResult, salaryBonusResult, salaryAbsenceResult, teamResult] = await Promise.all([
      supabase
        .from('expenses')
        .select(SELECT_COLUMNS)
        .gte('expense_date', monthStart)
        .lte('expense_date', monthEnd),
      supabase.from('employee_salary_profiles').select('*'),
      supabase.from('employee_salary_rates').select('*'),
      supabase.from('employee_salary_payments').select('*'),
      supabase.from('employee_salary_bonuses').select('*'),
      supabase.from('employee_salary_absences').select('*'),
      supabase.from('profiles').select('id, full_name, email, role, status'),
    ])

    if (expenseResult.error) {
      setExpenses([])
      setError(isMissingExpensesMigration(expenseResult.error) ? l.migrationMissing : expenseResult.error.message || l.loadFailed)
    } else {
      setExpenses(expenseResult.data || [])
    }

    const salaryError = salaryProfileResult.error || salaryRateResult.error || salaryPaymentResult.error || salaryBonusResult.error || salaryAbsenceResult.error
    if (salaryError) {
      setSalaryProfiles([])
      if (!expenseResult.error) {
        setError(isMissingSalaryMigration(salaryError) ? l.migrationMissing : salaryError.message || l.loadFailed)
      }
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
    loadEstimate()
  }, [monthStart, monthEnd]) // eslint-disable-line react-hooks/exhaustive-deps

  const cutoffEnd = actualThroughDate < monthStart ? monthStart : actualThroughDate
  const paidOrders = useMemo(() => (
    state.orders.filter(order => isPaidOrder(order) && matchesRange(order, monthStart, cutoffEnd))
  ), [state.orders, monthStart, cutoffEnd])

  const actualEntries = useMemo(() => (
    expenses.filter(row => String(row.expense_date || '').slice(0, 10) <= cutoffEnd)
  ), [expenses, cutoffEnd])

  const incomeEntries = actualEntries.filter(row => normalizeExpenseEntryType(row.entry_type) === 'income')
  const manualExpenseRows = actualEntries.filter(row => normalizeExpenseEntryType(row.entry_type) === 'expense')
  const salaryPaymentRows = useMemo(() => (
    buildSalaryPaymentExpenseRows(salaryProfiles, monthStart, cutoffEnd)
  ), [salaryProfiles, monthStart, cutoffEnd])
  const salaryBonusRows = useMemo(() => (
    buildSalaryBonusExpenseRows(salaryProfiles, monthStart, cutoffEnd)
  ), [salaryProfiles, monthStart, cutoffEnd])
  const monthlyEstimate = useMemo(() => (
    getEstimatedMonthlyExpenseSummary(salaryProfiles, cutoffEnd)
  ), [salaryProfiles, cutoffEnd])

  const salesRevenue = paidOrders.reduce((sum, order) => sum + getOrderTotal(order), 0)
  const incomeSummary = summarizeIncomeEntries(incomeEntries)
  const allActualExpenseRows = [...salaryPaymentRows, ...salaryBonusRows, ...manualExpenseRows]
  const actualExpenseSummary = summarizeExpenses(allActualExpenseRows)
  const salaryBonusTotal = summarizeExpenses(salaryBonusRows).total
  const recordedExpenseTotal = summarizeExpenses(manualExpenseRows).total
  const investorInvestedTotal = incomeSummary.byCategory.investor_support || 0
  const productsSpentTotal = actualExpenseSummary.byCategory.products_bazaar || 0
  const recordedRentTotal = actualExpenseSummary.byCategory.rent || 0
  const totalInflow = salesRevenue + incomeSummary.total
  const totalOutflow = actualExpenseSummary.total
  const netLeft = totalInflow - totalOutflow
  const plannedMonthOutflowUzs = totalOutflow + monthlyEstimate.employeeRemainingThisMonth
  const rentUsd = monthlyEstimate.monthlyRentUsd
  const rentDueUsd = recordedRentTotal > 0 ? 0 : rentUsd

  const cameRows = [
    { key: 'sales', label: l.salesRevenue, amount: salesRevenue, color: '#16A34A' },
    { key: 'investor', label: l.investorSupport, amount: investorInvestedTotal, color: '#7C3AED' },
    { key: 'other-income', label: l.otherIncome, amount: Math.max(0, incomeSummary.total - investorInvestedTotal), color: '#2563EB' },
  ].filter(row => row.amount > 0)

  const wentRows = [
    { key: 'salary-paid', label: l.salaryPaid, amount: monthlyEstimate.employeePaidToDate, color: '#2563EB' },
    { key: 'salary-bonus', label: l.salaryBonus, amount: salaryBonusTotal, color: '#9333EA' },
    { key: 'products', label: l.productsSpent, amount: productsSpentTotal, color: '#F97316' },
    { key: 'recorded', label: l.recordedExpenses, amount: Math.max(0, recordedExpenseTotal - productsSpentTotal), color: '#FF5A00' },
    { key: 'salary-remaining', label: l.salaryRemaining, amount: monthlyEstimate.employeeRemainingThisMonth, color: '#DC2626' },
  ].filter(row => row.amount > 0)

  const overviewRows = [
    { key: 'investor-invested', icon: Banknote, label: l.investorInvested, value: formatCurrency(investorInvestedTotal), tone: 'purple' },
    { key: 'cafe-paid-in', icon: TrendingUp, label: l.cafePaidIn, value: formatCurrency(salesRevenue), tone: 'green', sub: l.paidOrders },
    { key: 'salary-paid', icon: Users, label: l.salaryPaid, value: formatCurrency(monthlyEstimate.employeePaidToDate), tone: 'blue' },
    { key: 'products-spent', icon: ReceiptText, label: l.productsSpent, value: formatCurrency(productsSpentTotal), tone: 'orange' },
    {
      key: 'salary-remaining',
      icon: Users,
      label: l.salaryRemaining,
      value: formatCurrency(monthlyEstimate.employeeRemainingThisMonth),
      tone: monthlyEstimate.employeeRemainingThisMonth > 0 ? 'red' : 'green',
    },
    {
      key: 'rent-remaining',
      icon: Home,
      label: l.rentRemaining,
      value: formatUsd(rentDueUsd),
      tone: rentDueUsd > 0 ? 'red' : 'green',
      sub: rentDueUsd > 0 ? l.rentNote : l.rentPaid,
    },
  ]

  const methodRows = useMemo(() => {
    const inflow = {}
    const outflow = {}
    for (const order of paidOrders) {
      for (const payment of getOrderPayments(order)) addToMap(inflow, payment.method, payment.amount)
    }
    for (const income of incomeEntries) addToMap(inflow, income.payment_method || 'cash', income.amount)
    for (const expense of allActualExpenseRows) addToMap(outflow, expense.payment_method || 'cash', expense.amount)
    const methods = ['cash', 'card', 'terminal', 'qr', 'loyalty_card']
    return methods
      .map(method => ({
        method,
        inflow: inflow[method] || 0,
        outflow: outflow[method] || 0,
      }))
      .filter(row => row.inflow > 0 || row.outflow > 0)
  }, [paidOrders, incomeEntries, allActualExpenseRows])

  if (loading) {
    return (
      <AppShell title={l.title}>
        <div className="h-full overflow-y-auto bg-[#FAF7F0]">
          <OperationalLoading title={l.loading} description="" />
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell title={l.title}>
      <div className="h-full overflow-y-auto bg-[#FAF7F0]">
        <div className="mx-auto max-w-[1280px] px-4 py-5 sm:px-5 sm:py-6">
          <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <button
                type="button"
                onClick={() => navigate('/admin/accounting')}
                className="mb-3 inline-flex items-center gap-2 text-xs font-black text-[#6B7280] hover:text-[#ff5a00]"
              >
                <ArrowLeft size={15} />{l.back}
              </button>
              <h1 className="text-2xl font-black text-[#1F2937]">{l.title}</h1>
              <p className="mt-1 max-w-2xl text-sm font-medium text-[#6B7280]">{l.sub}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setMonthStart(addMonths(monthStart, -1))}
                className="rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-xs font-black text-[#6B7280] shadow-sm hover:border-orange-200 hover:text-[#ff5a00]"
              >
                ←
              </button>
              <button
                type="button"
                onClick={() => setMonthStart(monthStartFor(today))}
                className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-black text-[#ff5a00] shadow-sm"
              >
                {l.currentMonth}
              </button>
              <button
                type="button"
                onClick={() => setMonthStart(addMonths(monthStart, 1))}
                className="rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-xs font-black text-[#6B7280] shadow-sm hover:border-orange-200 hover:text-[#ff5a00]"
              >
                →
              </button>
              <button
                type="button"
                onClick={loadEstimate}
                className="inline-flex items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-xs font-black text-[#6B7280] shadow-sm"
              >
                <RefreshCw size={14} />{l.refresh}
              </button>
            </div>
          </div>

          {error && (
            <OperationalError title={l.loadFailed} description={error} actionLabel={l.refresh} onAction={loadEstimate} />
          )}

          {!error && (
            <>
              <section className="mb-5 rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
                <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <h2 className="text-sm font-black text-[#1F2937]">{l.clearOverview}</h2>
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide text-[#9CA3AF]">
                    <CalendarDays size={13} />
                    {formatLongDate(monthStart, lang, monthStart)} - {formatLongDate(monthEnd, lang, monthEnd)}
                  </span>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {overviewRows.map(row => <Kpi key={row.key} {...row} />)}
                </div>
              </section>

              <section className="mb-5 rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
                <h2 className="mb-4 text-sm font-black text-[#1F2937]">{l.monthPlan}</h2>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <Kpi icon={TrendingUp} label={l.actualIn} value={formatCurrency(totalInflow)} tone="green" />
                  <Kpi icon={TrendingDown} label={l.actualOut} value={formatCurrency(totalOutflow)} tone="orange" />
                  <Kpi icon={WalletCards} label={l.netLeft} value={formatCurrency(netLeft)} tone={netLeft >= 0 ? 'blue' : 'red'} />
                  <Kpi icon={Users} label={l.plannedUzs} value={formatCurrency(plannedMonthOutflowUzs)} tone="purple" />
                </div>
              </section>

              <div className="mb-5 grid gap-5 xl:grid-cols-[1fr_1fr]">
                <FlowSection
                  title={l.moneyCame}
                  total={totalInflow}
                  rows={cameRows}
                  emptyText={l.noData}
                />
                <FlowSection
                  title={l.moneyWent}
                  total={plannedMonthOutflowUzs}
                  rows={wentRows}
                  emptyText={l.noData}
                />
              </div>

              <section className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className="text-base font-black text-[#1F2937]">{l.methodFlow}</h2>
                  <span className="text-[11px] font-black uppercase tracking-wide text-[#9CA3AF]">{l.balance}</span>
                </div>
                {methodRows.length === 0 ? (
                  <p className="py-10 text-center text-sm font-bold text-[#9CA3AF]">{l.noData}</p>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {methodRows.map(row => (
                      <MethodCard
                        key={row.method}
                        row={row}
                        lang={lang}
                        labels={l}
                      />
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </AppShell>
  )
}

function Kpi({ icon: Icon, label, value, sub = '', tone = 'orange' }) {
  const tones = {
    green: 'bg-green-50 text-green-600',
    orange: 'bg-orange-50 text-[#ff5a00]',
    blue: 'bg-blue-50 text-blue-600',
    red: 'bg-red-50 text-red-600',
    purple: 'bg-purple-50 text-purple-600',
    gray: 'bg-slate-50 text-slate-600',
  }
  return (
    <div className="rounded-2xl border border-[#EEF2F6] bg-[#FBFCFE] p-4">
      <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${tones[tone] || tones.orange}`}>
        <Icon size={19} />
      </div>
      <p className="text-[11px] font-black uppercase tracking-wide text-[#9CA3AF]">{label}</p>
      <p className="mt-1 break-words text-xl font-black text-[#1F2937]">{value}</p>
      {sub && <p className="mt-1 text-xs font-bold text-[#9CA3AF]">{sub}</p>}
    </div>
  )
}

function FlowSection({ title, total, rows, emptyText }) {
  return (
    <section className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-black text-[#1F2937]">{title}</h2>
        <p className="text-sm font-black text-[#1F2937]">{formatCurrency(total)}</p>
      </div>
      {rows.length === 0 ? (
        <p className="py-10 text-center text-sm font-bold text-[#9CA3AF]">{emptyText}</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-[150px_1fr] md:items-center">
          <Donut rows={rows} total={total} />
          <div className="space-y-3">
            {rows.map(row => {
              const width = total > 0 ? Math.max(4, Math.round((row.amount / total) * 100)) : 0
              return (
                <div key={row.key}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate font-black text-[#374151]">{row.label}</span>
                    <span className="flex-shrink-0 font-black text-[#1F2937]">{formatCurrency(row.amount)}</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-[#F1F5F9]">
                    <div className="h-full rounded-full" style={{ width: `${width}%`, backgroundColor: row.color }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}

function Donut({ rows, total }) {
  let cursor = 0
  const gradient = rows.map(row => {
    const start = cursor
    const span = total > 0 ? (row.amount / total) * 100 : 0
    cursor += span
    return `${row.color} ${start}% ${cursor}%`
  }).join(', ')

  return (
    <div className="mx-auto flex h-[150px] w-[150px] items-center justify-center rounded-full" style={{ background: total > 0 ? `conic-gradient(${gradient})` : '#F1F5F9' }}>
      <div className="flex h-[96px] w-[96px] items-center justify-center rounded-full bg-white text-center shadow-inner">
        <span className="px-2 text-[11px] font-black uppercase tracking-wide text-[#9CA3AF]">
          {total > 0 ? '100%' : '—'}
        </span>
      </div>
    </div>
  )
}

function MethodCard({ row, lang, labels }) {
  const icons = {
    cash: Banknote,
    card: CreditCard,
    terminal: Monitor,
    qr: QrCode,
    loyalty_card: Tag,
  }
  const Icon = icons[row.method] || WalletCards
  const balance = row.inflow - row.outflow

  return (
    <div className="rounded-2xl border border-[#EEF2F6] bg-[#FBFCFE] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-sm font-black text-[#1F2937]">
          <Icon size={16} className="text-[#ff5a00]" />{methodLabel(row.method, lang)}
        </span>
        <span className={`text-base font-black ${balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {formatCurrency(balance)}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs font-bold">
        <div className="rounded-xl bg-green-50 px-3 py-2 text-green-700">
          <span className="block text-[10px] uppercase text-green-500">{labels.inflow}</span>
          {formatCurrency(row.inflow)}
        </div>
        <div className="rounded-xl bg-orange-50 px-3 py-2 text-[#ff5a00]">
          <span className="block text-[10px] uppercase text-orange-400">{labels.outflow}</span>
          {formatCurrency(row.outflow)}
        </div>
      </div>
    </div>
  )
}
