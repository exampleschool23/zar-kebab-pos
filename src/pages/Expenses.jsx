import React, { useEffect, useMemo, useState } from 'react'
import {
  Banknote,
  CalendarDays,
  CreditCard,
  Download,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
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
import {
  EXPENSE_CATEGORIES,
  EXPENSE_PAYMENT_METHODS,
  expenseCategoryLabel,
  expensePaymentMethodLabel,
  getNetIncome,
  normalizeExpenseAmount,
  summarizeExpenses,
  todayExpenseDate,
} from '../lib/expenses'
import { downloadCsv } from '../lib/closeout'

const SELECT_COLUMNS = 'id, expense_date, category, payment_method, amount, vendor, description, created_by, created_by_name, created_at, updated_at'
const FIELD_INPUT_CLASS = 'w-full rounded-xl border border-[#E5E7EB] bg-white px-3 py-2.5 text-sm font-semibold text-[#1F2937] outline-none transition-colors focus:border-[#ff5a00]'

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

function isMissingExpensesMigration(error) {
  const text = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return text.includes('expenses') && (
    text.includes('does not exist') ||
    text.includes('schema cache') ||
    text.includes('42p01')
  )
}

function exportExpensesCsv(expenses, lang) {
  const header = ['date', 'category', 'payment_method', 'amount', 'vendor', 'description', 'created_by']
  const rows = expenses.map(expense => [
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
  const lang = state.lang || 'ru'
  const role = (profile?.role || state.user?.role || 'guest').toLowerCase()
  const canAdd = role === 'owner'
  const canDelete = role === 'owner'

  const [dateFrom, setDateFrom] = useState(todayExpenseDate())
  const [dateTo, setDateTo] = useState(todayExpenseDate())
  const [query, setQuery] = useState('')
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState('')
  const [form, setForm] = useState({
    expense_date: todayExpenseDate(),
    category: 'products_bazaar',
    payment_method: 'cash',
    amount: '',
    vendor: '',
    description: '',
  })

  const L = {
    uz: {
      title: 'Xarajatlar',
      sub: 'Pul qayerga ketayotganini yozib boring',
      income: 'Daromad',
      expenses: 'Xarajatlar',
      left: 'Qolgan pul',
      entries: 'Yozuvlar',
      add: 'Xarajat qo‘shish',
      date: 'Sana',
      category: 'Kategoriya',
      method: 'To‘lov turi',
      amount: 'Summa',
      vendor: 'Yetkazuvchi yoki xodim',
      description: 'Izoh',
      save: 'Saqlash',
      saving: 'Saqlanmoqda...',
      refresh: 'Yangilash',
      export: 'Eksport',
      search: 'Kategoriya, izoh yoki xodim qidirish...',
      today: 'Bugun',
      week: '7 kun',
      month: 'Oy',
      from: 'Dan',
      to: 'Gacha',
      byCategory: 'Kategoriya bo‘yicha',
      byMethod: 'To‘lov turi bo‘yicha',
      history: 'Xarajatlar tarixi',
      empty: 'Bu davrda xarajat yozilmagan',
      required: 'Sana, kategoriya, to‘lov turi va summa kerak.',
      saveFailed: 'Xarajatni saqlab bo‘lmadi.',
      loadFailed: 'Xarajatlarni yuklab bo‘lmadi.',
      migrationMissing: 'Xarajatlar jadvali hali bazada yaratilmagan. Supabase SQL editorida supabase/048_expenses.sql migratsiyasini ishga tushiring.',
      delete: 'O‘chirish',
      confirmDelete: 'Tasdiqlash',
      deleteFailed: 'Xarajatni o‘chirib bo‘lmadi.',
      readOnly: 'Bu rol faqat ko‘ra oladi.',
    },
    ru: {
      title: 'Расходы',
      sub: 'Учёт денег, которые уходят из кафе',
      income: 'Доход',
      expenses: 'Расходы',
      left: 'Остаток',
      entries: 'Записей',
      add: 'Добавить расход',
      date: 'Дата',
      category: 'Категория',
      method: 'Способ оплаты',
      amount: 'Сумма',
      vendor: 'Поставщик или сотрудник',
      description: 'Описание',
      save: 'Сохранить',
      saving: 'Сохраняется...',
      refresh: 'Обновить',
      export: 'Экспорт',
      search: 'Поиск по категории, описанию или сотруднику...',
      today: 'Сегодня',
      week: '7 дней',
      month: 'Месяц',
      from: 'С',
      to: 'По',
      byCategory: 'По категориям',
      byMethod: 'По способам оплаты',
      history: 'История расходов',
      empty: 'За этот период расходов нет',
      required: 'Нужны дата, категория, способ оплаты и сумма.',
      saveFailed: 'Не удалось сохранить расход.',
      loadFailed: 'Не удалось загрузить расходы.',
      migrationMissing: 'Таблица расходов ещё не создана в базе. Запустите supabase/048_expenses.sql в Supabase SQL Editor.',
      delete: 'Удалить',
      confirmDelete: 'Подтвердить',
      deleteFailed: 'Не удалось удалить расход.',
      readOnly: 'Эта роль может только просматривать.',
    },
    en: {
      title: 'Expenses',
      sub: 'Track where cafe money is going out',
      income: 'Income',
      expenses: 'Expenses',
      left: 'Left',
      entries: 'Entries',
      add: 'Add expense',
      date: 'Date',
      category: 'Category',
      method: 'Payment method',
      amount: 'Amount',
      vendor: 'Vendor or employee',
      description: 'Description',
      save: 'Save',
      saving: 'Saving...',
      refresh: 'Refresh',
      export: 'Export',
      search: 'Search category, description, or employee...',
      today: 'Today',
      week: '7 days',
      month: 'Month',
      from: 'From',
      to: 'To',
      byCategory: 'By category',
      byMethod: 'By payment method',
      history: 'Expense history',
      empty: 'No expenses in this period',
      required: 'Date, category, payment method, and amount are required.',
      saveFailed: 'Could not save expense.',
      loadFailed: 'Could not load expenses.',
      migrationMissing: 'Expenses table is not created yet. Run supabase/048_expenses.sql in Supabase SQL Editor.',
      delete: 'Delete',
      confirmDelete: 'Confirm',
      deleteFailed: 'Could not delete expense.',
      readOnly: 'This role can view only.',
    },
  }
  const l = L[lang] || L.en

  async function loadExpenses() {
    setLoading(true)
    setError('')
    const { data, error: loadError } = await supabase
      .from('expenses')
      .select(SELECT_COLUMNS)
      .gte('expense_date', dateFrom)
      .lte('expense_date', dateTo)
      .order('expense_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (loadError) {
      setError(isMissingExpensesMigration(loadError) ? l.migrationMissing : loadError.message || l.loadFailed)
      setExpenses([])
    } else {
      setExpenses(data || [])
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
  const filteredExpenses = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return expenses
    return expenses.filter(expense => {
      const haystack = [
        expenseCategoryLabel(expense.category, lang),
        expensePaymentMethodLabel(expense.payment_method, lang),
        expense.vendor,
        expense.description,
        expense.created_by_name,
      ].join(' ').toLowerCase()
      return haystack.includes(needle)
    })
  }, [expenses, query, lang])

  const summary = useMemo(() => summarizeExpenses(filteredExpenses), [filteredExpenses])
  const netIncome = getNetIncome(revenue, filteredExpenses)
  const categoryRows = Object.entries(summary.byCategory)
    .sort((a, b) => b[1] - a[1])
  const methodRows = Object.entries(summary.byMethod)
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
    setSaving(true)
    const payload = {
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
    setForm(current => ({ ...current, amount: '', vendor: '', description: '' }))
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
            <div className="flex flex-wrap items-center gap-2">
              {[
                { key: 'today', label: l.today },
                { key: 'week', label: l.week },
                { key: 'month', label: l.month },
              ].map(option => (
                <button
                  key={option.key}
                  onClick={() => {
                    const today = todayExpenseDate()
                    if (option.key === 'today') { setDateFrom(today); setDateTo(today) }
                    if (option.key === 'week') { setDateFrom(addDays(today, -6)); setDateTo(today) }
                    if (option.key === 'month') { setDateFrom(today.slice(0, 8) + '01'); setDateTo(today) }
                  }}
                  className="rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-xs font-black text-[#6B7280] shadow-sm hover:border-orange-200 hover:text-[#ff5a00]"
                >
                  {option.label}
                </button>
              ))}
              <button onClick={loadExpenses} className="inline-flex items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-xs font-black text-[#6B7280] shadow-sm">
                <RefreshCw size={14} />{l.refresh}
              </button>
              <button onClick={() => exportExpensesCsv(filteredExpenses, lang)} className="inline-flex items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-xs font-black text-[#6B7280] shadow-sm">
                <Download size={14} />{l.export}
              </button>
            </div>
          </div>

          <div className="mb-5 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 shadow-sm">
              <span className="text-[11px] font-bold text-[#9CA3AF]">{l.from}</span>
              <input type="date" value={dateFrom} onChange={event => setDateFrom(event.target.value)} className="bg-transparent text-sm outline-none" />
              <span className="text-[#9CA3AF]">—</span>
              <span className="text-[11px] font-bold text-[#9CA3AF]">{l.to}</span>
              <input type="date" value={dateTo} onChange={event => setDateTo(event.target.value)} className="bg-transparent text-sm outline-none" />
            </div>
            <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 shadow-sm">
              <Search size={16} className="text-[#9CA3AF]" />
              <input value={query} onChange={event => setQuery(event.target.value)} placeholder={l.search} className="w-full bg-transparent text-sm outline-none" />
            </div>
          </div>

          <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi icon={WalletCards} label={l.income} value={formatCurrency(revenue)} tone="green" />
            <Kpi icon={ReceiptText} label={l.expenses} value={formatCurrency(summary.total)} sub={`${summary.count} ${l.entries.toLowerCase()}`} tone="orange" />
            <Kpi icon={Banknote} label={l.left} value={formatCurrency(netIncome)} tone={netIncome >= 0 ? 'blue' : 'red'} />
            <Kpi icon={CalendarDays} label={l.entries} value={summary.count} tone="purple" />
          </div>

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
                  <h2 className="text-base font-black text-[#1F2937]">{l.add}</h2>
                  <Plus size={18} className="text-[#ff5a00]" />
                </div>
                {!canAdd ? (
                  <p className="rounded-xl bg-gray-50 px-3 py-3 text-sm font-bold text-[#6B7280]">{l.readOnly}</p>
                ) : (
                  <form onSubmit={saveExpense} className="space-y-3">
                    <Field label={l.date}>
                      <input type="date" value={form.expense_date} onChange={event => setForm(current => ({ ...current, expense_date: event.target.value }))} className={FIELD_INPUT_CLASS} />
                    </Field>
                    <Field label={l.category}>
                      <select value={form.category} onChange={event => setForm(current => ({ ...current, category: event.target.value }))} className={FIELD_INPUT_CLASS}>
                        {EXPENSE_CATEGORIES.map(category => (
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
                      <input type="number" min="0" step="1000" value={form.amount} onChange={event => setForm(current => ({ ...current, amount: event.target.value }))} className={`${FIELD_INPUT_CLASS} text-lg font-black`} placeholder="0" />
                    </Field>
                    <Field label={l.vendor}>
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

              <Breakdown title={l.byCategory} rows={categoryRows} total={summary.total} lang={lang} type="category" />
              <Breakdown title={l.byMethod} rows={methodRows} total={summary.total} lang={lang} type="method" />
            </div>

            <section className="min-w-0 rounded-2xl border border-[#E5E7EB] bg-white shadow-sm">
              <div className="border-b border-[#F3F4F6] px-4 py-4">
                <h2 className="text-base font-black text-[#1F2937]">{l.history}</h2>
              </div>
              {loading ? (
                <OperationalLoading title={l.loadFailed.replace('Не удалось ', '').replace('Could not ', '')} description="" />
              ) : filteredExpenses.length === 0 ? (
                <div className="px-4 py-14 text-center text-sm font-bold text-[#9CA3AF]">{l.empty}</div>
              ) : (
                <div className="max-h-[720px] overflow-y-auto">
                  {filteredExpenses.map(expense => {
                    const Icon = methodIcon(expense.payment_method)
                    return (
                      <div key={expense.id} className="flex flex-col gap-3 border-b border-[#F3F4F6] px-4 py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="mb-1 flex flex-wrap items-center gap-2">
                            <span className="text-sm font-black text-[#1F2937]">{expenseCategoryLabel(expense.category, lang)}</span>
                            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-black text-[#6B7280]">
                              <Icon size={11} />{expensePaymentMethodLabel(expense.payment_method, lang)}
                            </span>
                          </div>
                          <p className="text-xs font-bold text-[#9CA3AF]">{expense.expense_date} · {expense.created_by_name || '—'}</p>
                          {(expense.vendor || expense.description) && (
                            <p className="mt-1 break-words text-sm font-semibold text-[#4B5563]">
                              {[expense.vendor, expense.description].filter(Boolean).join(' · ')}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-shrink-0 items-center justify-between gap-3 sm:justify-end">
                          <p className="text-lg font-black text-[#ff5a00]">{formatCurrency(expense.amount)}</p>
                          {canDelete && (
                            <button onClick={() => deleteExpense(expense)} className={`inline-flex h-10 items-center gap-1.5 rounded-xl border px-3 text-xs font-black ${
                              confirmDeleteId === expense.id ? 'border-red-200 bg-red-50 text-red-600' : 'border-[#E5E7EB] text-[#6B7280]'
                            }`}>
                              <Trash2 size={14} />{confirmDeleteId === expense.id ? l.confirmDelete : l.delete}
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          </div>
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
