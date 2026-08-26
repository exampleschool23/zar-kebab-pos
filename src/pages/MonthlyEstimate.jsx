import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Banknote,
  CreditCard,
  Monitor,
  ReceiptText,
  RefreshCw,
  Tag,
  Users,
  WalletCards,
  Zap,
} from 'lucide-react'
import AppShell from '../components/AppShell'
import { OperationalError, OperationalLoading } from '../components/OperationalState'
import { getOrderRevenueTotal, isPaidOrder, matchesRange, toLocalDateStr } from '../lib/analytics'
import { formatLongDate } from '../lib/dateFormat'
import {
  buildSalaryBonusExpenseRows,
  buildFinalizedEmployeeMealExpenseRows,
  buildSalaryPaymentExpenseRows,
  addLocalDateDays,
  expensePaymentMethodLabel,
  getEmployeeMealExpenseEstimate,
  getEstimatedMonthlyExpenseSummary,
  getSelectedMonthSalaryOperatingSummary,
  normalizeExpenseEntryType,
  summarizeExpenses,
  summarizeIncomeEntries,
  todayExpenseDate,
} from '../lib/expenses'
import { formatCurrency } from '../lib/formatCurrency'
import { getMonthlyEstimateMethodRows } from '../lib/monthlyEstimate'
import { supabase } from '../lib/supabase'
import { useApp } from '../store/AppContext'
import { collectPagedRows, loadPaidOrdersForRange, mergePaidOrderHistory } from '../lib/orderHistory'

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

function composeSalaryProfiles(rows = [], rates = [], payments = [], bonuses = [], fines = [], absences = [], profiles = []) {
  const profileMap = Object.fromEntries(profiles.map(profile => [profile.id, profile]))
  return rows.map(row => ({
    ...row,
    profile: profileMap[row.profile_id] || null,
    rates: rates.filter(rate => rate.salary_profile_id === row.id),
    payments: payments.filter(payment => payment.salary_profile_id === row.id),
    bonuses: bonuses.filter(bonus => bonus.salary_profile_id === row.id),
    fines: fines.filter(fine => fine.salary_profile_id === row.id),
    absences: absences.filter(absence => absence.salary_profile_id === row.id),
  }))
}

