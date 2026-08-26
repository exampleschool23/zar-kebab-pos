import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Banknote,
  BadgeDollarSign,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock3,
  CreditCard,
  HandCoins,
  Loader2,
  Plus,
  ReceiptText,
  RefreshCw,
  Tag,
  Users,
  Terminal,
  Trash2,
  UtensilsCrossed,
  WalletCards,
  ShoppingBasket,
} from 'lucide-react'
import AppShell from '../components/AppShell'
import DateRangePicker from '../components/DateRangePicker'
import { OperationalLoading } from '../components/OperationalState'
import { supabase } from '../lib/supabase'
import { useApp } from '../store/AppContext'
import { useAuth } from '../contexts/AuthContext'
import { canEditFeature } from '../lib/permissions'
import {
  collapseDailyBazaarExpenseRows,
  getAccountingPageSummaryFromOrderSummary,
  getAccountingQuickRange,
} from '../lib/accounting'
import { loadAccountingPaidOrderSummary } from '../lib/accountingSummary'
import { formatCurrency, formatCurrencyWithPercentage } from '../lib/formatCurrency'
import { formatLongDate, formatTime } from '../lib/dateFormat'
import { formatMoneyInput, normalizeMoneyInput } from '../lib/moneyInput'
import {
  EXPENSE_CATEGORIES,
  EXPENSE_ENTRY_TYPES,
  EXPENSE_PAYMENT_METHODS,
  INCOME_CATEGORIES,
  MANUAL_EXPENSE_CATEGORIES,
  buildEmployeeMealExpenseRows,
  buildSalaryBonusExpenseRows,
  buildSalaryPaymentExpenseRows,
  expenseCategoryLabel,
  expenseDescriptionLabel,
  expensePaymentMethodLabel,
  getExpenseHistoryDeleteTarget,
  getSalaryMonthEndDate,
  getTotalSalaryDue,
  normalizeExpenseAmount,
  normalizeExpenseEntryType,
  todayExpenseDate,
} from '../lib/expenses'
import { collectPagedRows } from '../lib/orderHistory'
import { notifyTelegramInvestorExpense } from '../lib/telegramNotifications'

const SELECT_COLUMNS = 'id, entry_type, expense_date, category, payment_method, amount, vendor, description, created_by, created_by_name, created_at, updated_at'
const FIELD_INPUT_CLASS = 'h-11 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm font-semibold text-[#1F2937] outline-none transition-colors focus:border-[#ff5a00] focus:ring-2 focus:ring-orange-100 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500'
const DATE_INPUT_CLASS = `${FIELD_INPUT_CLASS} text-transparent caret-transparent`
const ACCOUNTING_SECTION_GRID = 'grid items-start gap-5 lg:grid-cols-2'
const HISTORY_SECTION_GRID = 'grid items-stretch gap-5 lg:grid-cols-2'

async function notifyInvestorIncome(expenseId) {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token || ''
  const response = await fetch('/api/telegram/employee-notification', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ type: 'investor_income', expenseId }),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || !data.ok) throw new Error(data.error || 'Investor notification failed')
  return data
}