function loadPagedResult(loadPage) {
  return collectPagedRows(loadPage)
    .then(data => ({ data, error: null }))
    .catch(error => ({ data: [], error }))
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

function methodLabel(method, lang) {
  if (['cash', 'card', 'terminal'].includes(method)) return expensePaymentMethodLabel(method, lang)
  if (method === 'loyalty_card') return lang === 'uz' ? 'Sodiqlik' : lang === 'ru' ? 'Лояльность' : 'Loyalty'
  return method || '—'
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
  const [employeeMealSnapshots, setEmployeeMealSnapshots] = useState([])
  const [paidHistoryOrders, setPaidHistoryOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const loadRequestRef = useRef(0)

  const L = {
    uz: {
      title: 'Oylik taxmin',
      sub: 'Tanlangan oyning haqiqiy daromad va xarajatlari',
      back: 'Buxgalteriyaga qaytish',
      refresh: 'Yangilash',
      currentMonth: 'Joriy oy',
      expectedMonthSpent: 'Tanlangan oy uchun jami kutilayotgan xarajat',
      expectedSalary: 'Bu oy yana to‘lanadigan maosh',
      salaryApplied: 'Shu oy maoshiga hisoblangan to‘lov',
      moneyCame: 'Pul qayerdan keldi',
      moneyWent: 'Pul qayerga ketdi',
      methodFlow: 'To‘lov turi bo‘yicha oqim',
      monthPlan: 'Oy rejasi',
      expenseBreakdown: 'Xarajatlar bir qarashda',
      salesRevenue: 'Kafe savdosi',
      loyaltyIncome: 'Loyallik daromadi',
      cafePaidIn: 'Kafedan kelgan pul',
      investorInvested: 'Investor kiritgan pul',
      investorSupport: 'Investor yordami',
      otherIncome: 'Boshqa daromad',
      salaryPaid: 'Xodimlarga to‘langan',
      productsSpent: 'Mahsulotlarga ketgan',
      salaryBonus: 'Bonuslar',
      salaryFines: 'Jarimalar',
      absenceDays: 'Kelmagan kunlar',
      salaryPlan: 'Oy uchun maosh',
      recordedExpenses: 'Yozilgan xarajatlar',
      salaryRemaining: 'Oy oxirigacha maosh',
      salaryArrears: 'Oldingi oylardan maosh qarzi',
      rentRemaining: 'To‘lanishi kerak ijara',
      rent: 'Ijara',
      rentPlan: 'Ijara rejasi',
      rentPaidAmount: 'Ijara to‘langan',
      utilities: 'Kommunal',
      utilitiesPlan: 'Kommunal rejasi',
      utilitiesPaid: 'Kommunal to‘langan',
      utilitiesRemaining: 'Kommunal to‘lanishi kerak',
      otherSpent: 'Boshqa xarajatlar',
      employeeMealsActual: 'Hisoblangan xodimlar ovqati',
      employeeMealsRemaining: 'Xodimlar ovqati oy oxirigacha',
      employeeDays: 'xodim-kun',
      payroll: 'Maosh va xodimlar',
      fixedBills: 'Doimiy to‘lovlar',
      operations: 'Operatsion xarajatlar',
      actualIn: 'Hozirgacha kirim',
      actualOut: 'Hozirgacha chiqim',
      netLeft: 'Hozirgi qoldiq',
      remainingCommitments: 'Oy oxirigacha to‘lovlar',
      projectedLeft: 'Barcha xarajatlardan keyin',
      plannedUzs: 'Oy oxirigacha UZS xarajat',
      paidOrders: 'To‘langan buyurtmalar',
      rentNote: 'Sozlamalarda belgilangan UZS ijara',
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
      sub: 'Фактические доходы и расходы выбранного месяца',
      back: 'Назад к бухгалтерии',
      refresh: 'Обновить',
      currentMonth: 'Текущий месяц',
      expectedMonthSpent: 'Ожидаемые расходы за выбранный месяц',
      expectedSalary: 'Ещё выплатить зарплаты за этот месяц',
      salaryApplied: 'Оплата в счёт зарплаты этого месяца',
      moneyCame: 'Откуда поступили деньги',
      moneyWent: 'На что ушли деньги',
      methodFlow: 'Движение по способам оплаты',
      monthPlan: 'План месяца',
      expenseBreakdown: 'Расходы одним взглядом',
      salesRevenue: 'Доход кафе',
      loyaltyIncome: 'Доход по лояльности',
      cafePaidIn: 'Пришло из кафе',
      investorInvested: 'Инвестор вложил',
      investorSupport: 'Поддержка инвестора',
      otherIncome: 'Прочие поступления',
      salaryPaid: 'Выплачено сотрудникам',
      productsSpent: 'Потрачено на продукты',
      salaryBonus: 'Бонусы',
      salaryFines: 'Штрафы',
      absenceDays: 'Дни отсутствия',
      salaryPlan: 'Зарплата за месяц',
      recordedExpenses: 'Учтённые расходы',
      salaryRemaining: 'Осталось выплатить зарплаты',
      salaryArrears: 'Долг по зарплате за прошлые месяцы',
      rentRemaining: 'Осталось оплатить аренду',
      rent: 'Аренда',
      rentPlan: 'План аренды',
      rentPaidAmount: 'Аренда оплачена',
      utilities: 'Коммуналка',
      utilitiesPlan: 'План коммуналки',
      utilitiesPaid: 'Коммуналка оплачена',
      utilitiesRemaining: 'Осталось оплатить коммуналку',
      otherSpent: 'Другие расходы',
      employeeMealsActual: 'Начисленное питание сотрудников',
      employeeMealsRemaining: 'Питание сотрудников до конца месяца',
      employeeDays: 'чел.-дн.',
      payroll: 'Зарплата и сотрудники',
      fixedBills: 'Постоянные платежи',
      operations: 'Операционные расходы',
      actualIn: 'Пришло до сегодня',
      actualOut: 'Ушло до сегодня',
      netLeft: 'Текущий остаток',
      remainingCommitments: 'Ещё оплатить до конца месяца',
      projectedLeft: 'Останется после всех расходов',
      plannedUzs: 'План расходов в UZS до конца месяца',
      paidOrders: 'Оплаченные заказы',
      rentNote: 'Аренда в UZS из настроек',
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
      sub: 'Actual income and expenses for the selected month',
      back: 'Back to accounting',
      refresh: 'Refresh',
      currentMonth: 'Current month',
      expectedMonthSpent: 'Expected expenses for selected month',
      expectedSalary: 'Salary still expected this month',
      salaryApplied: 'Payment applied to this month',
      moneyCame: 'Where money came from',
      moneyWent: 'Where money went',
      methodFlow: 'Flow by payment method',
      monthPlan: 'Month plan',
      expenseBreakdown: 'Expenses at a glance',
      salesRevenue: 'Cafe income',
      loyaltyIncome: 'Loyalty income',
      cafePaidIn: 'Came from cafe',
      investorInvested: 'Investor invested',
      investorSupport: 'Investor support',
      otherIncome: 'Other income',
      salaryPaid: 'Paid to employees',
      productsSpent: 'Spent on products',
      salaryBonus: 'Bonuses',
      salaryFines: 'Fines',
      absenceDays: 'Absence days',
      salaryPlan: 'Salary for month',
      recordedExpenses: 'Recorded expenses',
      salaryRemaining: 'Salary left this month',
      salaryArrears: 'Salary owed from prior months',
      rentRemaining: 'Rent still due',
      rent: 'Rent',
      rentPlan: 'Rent plan',
      rentPaidAmount: 'Rent paid',
      utilities: 'Utilities',
      utilitiesPlan: 'Utilities plan',
      utilitiesPaid: 'Utilities paid',
      utilitiesRemaining: 'Utilities still due',
      otherSpent: 'Other expenses',
      employeeMealsActual: 'Finalized employee meals',
      employeeMealsRemaining: 'Employee meals through month end',
      employeeDays: 'employee-days',
      payroll: 'Payroll and staff',
      fixedBills: 'Fixed bills',
      operations: 'Operating expenses',
      actualIn: 'In so far',
      actualOut: 'Out so far',
      netLeft: 'Current left',
      remainingCommitments: 'Still due by month end',
      projectedLeft: 'Left after all expenses',
      plannedUzs: 'UZS spend by month end',
      paidOrders: 'Paid orders',
      rentNote: 'UZS rent set in settings',
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
    const requestId = loadRequestRef.current + 1
    loadRequestRef.current = requestId
    setLoading(true)
    setError('')
    const [expenseResult, salaryProfileResult, salaryRateResult, salaryPaymentResult, salaryBonusResult, salaryFineResult, salaryAbsenceResult, teamResult, employeeMealResult, orderHistoryResult] = await Promise.all([
      loadPagedResult((from, to) => supabase
        .from('expenses')
        .select(SELECT_COLUMNS)
        .gte('expense_date', monthStart)
        .lte('expense_date', monthEnd)
        .order('expense_date')
        .order('id')
        .range(from, to)),
      loadPagedResult((from, to) => supabase.from('employee_salary_profiles').select('*').order('id').range(from, to)),
      loadPagedResult((from, to) => supabase.from('employee_salary_rates').select('*').order('id').range(from, to)),
      loadPagedResult((from, to) => supabase.from('employee_salary_payments').select('*').order('id').range(from, to)),
      loadPagedResult((from, to) => supabase.from('employee_salary_bonuses').select('*').order('id').range(from, to)),
      loadPagedResult((from, to) => supabase.from('employee_salary_fines').select('*').order('id').range(from, to)),
      loadPagedResult((from, to) => supabase.from('employee_salary_absences').select('*').order('id').range(from, to)),
      loadPagedResult((from, to) => supabase.from('profiles').select('id, full_name, email, role, status').order('id').range(from, to)),
      loadPagedResult((from, to) => supabase.from('employee_daily_meal_expenses').select('business_date, average_daily_amount, present_employee_count, total_amount, source_type, finalized_at, created_at').gte('business_date', monthStart).lte('business_date', monthEnd).order('business_date').range(from, to)),
      loadPaidOrdersForRange(monthStart, monthEnd)
        .then(data => ({ data, error: null }))
        .catch(error => ({ data: [], error })),
    ])
    if (requestId !== loadRequestRef.current) return

    if (expenseResult.error) {
      setExpenses([])
      setError(isMissingExpensesMigration(expenseResult.error) ? l.migrationMissing : expenseResult.error.message || l.loadFailed)
    } else {
      setExpenses(expenseResult.data || [])
    }
    if (orderHistoryResult.error) {
      setPaidHistoryOrders([])
      if (!expenseResult.error) setError(orderHistoryResult.error.message || l.loadFailed)
    } else {
      setPaidHistoryOrders(orderHistoryResult.data || [])
    }
    if (employeeMealResult.error) {
      setEmployeeMealSnapshots([])
      if (!expenseResult.error && !orderHistoryResult.error) {
        setError(employeeMealResult.error.message || l.loadFailed)
      }
    } else {
      setEmployeeMealSnapshots(employeeMealResult.data || [])
    }
    const salaryError = salaryProfileResult.error || salaryRateResult.error || salaryPaymentResult.error || salaryBonusResult.error || salaryAbsenceResult.error
    if (salaryError) {
      setSalaryProfiles([])
      if (!expenseResult.error) {
        setError(isMissingSalaryMigration(salaryError) ? l.migrationMissing : salaryError.message || l.loadFailed)
      }
    } else {
      if (salaryFineResult.error && !expenseResult.error) {
        setError(isMissingSalaryMigration(salaryFineResult.error) ? l.migrationMissing : salaryFineResult.error.message || l.loadFailed)
      }
      setSalaryProfiles(composeSalaryProfiles(
        salaryProfileResult.data || [],
        salaryRateResult.data || [],
        salaryPaymentResult.data || [],
        salaryBonusResult.data || [],
        salaryFineResult.error ? [] : salaryFineResult.data || [],
        salaryAbsenceResult.data || [],
        teamResult.data || [],
      ))
    }
    setLoading(false)
  }

  useEffect(() => {
    loadEstimate()
    return () => { loadRequestRef.current += 1 }
  }, [monthStart, monthEnd]) // eslint-disable-line react-hooks/exhaustive-deps

  const cutoffEnd = actualThroughDate < monthStart ? monthStart : actualThroughDate
  const accountingOrders = useMemo(
    () => mergePaidOrderHistory(paidHistoryOrders, state.orders, monthStart, cutoffEnd),
    [paidHistoryOrders, state.orders, monthStart, cutoffEnd]
  )
  const paidOrders = useMemo(() => (
    accountingOrders.filter(order => isPaidOrder(order) && matchesRange(order, monthStart, cutoffEnd))
  ), [accountingOrders, monthStart, cutoffEnd])

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
    getEstimatedMonthlyExpenseSummary(salaryProfiles, cutoffEnd, {
      monthlyRentUzs: state.settings?.monthlyRentUzs || 0,
      monthlyUtilitiesUzs: state.settings?.monthlyUtilitiesUzs || 0,
    })
  ), [salaryProfiles, cutoffEnd, state.settings?.monthlyRentUzs, state.settings?.monthlyUtilitiesUzs])
  const salaryOperatingSummary = useMemo(() => (
    getSelectedMonthSalaryOperatingSummary(salaryProfiles, cutoffEnd)
  ), [salaryProfiles, cutoffEnd])
  const finalizedEmployeeMealRows = useMemo(() => (
    buildFinalizedEmployeeMealExpenseRows(employeeMealSnapshots)
      .filter(row => row.expense_date <= cutoffEnd)
  ), [employeeMealSnapshots, cutoffEnd])
  const mealForecastStart = today < monthStart
    ? monthStart
    : today > monthEnd
      ? addLocalDateDays(monthEnd, 1)
      : today
  const employeeMealEstimate = useMemo(() => (
    getEmployeeMealExpenseEstimate(
      salaryProfiles,
      mealForecastStart,
      monthEnd,
      state.settings?.averageDailyEmployeeMealUzs || 0,
    )
  ), [salaryProfiles, mealForecastStart, monthEnd, state.settings?.averageDailyEmployeeMealUzs])
  const salesRevenue = paidOrders.reduce((sum, order) => sum + getOrderRevenueTotal(order), 0)
  const incomeSummary = summarizeIncomeEntries(incomeEntries)
  const allActualExpenseRows = [...salaryPaymentRows, ...salaryBonusRows, ...finalizedEmployeeMealRows, ...manualExpenseRows]
  const actualExpenseSummary = summarizeExpenses(allActualExpenseRows)
  const salaryPaymentTotal = summarizeExpenses(salaryPaymentRows).total
  const salaryBonusTotal = summarizeExpenses(salaryBonusRows).total
  const employeeMealActualTotal = summarizeExpenses(finalizedEmployeeMealRows).total
  const recordedExpenseTotal = summarizeExpenses(manualExpenseRows).total
  const investorInvestedTotal = incomeSummary.byCategory.investor_support || 0
  const productsSpentTotal = actualExpenseSummary.byCategory.products_bazaar || 0
  const recordedRentTotal = actualExpenseSummary.byCategory.rent || 0
  const recordedUtilitiesTotal = actualExpenseSummary.byCategory.utilities || 0
  const otherRecordedExpenseTotal = Math.max(
    0,
    recordedExpenseTotal - productsSpentTotal - recordedRentTotal - recordedUtilitiesTotal,
  )
  const absenceDaysTotal = salaryProfiles.reduce((sum, profile) => (
    sum + (profile.absences || []).filter(absence => {
      const date = String(absence.absence_date || '').slice(0, 10)
      return date >= monthStart && date <= cutoffEnd
    }).length
  ), 0)
  const salaryFineTotal = salaryProfiles.reduce((sum, profile) => (
    sum + (profile.fines || []).reduce((profileSum, fine) => {
      const date = String(fine.fine_date || '').slice(0, 10)
      return date >= monthStart && date <= cutoffEnd
        ? profileSum + Math.max(0, Math.round(Number(fine.amount) || 0))
        : profileSum
    }, 0)
  ), 0)
  const totalInflow = salesRevenue + incomeSummary.total
  const totalOutflow = actualExpenseSummary.total
  const salaryExpectedRemaining = salaryOperatingSummary.remainingSalary
  const rentExpectedRemaining = Math.max(0, monthlyEstimate.monthlyRentUzs - recordedRentTotal)
  const utilitiesExpectedRemaining = Math.max(0, monthlyEstimate.monthlyUtilitiesUzs - recordedUtilitiesTotal)
  const expectedMonthOutflow = totalOutflow
    - salaryPaymentTotal
    + salaryOperatingSummary.expectedSalaryCost
    + rentExpectedRemaining
    + utilitiesExpectedRemaining
    + employeeMealEstimate.total

  const cameRows = [
    { key: 'sales', label: l.salesRevenue, amount: salesRevenue, color: '#16A34A' },
    { key: 'investor', label: l.investorSupport, amount: investorInvestedTotal, color: '#7C3AED' },
    { key: 'other-income', label: l.otherIncome, amount: Math.max(0, incomeSummary.total - investorInvestedTotal), color: '#2563EB' },
  ].filter(row => row.amount > 0)

  const wentRows = [
    { key: 'salary-paid', label: l.salaryPaid, amount: salaryPaymentTotal, color: '#2563EB' },
    { key: 'salary-bonus', label: l.salaryBonus, amount: salaryBonusTotal, color: '#9333EA' },
    { key: 'products', label: l.productsSpent, amount: productsSpentTotal, color: '#F97316' },
    { key: 'employee-meals', label: l.employeeMealsActual, amount: employeeMealActualTotal, color: '#EA580C' },
    { key: 'other-recorded', label: l.otherSpent, amount: otherRecordedExpenseTotal, color: '#64748B' },
    { key: 'rent-paid', label: l.rentPaidAmount, amount: recordedRentTotal, color: '#0F766E' },
    { key: 'utilities-paid', label: l.utilitiesPaid, amount: recordedUtilitiesTotal, color: '#CA8A04' },
  ].filter(row => row.amount > 0)

  const expenseBreakdownCards = [
    {
      key: 'payroll',
      icon: Users,
      title: l.payroll,
      total: salaryOperatingSummary.expectedSalaryCost + salaryBonusTotal,
      tone: 'blue',
      rows: [
        { label: l.salaryPlan, value: formatCurrency(salaryOperatingSummary.projectedSalary) },
        { label: l.salaryApplied, value: formatCurrency(salaryOperatingSummary.appliedPayments) },
        { label: l.salaryBonus, value: formatCurrency(salaryBonusTotal), accent: 'text-purple-600' },
        { label: l.expectedSalary, value: formatCurrency(salaryExpectedRemaining), accent: salaryExpectedRemaining > 0 ? 'text-blue-600' : 'text-green-600' },
        { label: l.salaryFines, value: `− ${formatCurrency(salaryFineTotal)}`, accent: 'text-red-600' },
        { label: l.absenceDays, value: String(absenceDaysTotal), accent: 'text-violet-600' },
      ],
    },
    {
      key: 'fixed-bills',
      icon: Zap,
      title: l.fixedBills,
      total: recordedRentTotal + rentExpectedRemaining + recordedUtilitiesTotal + utilitiesExpectedRemaining,
      tone: 'teal',
      rows: [
        { label: l.rentPaidAmount, value: formatCurrency(recordedRentTotal) },
        { label: l.rentRemaining, value: formatCurrency(rentExpectedRemaining), accent: rentExpectedRemaining > 0 ? 'text-teal-600' : 'text-green-600' },
        { label: l.utilitiesPaid, value: formatCurrency(recordedUtilitiesTotal) },
        { label: l.utilitiesRemaining, value: formatCurrency(utilitiesExpectedRemaining), accent: utilitiesExpectedRemaining > 0 ? 'text-amber-600' : 'text-green-600' },
      ],
    },
    {
      key: 'operations',
      icon: ReceiptText,
      title: l.operations,
      total: productsSpentTotal + otherRecordedExpenseTotal + employeeMealActualTotal + employeeMealEstimate.total,
      tone: 'orange',
      rows: [
        { label: l.productsSpent, value: formatCurrency(productsSpentTotal) },
        { label: l.otherSpent, value: formatCurrency(otherRecordedExpenseTotal) },
        { label: l.employeeMealsActual, value: formatCurrency(employeeMealActualTotal), accent: 'text-orange-700' },
        {
          label: `${l.employeeMealsRemaining} · ${employeeMealEstimate.presentEmployeeDays} ${l.employeeDays}`,
          value: formatCurrency(employeeMealEstimate.total),
          accent: employeeMealEstimate.total > 0 ? 'text-orange-600' : 'text-green-600',
        },
      ],
    },
  ]

  const methodRows = useMemo(() => {
    return getMonthlyEstimateMethodRows(paidOrders, incomeEntries, allActualExpenseRows)
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
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-black text-[#1F2937]">{l.expenseBreakdown}</h2>
                  <div className="text-right">
                    <p className="text-xs font-black text-[#6B7280]">{l.expectedMonthSpent}: {formatCurrency(expectedMonthOutflow)}</p>
                    <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-[#9CA3AF]">
                      {formatLongDate(monthStart, lang, monthStart)} - {formatLongDate(monthEnd, lang, monthEnd)}
                    </p>
                  </div>
                </div>
                <div className="grid gap-3 lg:grid-cols-3">
                  {expenseBreakdownCards.map(card => <BreakdownCard key={card.key} {...card} />)}
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
                  total={totalOutflow}
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

function BreakdownCard({ icon: Icon, title, total, rows, tone = 'orange' }) {
  const tones = {
    blue: 'bg-blue-50 text-blue-600',
    teal: 'bg-teal-50 text-teal-600',
    orange: 'bg-orange-50 text-[#ff5a00]',
  }
  return (
    <article className="rounded-2xl border border-[#EEF2F6] bg-[#FBFCFE] p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${tones[tone] || tones.orange}`}>
            <Icon size={17} />
          </span>
          <h3 className="text-sm font-black text-[#1F2937]">{title}</h3>
        </div>
        <span className="flex-shrink-0 text-sm font-black text-[#1F2937]">{formatCurrency(total)}</span>
      </div>
      <div className="divide-y divide-[#E5E7EB]">
        {rows.map(row => (
          <div key={row.label} className="flex items-center justify-between gap-3 py-2 text-xs">
            <span className="min-w-0 font-bold text-[#6B7280]">{row.label}</span>
            <span className={`flex-shrink-0 font-black tabular-nums ${row.accent || 'text-[#1F2937]'}`}>{row.value}</span>
          </div>
        ))}
      </div>
    </article>
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
    loyalty_card: Tag,
  }
  const Icon = icons[row.method] || WalletCards
  const balance = row.inflow - row.outflow
  const isLoyaltyIncome = row.method === 'loyalty_card'

  return (
    <div className="rounded-2xl border border-[#EEF2F6] bg-[#FBFCFE] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-sm font-black text-[#1F2937]">
          <Icon size={16} className="text-[#ff5a00]" />{isLoyaltyIncome ? labels.loyaltyIncome : methodLabel(row.method, lang)}
        </span>
        <span className={`text-base font-black ${isLoyaltyIncome || balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {formatCurrency(isLoyaltyIncome ? row.inflow : balance)}
        </span>
      </div>
      {!isLoyaltyIncome && <div className="grid grid-cols-2 gap-2 text-xs font-bold">
        <div className="rounded-xl bg-green-50 px-3 py-2 text-green-700">
          <span className="block text-[10px] uppercase text-green-500">{labels.inflow}</span>
          {formatCurrency(row.inflow)}
        </div>
        <div className="rounded-xl bg-orange-50 px-3 py-2 text-[#ff5a00]">
          <span className="block text-[10px] uppercase text-orange-400">{labels.outflow}</span>
          {formatCurrency(row.outflow)}
        </div>
      </div>}
    </div>
  )
}