function methodIcon(method) {
  if (method === 'card') return CreditCard
  if (method === 'terminal') return Terminal
  if (method === 'loyalty_card') return Tag
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

function DateInput({ value, lang, onChange, className = DATE_INPUT_CLASS, disabled = false }) {
  const inputRef = useRef(null)

  function openPicker(event) {
    if (disabled) return
    if (event?.button && event.button !== 0) return
    const input = inputRef.current
    if (!input) return

    input.focus()
    if (typeof input.showPicker === 'function') {
      try {
        input.showPicker()
        return
      } catch {
        // Fall back to focusing when showPicker is unavailable or blocked.
      }
    }
  }

  return (
    <div className={`relative ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`} onPointerDown={openPicker}>
      <span className="pointer-events-none absolute inset-y-0 left-3 right-9 flex items-center overflow-hidden text-ellipsis whitespace-nowrap text-sm font-semibold text-[#1F2937]">
        {formatLongDate(value, lang, value)}
      </span>
      <input
        ref={inputRef}
        type="date"
        value={value}
        aria-label={formatLongDate(value, lang, value)}
        onChange={event => onChange(event.target.value)}
        className={`native-date-input cursor-pointer ${className}`}
        disabled={disabled}
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

export default function Expenses() {
  const { state } = useApp()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const lang = state.lang || 'ru'
  const role = (profile?.role || state.user?.role || 'guest').toLowerCase()
  const canAdd = canEditFeature(profile || { role }, 'expenses')
  const canDelete = canEditFeature(profile || { role }, 'expenses')

  const [dateFrom, setDateFrom] = useState(() => todayExpenseDate().slice(0, 8) + '01')
  const [dateTo, setDateTo] = useState(() => todayExpenseDate())
  const [activeRangeKey, setActiveRangeKey] = useState('month')
  const [expenses, setExpenses] = useState([])
  const [salaryProfiles, setSalaryProfiles] = useState([])
  const [paidOrderSummary, setPaidOrderSummary] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState('')
  const [deletingExpenseId, setDeletingExpenseId] = useState('')
  const loadRequestRef = useRef(0)
  const [form, setForm] = useState({
    entry_type: 'expense',
    expense_date: todayExpenseDate(),
    category: 'charcoal',
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
      cafeIncome: 'Kafe daromadi',
      loyaltyIncome: 'Loyallik daromadi',
      netProfit: 'Sof foyda',
      netProfitSub: 'Kafe daromadi minus sotilgan mahsulot tannarxi',
      avgDailyCafeIncome: "Kafe o'rtacha kunlik daromadi",
      periodCafeIncome: 'Tanlangan davr kafe daromadi',
      investorSupportSub: 'Investor kiritgan yordam',
      otherIncomeSub: 'Boshqa daromad',
      investorSupport: 'Investor yordami',
      expenses: 'Xarajatlar',
      employeeMeals: 'Xodimlar ovqatining o‘rtacha qiymati',
      employeeMealsSub: 'Davomat bo‘yicha hisoblangan',
      left: 'Qolgan pul',
      add: 'Xarajat qo‘shish',
      addIncome: 'Investor yordamini qo‘shish',
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
      salaries: 'Maoshlar',
      salaryDue: 'Hozirgi maosh qarzi',
      salaryDueAsOf: 'Hisoblangan sana',
      salaryDueMonthEnd: 'Oy oxirigacha maosh qarzi',
      salaryDueProjection: 'Prognoz sanasi',
      estimate: 'Taxmin',
      dailyBazaar: 'Kunlik bozor',
      period: 'Hisobot davri',
      periodHelp: 'Quyidagi barcha ko‘rsatkichlar va tarix tanlangan davrga tegishli.',
      overview: 'Moliyaviy ko‘rinish',
      overviewHelp: 'Kafe daromadi, xarajatlar va qolgan mablag‘ bir joyda.',
      operations: 'Yozuv va tahlil',
      operationsHelp: 'Yangi operatsiyani yozing va pul qayerga ketayotganini ko‘ring.',
      recentActivity: 'So‘nggi operatsiyalar',
      recentActivityHelp: 'Investor yordami va xarajatlar yonma-yon ko‘rsatiladi.',
      recordExpenseHelp: 'Kafedan chiqqan pulni yozing.',
      recordIncomeHelp: 'Investordan olingan yordamni yozing.',
      expenseSaved: 'Xarajat saqlandi',
      incomeSaved: 'Daromad saqlandi',
      today: 'Bugun',
      yesterday: 'Kecha',
      week: '7 kun',
      month: 'Oy',
      previousMonth: 'O‘tgan oy',
      presets: 'Tayyor davrlar',
      previousWeek: 'O‘tgan hafta',
      previousCurrentWeek: 'O‘tgan va joriy hafta',
      currentWeek: 'Joriy hafta',
      currentNextWeek: 'Joriy va keyingi hafta',
      nextWeek: 'Keyingi hafta',
      nextMonth: 'Keyingi oy',
      applyRange: 'Davrni qo‘llash',
      cancel: 'Bekor qilish',
      selectDateRange: 'Sana oralig‘ini tanlash',
      weekdays: ['Du', 'Se', 'Cho', 'Pa', 'Ju', 'Sha', 'Ya'],
      from: 'Dan',
      to: 'Gacha',
      methodBalances: 'To‘lov turi qoldig‘i',
      methodBalancesHint: 'Kirim minus chiqim',
      moneyFlow: 'Pul qayerga ketmoqda',
      incomeSources: 'Qo‘shimcha daromad manbalari',
      incomeIn: 'Kirdi',
      spentOut: 'Chiqdi',
      remaining: 'Qoldi',
      investorHistory: 'Investor yordami',
      history: 'Xarajatlar tarixi',
      more: 'Batafsil',
      seeAll: 'Barchasini ko‘rish',
      showLess: 'Kamroq ko‘rsatish',
      empty: 'Bu davrda xarajat yozilmagan',
      emptyInvestor: 'Bu davrda investor yordami yo‘q',
      investorNotificationFailed: 'Investor yordami saqlandi, lekin ZarKebab Investor guruhiga xabar yuborilmadi.',
      expenseNotificationFailed: 'Xarajat saqlandi, lekin ZarKebab Investor guruhiga xabar yuborilmadi.',
      salaryBonus: 'Maosh bonusi',
      required: 'Sana, kategoriya, to‘lov turi va summa kerak.',
      saveFailed: 'Xarajatni saqlab bo‘lmadi.',
      loadFailed: 'Xarajatlarni yuklab bo‘lmadi.',
      migrationMissing: 'Xarajatlar jadvali hali bazada tayyor emas. Supabase SQL editorida supabase/048_expenses.sql va supabase/059_expense_income_entries.sql migratsiyalarini ishga tushiring.',
      salaryMigrationMissing: 'Maosh jadvallari yangilanmagan. Supabase SQL editorida employee_salary migratsiyalarini va supabase/099_employee_salary_fines.sql ni ishga tushiring.',
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
      cafeIncome: 'Доход кафе',
      loyaltyIncome: 'Доход по лояльности',
      netProfit: 'Чистая прибыль',
      netProfitSub: 'Доход кафе минус себестоимость проданных товаров',
      avgDailyCafeIncome: 'Среднедневной доход кафе',
      periodCafeIncome: 'Доход кафе за выбранный период',
      investorSupportSub: 'Помощь, внесённая инвестором',
      otherIncomeSub: 'Другой доход',
      investorSupport: 'Поддержка инвестора',
      expenses: 'Расходы',
      employeeMeals: 'Среднее питание сотрудников',
      employeeMealsSub: 'Рассчитано по посещаемости',
      left: 'Остаток',
      add: 'Добавить расход',
      addIncome: 'Добавить поддержку инвестора',
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
      salaries: 'Зарплаты',
      salaryDue: 'Долг по зарплате сейчас',
      salaryDueAsOf: 'На дату',
      salaryDueMonthEnd: 'Долг по зарплате к концу месяца',
      salaryDueProjection: 'Прогноз на',
      estimate: 'Прогноз',
      dailyBazaar: 'Ежедневный базар',
      period: 'Отчётный период',
      periodHelp: 'Все показатели и история ниже относятся к выбранному периоду.',
      overview: 'Финансовый обзор',
      overviewHelp: 'Доход кафе, расходы и остаток собраны в одном месте.',
      operations: 'Запись и анализ',
      operationsHelp: 'Запишите новую операцию и посмотрите, куда уходят деньги.',
      recentActivity: 'Последние операции',
      recentActivityHelp: 'Поддержка инвестора и расходы показаны рядом.',
      recordExpenseHelp: 'Запишите деньги, которые были потрачены из кассы кафе.',
      recordIncomeHelp: 'Запишите поддержку, полученную от инвестора.',
      expenseSaved: 'Расход сохранён',
      incomeSaved: 'Доход сохранён',
      today: 'Сегодня',
      yesterday: 'Вчера',
      week: '7 дней',
      month: 'Месяц',
      previousMonth: 'Прошлый месяц',
      presets: 'Готовые периоды',
      previousWeek: 'Прошлая неделя',
      previousCurrentWeek: 'Прошлая и текущая неделя',
      currentWeek: 'Текущая неделя',
      currentNextWeek: 'Текущая и следующая неделя',
      nextWeek: 'Следующая неделя',
      nextMonth: 'Следующий месяц',
      applyRange: 'Применить период',
      cancel: 'Отмена',
      selectDateRange: 'Выбрать период',
      weekdays: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
      from: 'С',
      to: 'По',
      methodBalances: 'Остаток по способам оплаты',
      methodBalancesHint: 'Приход минус расход',
      moneyFlow: 'Куда уходят деньги',
      incomeSources: 'Источники внешнего дохода',
      incomeIn: 'Приход',
      spentOut: 'Расход',
      remaining: 'Остаток',
      investorHistory: 'Поддержка инвестора',
      history: 'История расходов',
      more: 'Подробнее',
      seeAll: 'Показать все',
      showLess: 'Свернуть',
      empty: 'За этот период расходов нет',
      emptyInvestor: 'За этот период поддержки инвестора нет',
      investorNotificationFailed: 'Поддержка инвестора сохранена, но сообщение в группу ZarKebab Investor не отправлено.',
      expenseNotificationFailed: 'Расход сохранён, но сообщение в группу ZarKebab Investor не отправлено.',
      salaryBonus: 'Бонус к зарплате',
      required: 'Нужны дата, категория, способ оплаты и сумма.',
      saveFailed: 'Не удалось сохранить расход.',
      loadFailed: 'Не удалось загрузить расходы.',
      migrationMissing: 'Таблица расходов ещё не готова в базе. Запустите supabase/048_expenses.sql и supabase/059_expense_income_entries.sql в Supabase SQL Editor.',
      salaryMigrationMissing: 'Таблицы зарплат не обновлены. Запустите миграции employee_salary и supabase/099_employee_salary_fines.sql в Supabase SQL Editor.',
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
      cafeIncome: 'Cafe income',
      loyaltyIncome: 'Loyalty income',
      netProfit: 'Net Profit',
      netProfitSub: 'Cafe income minus cost of sold items',
      avgDailyCafeIncome: 'Avg daily cafe income',
      periodCafeIncome: 'Selected period cafe income',
      investorSupportSub: 'Investor support entries',
      otherIncomeSub: 'Other income',
      investorSupport: 'Investor support',
      expenses: 'Expenses',
      employeeMeals: 'Avg employees meal',
      employeeMealsSub: 'Calculated from attendance',
      left: 'Left',
      add: 'Add expense',
      addIncome: 'Add investor support',
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
      salaries: 'Salaries',
      salaryDue: 'Salary due now',
      salaryDueAsOf: 'As of',
      salaryDueMonthEnd: 'Salary due by month end',
      salaryDueProjection: 'Projected for',
      estimate: 'Estimate',
      dailyBazaar: 'Daily bazaar',
      period: 'Reporting period',
      periodHelp: 'All totals and history below use the selected period.',
      overview: 'Financial overview',
      overviewHelp: 'Cafe income, expenses, and remaining money in one place.',
      operations: 'Record and analyse',
      operationsHelp: 'Record a new transaction and see where the money is going.',
      recentActivity: 'Recent activity',
      recentActivityHelp: 'Investor support and expenses are shown side by side.',
      recordExpenseHelp: 'Record money spent from the cafe.',
      recordIncomeHelp: 'Record support received from an investor.',
      expenseSaved: 'Expense saved',
      incomeSaved: 'Income saved',
      today: 'Today',
      yesterday: 'Yesterday',
      week: '7 days',
      month: 'Month',
      previousMonth: 'Previous month',
      presets: 'Presets',
      previousWeek: 'Previous week',
      previousCurrentWeek: 'Previous & current week',
      currentWeek: 'Current week',
      currentNextWeek: 'Current & next week',
      nextWeek: 'Next week',
      nextMonth: 'Next month',
      applyRange: 'Apply range',
      cancel: 'Cancel',
      selectDateRange: 'Select date range',
      weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      from: 'From',
      to: 'To',
      methodBalances: 'Left by payment method',
      methodBalancesHint: 'In minus out',
      moneyFlow: 'Where money is going',
      incomeSources: 'Other income sources',
      incomeIn: 'In',
      spentOut: 'Out',
      remaining: 'Left',
      investorHistory: 'Investor support',
      history: 'Expense history',
      more: 'More',
      seeAll: 'See all',
      showLess: 'Show less',
      empty: 'No expenses in this period',
      emptyInvestor: 'No investor support in this period',
      investorNotificationFailed: 'Investor support was saved, but the ZarKebab Investor group notification was not sent.',
      expenseNotificationFailed: 'The expense was saved, but the ZarKebab Investor group notification was not sent.',
      salaryBonus: 'Salary bonus',
      required: 'Date, category, payment method, and amount are required.',
      saveFailed: 'Could not save expense.',
      loadFailed: 'Could not load expenses.',
      migrationMissing: 'Expenses table is not ready yet. Run supabase/048_expenses.sql and supabase/059_expense_income_entries.sql in Supabase SQL Editor.',
      salaryMigrationMissing: 'Salary tables are not up to date. Run the employee_salary migrations and supabase/099_employee_salary_fines.sql in Supabase SQL Editor.',
      automaticSalary: 'Salary payment',
      delete: 'Delete',
      confirmDelete: 'Confirm',
      deleteFailed: 'Could not delete expense.',
      readOnly: 'This role can view only.',
    },
  }
  const l = L[lang] || L.en
  const categoryOptions = form.entry_type === 'income' ? INCOME_CATEGORIES : MANUAL_EXPENSE_CATEGORIES
  const formGuidance = form.entry_type === 'income' ? l.recordIncomeHelp : l.recordExpenseHelp
  const canSubmitExpense = canAdd && !saving && Boolean(
    form.expense_date &&
    form.category &&
    form.payment_method &&
    normalizeExpenseAmount(form.amount) > 0
  )

  async function loadExpenses() {
    const requestId = loadRequestRef.current + 1
    loadRequestRef.current = requestId
    setLoading(true)
    setPaidOrderSummary({})
    setError('')
    const expensePromise = loadPagedResult((from, to) => supabase
        .from('expenses')
        .select(SELECT_COLUMNS)
        .gte('expense_date', dateFrom)
        .lte('expense_date', dateTo)
        .order('expense_date', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id')
        .range(from, to))
    const salaryPromise = Promise.all([
      loadPagedResult((from, to) => supabase.from('employee_salary_profiles').select('*').order('id').range(from, to)),
      loadPagedResult((from, to) => supabase.from('employee_salary_rates').select('*').order('id').range(from, to)),
      loadPagedResult((from, to) => supabase.from('employee_salary_payments').select('*').order('id').range(from, to)),
      loadPagedResult((from, to) => supabase.from('employee_salary_bonuses').select('*').order('id').range(from, to)),
      loadPagedResult((from, to) => supabase.from('employee_salary_fines').select('*').order('id').range(from, to)),
      loadPagedResult((from, to) => supabase.from('employee_salary_absences').select('*').order('id').range(from, to)),
      loadPagedResult((from, to) => supabase.from('profiles').select('id, full_name, email, role, status').order('id').range(from, to)),
    ])
    const fallbackMenuItemMap = Object.fromEntries(state.menuItems.map(item => [item.id, item]))
    const orderPromise = loadAccountingPaidOrderSummary(dateFrom, dateTo, { fallbackMenuItemMap })
      .then(data => ({ data, error: null }))
      .catch(error => ({ data: {}, error }))

    const [
      expenseResult,
      orderHistoryResult,
      [salaryProfileResult, salaryRateResult, salaryPaymentResult, salaryBonusResult, salaryFineResult, salaryAbsenceResult, teamResult],
    ] = await Promise.all([expensePromise, orderPromise, salaryPromise])
    if (requestId !== loadRequestRef.current) return

    let loadError = ''
    if (expenseResult.error) {
      loadError = isMissingExpensesMigration(expenseResult.error)
        ? l.migrationMissing
        : expenseResult.error.message || l.loadFailed
      setExpenses([])
    } else {
      setExpenses(expenseResult.data || [])
    }

    if (orderHistoryResult.error) {
      setPaidOrderSummary({})
      loadError ||= orderHistoryResult.error.message || l.loadFailed
    } else {
      setPaidOrderSummary(orderHistoryResult.data || {})
    }

    const salaryError = salaryProfileResult.error
      || salaryRateResult.error
      || salaryPaymentResult.error
      || salaryBonusResult.error
      || salaryAbsenceResult.error
    if (salaryError) {
      setSalaryProfiles([])
      loadError ||= isMissingSalaryMigration(salaryError)
        ? l.salaryMigrationMissing
        : salaryError.message || l.loadFailed
    } else {
      if (salaryFineResult.error) {
        loadError ||= isMissingSalaryMigration(salaryFineResult.error)
          ? l.salaryMigrationMissing
          : salaryFineResult.error.message || l.loadFailed
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

    setError(loadError)
    setLoading(false)
  }

  useEffect(() => {
    loadExpenses()
    return () => { loadRequestRef.current += 1 }
  }, [dateFrom, dateTo]) // eslint-disable-line react-hooks/exhaustive-deps

  const salaryExpenses = useMemo(() => (
    buildSalaryPaymentExpenseRows(salaryProfiles, dateFrom, dateTo)
      .map(row => ({ ...row, description: l.automaticSalary }))
      .sort((a, b) => b.expense_date.localeCompare(a.expense_date) || String(a.vendor || '').localeCompare(String(b.vendor || '')))
  ), [salaryProfiles, dateFrom, dateTo, l.automaticSalary])
  const salaryBonusExpenses = useMemo(() => (
    buildSalaryBonusExpenseRows(salaryProfiles, dateFrom, dateTo)
      .sort((a, b) => b.expense_date.localeCompare(a.expense_date) || String(a.vendor || '').localeCompare(String(b.vendor || '')))
  ), [salaryProfiles, dateFrom, dateTo])

  const employeeMealExpenses = useMemo(() => (
    buildEmployeeMealExpenseRows(
      salaryProfiles,
      dateFrom,
      dateTo < todayExpenseDate() ? dateTo : todayExpenseDate(),
      state.settings?.averageDailyEmployeeMealUzs,
    )
  ), [salaryProfiles, dateFrom, dateTo, state.settings?.averageDailyEmployeeMealUzs])

  const allExpenses = useMemo(() => (
    [...salaryExpenses, ...salaryBonusExpenses, ...employeeMealExpenses, ...expenses]
      .sort((a, b) => (
        b.expense_date.localeCompare(a.expense_date) ||
        String(b.created_at || '').localeCompare(String(a.created_at || ''))
      ))
  ), [salaryExpenses, salaryBonusExpenses, employeeMealExpenses, expenses])

  const filteredExpenses = allExpenses

  const filteredInvestorSupport = useMemo(() => (
    filteredExpenses.filter(expense => (
      normalizeExpenseEntryType(expense.entry_type) === 'income' &&
      expense.category === 'investor_support'
    ))
  ), [filteredExpenses])
  const filteredExpenseRows = useMemo(() => (
    collapseDailyBazaarExpenseRows(
      filteredExpenses.filter(expense => normalizeExpenseEntryType(expense.entry_type) !== 'income')
    )
  ), [filteredExpenses])
  const accountingSummary = useMemo(
    () => getAccountingPageSummaryFromOrderSummary(
      paidOrderSummary,
      filteredExpenses,
      dateFrom,
      dateTo
    ),
    [paidOrderSummary, filteredExpenses, dateFrom, dateTo]
  )
  const {
    cafeIncome,
    loyaltyIncome,
    cafeIncomeSummary: selectedRangeCafeIncome,
    expenseSummary: summary,
    cashflow,
    netIncome,
    netProfit,
    profitMarginPct,
    employeeMealExpensesTotal,
    investorSupportTotal,
    otherIncomeTotal,
  } = accountingSummary
  const currentAccountingDate = todayExpenseDate()
  const salaryDueDate = dateTo < currentAccountingDate ? dateTo : currentAccountingDate
  const payableSalaryProfiles = useMemo(
    () => salaryProfiles.filter(salaryProfile => !salaryProfile.deleted_at),
    [salaryProfiles]
  )
  const totalSalaryDue = useMemo(
    () => getTotalSalaryDue(payableSalaryProfiles, salaryDueDate),
    [payableSalaryProfiles, salaryDueDate]
  )
  const salaryMonthEndDate = getSalaryMonthEndDate(salaryDueDate)
  const totalSalaryDueByMonthEnd = useMemo(
    () => getTotalSalaryDue(payableSalaryProfiles, salaryMonthEndDate),
    [payableSalaryProfiles, salaryMonthEndDate]
  )
  const categoryRows = Object.entries(summary.byCategory)
    .sort((a, b) => b[1] - a[1])

  function selectQuickRange(key) {
    const range = getAccountingQuickRange(key)
    setActiveRangeKey(key)
    setDateFrom(range.dateFrom)
    setDateTo(range.dateTo)
  }

  function setCustomRange(from, to) {
    if (!from || !to) return
    setActiveRangeKey('custom')
    setDateFrom(from <= to ? from : to)
    setDateTo(from <= to ? to : from)
  }

  function openCategoryHistory(category) {
    const params = new URLSearchParams({
      type: 'expense',
      category,
      from: dateFrom,
      to: dateTo,
    })
    navigate(`/admin/accounting/history?${params.toString()}`)
  }

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
    const { data: savedExpense, error: saveError } = await supabase
      .from('expenses')
      .insert(payload)
      .select('id')
      .single()
    if (saveError) {
      setSaving(false)
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
    setMessage(entryType === 'income' ? l.incomeSaved : l.expenseSaved)
    if (entryType === 'income') {
      try {
        await notifyInvestorIncome(savedExpense.id)
      } catch (notificationError) {
        console.error('[accounting] investor Telegram notification failed:', notificationError)
        setError(l.investorNotificationFailed)
      }
    } else {
      const notification = await notifyTelegramInvestorExpense(savedExpense.id)
      if (!notification.ok) setError(l.expenseNotificationFailed)
    }
    setSaving(false)
    await loadExpenses()
  }

  async function deleteExpense(expense) {
    if (!canDelete || deletingExpenseId) return
    const target = getExpenseHistoryDeleteTarget(expense)
    if (!target) return
    if (confirmDeleteId !== expense.id) {
      setConfirmDeleteId(expense.id)
      return
    }
    setDeletingExpenseId(expense.id)
    setError('')
    const { data, error: deleteError } = await supabase
      .from(target.table)
      .delete()
      .eq('id', target.id)
      .select('id')
    setDeletingExpenseId('')
    if (deleteError || !data?.length) {
      setError(deleteError?.message || l.deleteFailed)
      return
    }
    setConfirmDeleteId('')
    await loadExpenses()
  }

  return (
    <AppShell title={l.title}>
      <div className="h-full overflow-y-auto bg-[#FAF7F0]">
        <div className="mx-auto max-w-[1200px] px-4 py-5 sm:px-5 sm:py-6">
          <header className="mb-6 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-2xl font-black text-[#1F2937] sm:text-3xl">{l.title}</h1>
              <p className="mt-1 text-sm font-medium text-[#6B7280]">{l.sub}</p>
            </div>
            <nav aria-label={l.title} className="grid w-full gap-2 sm:grid-cols-3 lg:w-auto">
              <AccountingShortcut icon={Users} label={l.salaries} tone="orange" onClick={() => navigate('/admin/accounting/salaries')} />
              <AccountingShortcut icon={ReceiptText} label={l.estimate} tone="blue" onClick={() => navigate('/admin/accounting/estimate')} />
              <AccountingShortcut icon={ShoppingBasket} label={l.dailyBazaar} tone="teal" onClick={() => navigate('/admin/bazaar')} />
            </nav>
          </header>

          <section className="mb-6 rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm" aria-labelledby="accounting-period-heading">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <CalendarDays size={18} />
                </span>
                <div className="min-w-0">
                  <h2 id="accounting-period-heading" className="text-base font-black text-[#1F2937]">{l.period}</h2>
                  <p className="mt-0.5 text-xs font-medium text-[#6B7280]">{l.periodHelp}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={loadExpenses}
                disabled={loading}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs font-black text-[#6B7280] transition-colors hover:border-blue-200 hover:text-blue-600 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}{l.refresh}
              </button>
            </div>
            <div className="mt-4">
              <DateRangePicker
                l={l}
                lang={lang}
                rangeKey={activeRangeKey}
                dateFrom={dateFrom}
                dateTo={dateTo}
                today={todayExpenseDate()}
                onPreset={selectQuickRange}
                onApply={setCustomRange}
              />
            </div>
          </section>

          {error && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}
          {message && !error && <div role="status" aria-live="polite" className="mb-5 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-bold text-green-700">{message}</div>}

          <section className="mb-7" aria-labelledby="accounting-overview-heading">
            <SectionHeading
              id="accounting-overview-heading"
              title={l.overview}
              description={`${l.overviewHelp} · ${formatLongDate(dateFrom, lang, dateFrom)} — ${formatLongDate(dateTo, lang, dateTo)}`}
            />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi icon={WalletCards} label={l.cafeIncome} value={loading ? '—' : formatCurrency(cafeIncome)} sub={loading ? '' : `${l.loyaltyIncome}: ${formatCurrency(loyaltyIncome)}`} tone="green" />
            <Kpi
              icon={BadgeDollarSign}
              label={l.netProfit}
              value={loading ? '—' : formatCurrencyWithPercentage(netProfit, profitMarginPct, lang)}
              sub={l.netProfitSub}
              tone={netProfit >= 0 ? 'green' : 'red'}
              emphasizeValue
            />
            <Kpi
              icon={CalendarDays}
              label={l.avgDailyCafeIncome}
              value={loading ? '—' : formatCurrency(selectedRangeCafeIncome.averageDaily)}
              sub={loading ? l.periodHelp : `${l.periodCafeIncome}: ${formatCurrency(selectedRangeCafeIncome.total)} · ${l.loyaltyIncome}: ${formatCurrency(selectedRangeCafeIncome.loyaltyTotal)}`}
              tone="blue"
            />
            <Kpi
              icon={HandCoins}
              label={l.investorSupport}
              value={loading ? '—' : formatCurrency(investorSupportTotal)}
              sub={loading ? l.periodHelp : otherIncomeTotal > 0 ? `${l.otherIncomeSub}: ${formatCurrency(otherIncomeTotal)}` : l.investorSupportSub}
              tone="purple"
            />
            <Kpi icon={ReceiptText} label={l.expenses} value={loading ? '—' : formatCurrency(summary.total)} sub={loading ? l.periodHelp : `${summary.count} ${l.expenses.toLowerCase()}`} tone="orange" />
            <Kpi icon={UtensilsCrossed} label={l.employeeMeals} value={loading ? '—' : formatCurrency(employeeMealExpensesTotal)} sub={l.employeeMealsSub} tone="orange" />
            <Kpi icon={Banknote} label={l.left} value={loading ? '—' : formatCurrency(netIncome)} tone={netIncome >= 0 ? 'blue' : 'red'} />
            <Kpi
              icon={Users}
              label={l.salaryDue}
              value={loading ? '—' : formatCurrency(totalSalaryDue)}
              sub={`${l.salaryDueAsOf}: ${formatLongDate(salaryDueDate, lang, salaryDueDate)}`}
              tone={totalSalaryDue > 0 ? 'orange' : 'green'}
            />
            <Kpi
              icon={CalendarDays}
              label={l.salaryDueMonthEnd}
              value={loading ? '—' : formatCurrency(totalSalaryDueByMonthEnd)}
              sub={`${l.salaryDueProjection}: ${formatLongDate(salaryMonthEndDate, lang, salaryMonthEndDate)}`}
              tone={totalSalaryDueByMonthEnd > 0 ? 'red' : 'green'}
            />
            </div>
          </section>

          <section className="mb-7" aria-labelledby="accounting-operations-heading">
            <SectionHeading id="accounting-operations-heading" title={l.operations} description={l.operationsHelp} />
            <div className={ACCOUNTING_SECTION_GRID}>
              <div className="space-y-5">
                <section className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm sm:p-5">
                  <CardHeading
                    icon={form.entry_type === 'income' ? HandCoins : ReceiptText}
                    title={form.entry_type === 'income' ? l.addIncome : l.add}
                    description={formGuidance}
                    tone={form.entry_type === 'income' ? 'green' : 'orange'}
                  />
                {!canAdd ? (
                  <p className="rounded-xl bg-gray-50 px-3 py-3 text-sm font-bold text-[#6B7280]">{l.readOnly}</p>
                ) : (
                  <form onSubmit={saveExpense} className="grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <Field label={l.entryType}>
                      <div className="grid grid-cols-2 gap-2">
                        {EXPENSE_ENTRY_TYPES.map(entryType => {
                          const active = form.entry_type === entryType
                          const incomeEntry = entryType === 'income'
                          return (
                            <button
                              key={entryType}
                              type="button"
                              disabled={saving}
                              aria-pressed={active}
                              onClick={() => setForm(current => ({
                                ...current,
                                entry_type: entryType,
                                category: entryType === 'income' ? 'investor_support' : 'charcoal',
                              }))}
                              className={`flex h-11 items-center justify-center rounded-xl border text-xs font-black transition-colors ${
                                active && incomeEntry
                                  ? 'border-green-400 bg-green-50 text-green-700 ring-2 ring-green-100'
                                  : active
                                    ? 'border-[#ff5a00] bg-orange-50 text-[#ff5a00] ring-2 ring-orange-100'
                                    : 'border-[#E5E7EB] bg-white text-[#6B7280] hover:bg-gray-50 disabled:cursor-not-allowed disabled:bg-gray-100'
                              }`}
                            >
                              {entryType === 'income' ? l.incomeType : l.expenseType}
                            </button>
                          )
                        })}
                      </div>
                      </Field>
                    </div>
                    <Field label={l.date}>
                      <DateInput
                        value={form.expense_date}
                        lang={lang}
                        onChange={value => setForm(current => ({ ...current, expense_date: value }))}
                        disabled={saving}
                      />
                    </Field>
                    <Field label={l.amount}>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={formatMoneyInput(form.amount)}
                        onChange={event => setForm(current => ({ ...current, amount: normalizeMoneyInput(event.target.value) }))}
                        className={`${FIELD_INPUT_CLASS} text-lg font-black tabular-nums`}
                        placeholder="0 UZS"
                        disabled={saving}
                      />
                    </Field>
                    <div className="sm:col-span-2">
                      <Field label={l.category}>
                      <select value={form.category} onChange={event => setForm(current => ({ ...current, category: event.target.value }))} className={FIELD_INPUT_CLASS} disabled={saving}>
                        {categoryOptions.map(category => (
                          <option key={category.key} value={category.key}>{expenseCategoryLabel(category.key, lang)}</option>
                        ))}
                      </select>
                      </Field>
                    </div>
                    <div className="sm:col-span-2">
                      <Field label={l.method}>
                      <div className="grid grid-cols-3 gap-2">
                        {EXPENSE_PAYMENT_METHODS.map(method => {
                          const Icon = methodIcon(method)
                          const active = form.payment_method === method
                          return (
                            <button
                              key={method}
                              type="button"
                              disabled={saving}
                              aria-pressed={active}
                              onClick={() => setForm(current => ({ ...current, payment_method: method }))}
                              className={`flex h-11 items-center justify-center gap-1.5 rounded-xl border text-xs font-black transition-colors ${
                                active && form.entry_type === 'income'
                                  ? 'border-green-400 bg-green-50 text-green-700 ring-2 ring-green-100'
                                  : active
                                    ? 'border-[#ff5a00] bg-orange-50 text-[#ff5a00] ring-2 ring-orange-100'
                                    : 'border-[#E5E7EB] bg-white text-[#6B7280] hover:bg-gray-50 disabled:cursor-not-allowed disabled:bg-gray-100'
                              }`}
                            >
                              <Icon size={14} />{expensePaymentMethodLabel(method, lang)}
                            </button>
                          )
                        })}
                      </div>
                      </Field>
                    </div>
                    <div className="sm:col-span-2">
                      <Field label={form.entry_type === 'income' ? l.source : l.vendor}>
                        <input
                          value={form.vendor}
                          onChange={event => setForm(current => ({ ...current, vendor: event.target.value }))}
                          className={FIELD_INPUT_CLASS}
                          disabled={saving}
                          autoCorrect="off"
                          autoCapitalize="none"
                          spellCheck={false}
                        />
                      </Field>
                    </div>
                    <div className="sm:col-span-2">
                      <Field label={l.description}>
                        <textarea
                          value={form.description}
                          onChange={event => setForm(current => ({ ...current, description: event.target.value }))}
                          rows={3}
                          className={`${FIELD_INPUT_CLASS} min-h-[88px] resize-y py-3`}
                          disabled={saving}
                          autoCorrect="off"
                          autoCapitalize="none"
                          spellCheck={false}
                        />
                      </Field>
                    </div>
                    <button
                      disabled={!canSubmitExpense}
                      className={`flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-black text-white shadow-sm transition-colors disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500 disabled:shadow-none sm:col-span-2 ${form.entry_type === 'income' ? 'bg-green-600 shadow-green-100 hover:bg-green-700' : 'bg-[#ff5a00] shadow-orange-200 hover:bg-[#e85100]'}`}
                    >
                      {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}{saving ? l.saving : l.save}
                    </button>
                  </form>
                )}
                </section>
                <MethodBalancesDisclosure rows={cashflow.rows} lang={lang} labels={l} />
              </div>
              <ExpenseCategoryChart
                title={l.moneyFlow}
                rows={categoryRows}
                total={summary.total}
                lang={lang}
                onCategoryClick={openCategoryHistory}
              />
            </div>
          </section>

          <section className="mb-5" aria-labelledby="accounting-activity-heading">
            <SectionHeading id="accounting-activity-heading" title={l.recentActivity} description={l.recentActivityHelp} />
            <div className={HISTORY_SECTION_GRID}>
              <ExpenseHistorySection
                title={l.investorHistory}
                titleAmount={investorSupportTotal}
                rows={filteredInvestorSupport}
                loading={loading}
                emptyText={l.emptyInvestor}
                loadingTitle={l.loadFailed.replace('Не удалось ', '').replace('Could not ', '')}
                lang={lang}
                canDelete={canDelete}
                confirmDeleteId={confirmDeleteId}
                deletingExpenseId={deletingExpenseId}
                confirmDeleteLabel={l.confirmDelete}
                deleteLabel={l.delete}
                onDelete={deleteExpense}
                salaryPaymentLabel={l.automaticSalary}
                salaryBonusLabel={l.salaryBonus}
                seeAllLabel={l.seeAll}
                onSeeAll={() => navigate('/admin/accounting/history')}
              />
              <ExpenseHistorySection
                title={l.history}
                rows={filteredExpenseRows}
                loading={loading}
                emptyText={l.empty}
                loadingTitle={l.loadFailed.replace('Не удалось ', '').replace('Could not ', '')}
                lang={lang}
                canDelete={canDelete}
                confirmDeleteId={confirmDeleteId}
                deletingExpenseId={deletingExpenseId}
                confirmDeleteLabel={l.confirmDelete}
                deleteLabel={l.delete}
                onDelete={deleteExpense}
                salaryPaymentLabel={l.automaticSalary}
                salaryBonusLabel={l.salaryBonus}
                seeAllLabel={l.seeAll}
                onSeeAll={() => navigate('/admin/accounting/history')}
              />
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  )
}

function AccountingShortcut({ icon: Icon, label, tone = 'orange', onClick }) {
  const tones = {
    orange: 'border-orange-200 bg-orange-50 text-[#ff5a00] hover:bg-orange-100',
    blue: 'border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100',
    teal: 'border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100',
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl border px-4 text-sm font-black shadow-sm transition-colors ${tones[tone] || tones.orange}`}
    >
      <Icon size={17} />{label}
    </button>
  )
}

function SectionHeading({ id, title, description }) {
  return (
    <div className="mb-3">
      <h2 id={id} className="text-lg font-black text-[#1F2937]">{title}</h2>
      <p className="mt-0.5 text-sm font-medium text-[#6B7280]">{description}</p>
    </div>
  )
}

function CardHeading({ icon: Icon, title, description, tone = 'orange' }) {
  const iconTone = tone === 'green' ? 'bg-green-50 text-green-600' : 'bg-orange-50 text-[#ff5a00]'
  return (
    <div className="mb-5 flex min-h-[56px] items-start gap-3">
      <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${iconTone}`}>
        <Icon size={17} />
      </span>
      <span className="min-w-0">
        <span className="block text-base font-black text-[#1F2937]">{title}</span>
        <span className="mt-0.5 block text-xs font-medium leading-relaxed text-[#6B7280]">{description}</span>
      </span>
    </div>
  )
}

function ExpenseHistorySection({
  title,
  titleAmount,
  rows,
  loading,
  emptyText,
  loadingTitle,
  lang,
  canDelete,
  confirmDeleteId,
  deletingExpenseId,
  confirmDeleteLabel,
  deleteLabel,
  onDelete,
  salaryPaymentLabel,
  salaryBonusLabel,
  seeAllLabel,
  onSeeAll,
}) {
  return (
    <section className="h-full rounded-2xl border border-[#E5E7EB] bg-white shadow-sm">
      <div className="border-b border-[#F3F4F6] px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-black text-[#1F2937]">{title}</h2>
          <div className="flex items-center gap-2">
            {titleAmount !== undefined && (
              <span className="rounded-full bg-green-50 px-3 py-1 text-sm font-black text-green-700 tabular-nums">
                {formatCurrency(titleAmount)}
              </span>
            )}
            {!loading && rows.length > 0 && (
              <button
                type="button"
                onClick={onSeeAll}
                className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-black text-blue-600 transition-colors hover:border-blue-300 hover:bg-blue-100"
              >
                {seeAllLabel}
              </button>
            )}
          </div>
        </div>
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
                  <p className="flex flex-wrap items-center gap-1.5 text-xs font-bold text-[#9CA3AF]">
                    <span>{formatLongDate(expense.expense_date, lang, expense.expense_date)}</span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1"><Clock3 size={12} />{formatTime(expense.created_at, '—')}</span>
                    <span>·</span>
                    <span>{expense.created_by_name || '—'}</span>
                  </p>
                  {(expense.vendor || expense.description) && (
                    <p className="mt-1 break-words text-sm font-semibold text-[#4B5563]">
                      {[expense.vendor, expenseDescriptionLabel(expense.description, lang)].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
                <div className="flex flex-shrink-0 items-center justify-between gap-3 sm:justify-end">
                  <p className={`text-lg font-black ${tone.amount}`}>{formatCurrency(expense.amount)}</p>
                  {canDelete && getExpenseHistoryDeleteTarget(expense) && (
                    <button
                      type="button"
                      disabled={Boolean(deletingExpenseId)}
                      onClick={() => onDelete(expense)}
                      className={`inline-flex h-10 items-center gap-1.5 rounded-xl border px-3 text-xs font-black disabled:cursor-not-allowed disabled:opacity-50 ${
                        confirmDeleteId === expense.id ? 'border-red-200 bg-red-50 text-red-600' : 'border-[#E5E7EB] text-[#6B7280]'
                      }`}
                    >
                      {deletingExpenseId === expense.id
                        ? <Loader2 size={14} className="animate-spin" />
                        : <Trash2 size={14} />}
                      {confirmDeleteId === expense.id ? confirmDeleteLabel : deleteLabel}
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

function ExpenseCategoryChart({ title, rows, total, lang, onCategoryClick }) {
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
              <button
                key={key}
                type="button"
                onClick={() => onCategoryClick?.(key)}
                className="group grid w-full gap-2 rounded-xl p-1 text-left transition-colors hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff5a00]/30 sm:grid-cols-[180px_1fr_120px] sm:items-center"
              >
                <span className="truncate text-sm font-black text-[#374151]">{expenseCategoryLabel(key, lang)}</span>
                <div className="h-8 overflow-hidden rounded-xl bg-gray-100">
                  <div
                    className="flex h-full items-center justify-end rounded-xl pr-2 text-[11px] font-black text-white"
                    style={{ width: `${width}%`, backgroundColor: palette[index % palette.length] }}
                  >
                    {width >= 18 ? `${width}%` : ''}
                  </div>
                </div>
                <span className="flex items-center gap-1 text-sm font-black text-[#1F2937] sm:justify-end">
                  {formatCurrency(amount)}
                  <ChevronRight size={15} className="flex-shrink-0 text-[#9CA3AF] transition-transform group-hover:translate-x-0.5 group-hover:text-[#ff5a00]" />
                </span>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}

function MethodBalancesDisclosure({ rows, lang, labels }) {
  const [open, setOpen] = useState(false)

  return (
    <section className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-black text-[#1F2937]">{labels.methodBalances}</h2>
          <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-[#9CA3AF]">{labels.methodBalancesHint}</p>
        </div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="accounting-method-balances"
          onClick={() => setOpen(current => !current)}
          className="inline-flex h-9 flex-shrink-0 items-center gap-1.5 rounded-xl border border-orange-200 bg-orange-50 px-3 text-xs font-black text-[#ff5a00] transition-colors hover:bg-orange-100"
        >
          {open ? labels.showLess : labels.more}
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {open && (
        <div id="accounting-method-balances" className="mt-4 space-y-3">
          {rows.map(row => {
            const Icon = methodIcon(row.method)
            const isLoyaltyIncome = row.method === 'loyalty_card'
            return (
              <div key={row.method} className="rounded-xl border border-[#EEF0F3] bg-[#FBFCFD] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-orange-50 text-[#ff5a00]">
                      <Icon size={15} />
                    </span>
                    <span className="truncate text-sm font-black text-[#1F2937]">{isLoyaltyIncome ? labels.loyaltyIncome : expensePaymentMethodLabel(row.method, lang)}</span>
                  </div>
                  <div className="text-right">
                    <span className="block text-[9px] font-black uppercase tracking-wide text-[#9CA3AF]">{isLoyaltyIncome ? labels.loyaltyIncome : labels.remaining}</span>
                    <span className={`mt-0.5 block text-base font-black leading-tight tabular-nums ${isLoyaltyIncome || row.left >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(isLoyaltyIncome ? row.income : row.left)}
                    </span>
                  </div>
                </div>
                {!isLoyaltyIncome && <div className="mt-2 grid grid-cols-2 gap-2">
                  <div className="min-w-0 rounded-lg bg-green-50 px-2.5 py-2 text-green-700">
                    <span className="block text-[9px] font-black uppercase tracking-wide text-green-500">{labels.incomeIn}</span>
                    <span className="mt-1 block break-words text-xs font-black leading-tight tabular-nums">{formatCurrency(row.income)}</span>
                  </div>
                  <div className="min-w-0 rounded-lg bg-orange-50 px-2.5 py-2 text-[#ff5a00]">
                    <span className="block text-[9px] font-black uppercase tracking-wide text-orange-400">{labels.spentOut}</span>
                    <span className="mt-1 block break-words text-xs font-black leading-tight tabular-nums">{formatCurrency(row.expenses)}</span>
                  </div>
                </div>}
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
      <span className="mb-1.5 block text-xs font-bold text-[#596170]">{label}</span>
      {children}
    </label>
  )
}

function Kpi({ icon: Icon, label, value, sub = '', tone = 'orange', emphasizeValue = false }) {
  const tones = {
    green: 'bg-green-50 text-green-600',
    orange: 'bg-orange-50 text-[#ff5a00]',
    blue: 'bg-blue-50 text-blue-600',
    red: 'bg-red-50 text-red-600',
    purple: 'bg-purple-50 text-purple-600',
  }
  const valueTones = {
    green: 'text-emerald-700',
    orange: 'text-[#ff5a00]',
    blue: 'text-blue-700',
    red: 'text-red-600',
    purple: 'text-purple-700',
  }
  const valueTone = emphasizeValue ? valueTones[tone] || valueTones.orange : 'text-[#1F2937]'
  return (
    <div className="h-full min-w-0 rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold text-[#6B7280]">{label}</p>
          <p className={`mt-1 break-words text-xl font-black leading-tight tabular-nums ${valueTone}`}>{value}</p>
        </div>
        <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${tones[tone] || tones.orange}`}>
          <Icon size={18} />
        </div>
      </div>
      {sub && <p className="mt-3 min-h-[30px] text-xs font-medium leading-relaxed text-[#9CA3AF]">{sub}</p>}
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
