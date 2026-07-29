import React, { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, BadgeMinus, CalendarX2, Copy, Loader2, Plus, Save, Send, Users, WalletCards } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import AppShell from '../components/AppShell'
import { useApp } from '../store/AppContext'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { formatCurrency } from '../lib/formatCurrency'
import { formatDateTime, formatLongDate } from '../lib/dateFormat'
import { canEditFeature } from '../lib/permissions'
import {
  EXPENSE_PAYMENT_METHODS,
  SALARY_RATE_UNITS,
  buildSalaryReactivationAbsenceRows,
  canRecordSalaryTransaction,
  convertSalaryAmountToDaily,
  expensePaymentMethodLabel,
  getSalaryAbsenceDates,
  getSalaryDue,
  getTotalSalaryDue,
  getTotalMonthlySalaryCommitment,
  normalizeExpenseAmount,
} from '../lib/expenses'
import { todayExpenseDate } from '../lib/expenses'
import { compareSalaryTransactionsNewestFirst } from '../lib/salaryTransactions'
import { notifyTelegramEmployeeFine, notifyTelegramEmployeePayment } from '../lib/telegramNotifications'

const FIELD = 'h-11 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm font-semibold text-[#1F2937] outline-none transition-colors focus:border-[#ff5a00] focus:ring-2 focus:ring-orange-100 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500'
const SECTION_GRID = 'grid items-stretch gap-4 lg:grid-cols-2'
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

function composeSalaryProfiles(rows = [], rates = [], payments = [], bonuses = [], fines = [], absences = [], profiles = []) {
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
    fines: fines
      .filter(fine => fine.salary_profile_id === row.id)
      .sort((a, b) => b.fine_date.localeCompare(a.fine_date)),
    absences: absences
      .filter(absence => absence.salary_profile_id === row.id)
      .sort((a, b) => b.absence_date.localeCompare(a.absence_date)),
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

function buildTransactionHistoryForSourceGuard(salaryProfile, lang) {
  const transactionHistory = [
    ...(salaryProfile?.payments || []).map(payment => ({
      id: payment.id,
      entryType: 'payment',
      date: payment.paid_date,
      createdAt: payment.created_at,
      amount: payment.amount,
      detail: payment.note || expensePaymentMethodLabel(payment.payment_method, lang),
      row: payment,
    })),
    ...(salaryProfile?.bonuses || []).map(bonus => ({
      id: bonus.id,
      entryType: 'bonus',
      date: bonus.bonus_date,
      createdAt: bonus.created_at,
      amount: bonus.amount,
      detail: bonus.note || expensePaymentMethodLabel(bonus.payment_method, lang),
      row: bonus,
    })),
    ...(salaryProfile?.fines || []).map(fine => ({
      id: fine.id,
      entryType: 'fine',
      date: fine.fine_date,
      createdAt: fine.created_at,
      amount: fine.amount,
      detail: fine.reason,
      row: fine,
    })),
  ]
  return transactionHistory.sort(compareSalaryTransactionsNewestFirst)
}

export default function Salaries() {
  const { state } = useApp()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const lang = state.lang || 'ru'
  const role = (profile?.role || state.user?.role || 'guest').toLowerCase()
  const canManage = canEditFeature(profile || { role }, 'expenses')
  const today = todayExpenseDate()

  const L = {
    uz: {
      title: 'Maoshlar',
      sub: 'Ishga kirgan sana, maosh va to‘lanishi kerak summa',
      back: 'Buxgalteriyaga qaytish',
      add: 'Xodim maoshi qo‘shish',
      employee: 'Xodim',
      employeeName: 'Xodim ismi',
      joined: 'Ishga kirgan sana',
      effectiveDate: 'Qachondan',
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
      paymentBonus: 'To‘lov / bonus / jarima yozish',
      paymentEntry: 'To‘lov',
      bonusEntry: 'Bonus',
      fineEntry: 'Jarima',
      bonus: 'Bonus',
      addBonus: 'Bonus qo‘shish',
      addFine: 'Jarima yozish',
      paidDate: 'To‘lov sanasi',
      bonusDate: 'Bonus sanasi',
      fineDate: 'Jarima sanasi',
      fineReason: 'Jarima sababi',
      absence: 'Kelmagan kun',
      markAbsence: 'Kelmagan kunni belgilash',
      absenceDate: 'Kelmagan sana',
      absenceHistory: 'Kelmagan kunlar',
      absentLabel: 'Kelmagan',
      amount: 'Summa',
      due: 'To‘lanishi kerak',
      totalDue: 'Jami qarzdorlik',
      monthlyPayroll: 'Oylik maoshlar',
      employees: 'Xodimlar',
      openEmployees: 'Xodimlar ro‘yxatini ochish',
      quickActions: 'Kundalik operatsiyalar',
      quickActionsHelp: 'To‘lov, bonus, jarima yoki kelmagan kunni bir joyda yozing.',
      salarySettings: 'Maosh sozlamalari',
      salarySettingsHelp: 'Yangi xodim uchun maosh belgilang yoki amaldagi stavkani o‘zgartiring.',
      addHelp: 'Yangi xodim va uning boshlang‘ich maoshini kiriting.',
      changeHelp: 'Yangi stavka va u amal qiladigan sanani belgilang.',
      transactionHelp: 'Operatsiya turini tanlang, keyin xodim va summani kiriting.',
      paymentHelp: 'To‘lov xodimga bo‘lgan qarzni kamaytiradi.',
      bonusHelp: 'Bonus — maoshdan tashqari qo‘shimcha to‘lov.',
      fineHelp: 'Jarima maosh qarzini kamaytiradi, lekin kassa xarajati hisoblanmaydi.',
      absenceHelp: 'Tanlangan sana uchun ishga kelmagan xodimni belgilang.',
      absenceDuplicate: 'Bu xodimning tanlangan sanadagi yo‘qligi allaqachon belgilangan.',
      createdMessage: 'Xodim maoshi qo‘shildi',
      rateSavedMessage: 'Yangi maosh stavkasi saqlandi',
      transactionSavedMessage: 'Operatsiya saqlandi',
      paymentTelegramFailed: 'To‘lov saqlandi, lekin Telegram xabari yuborilmadi.',
      absenceSavedMessage: 'Kelmagan kun saqlandi',
      accruedToday: 'Bugungi xarajat',
      history: 'Maosh tarixi',
      historyBtn: 'Tarix',
      payments: 'To‘lovlar',
      paymentHistory: 'To‘lovlar / bonuslar / jarimalar',
      paymentLabel: 'To‘lov',
      bonusLabel: 'Bonus',
      fineLabel: 'Jarima',
      active: 'Faol',
      inactive: 'Nofaol',
      deactivate: 'Faolsizlantirish',
      reactivate: 'Qayta yoqish',
      page: 'Sahifa',
      empty: 'Maosh sozlamalari yo‘q',
      migration: 'Maosh jadvallari yangilanmagan. supabase/054_employee_salary_profiles.sql dan supabase/063_employee_salary_absences.sql gacha va supabase/099_employee_salary_fines.sql migratsiyalarini ishga tushiring.',
      readOnly: 'Bu sahifa faqat egasi uchun.',
      telegramTitle: 'Telegram xabarnomalari',
      telegramHelp: 'Xodimga 30 daqiqada muddati tugaydigan shaxsiy ulanish havolasini yuboring.',
      telegramCreateLink: 'Ulanish havolasini yaratish',
      telegramCopy: 'Nusxalash',
      telegramCopied: 'Telegram havolasi nusxalandi',
      telegramLinked: 'Telegram ulangan',
      telegramBotMissing: 'VITE_TELEGRAM_BOT_USERNAME sozlanmagan.',
      telegramDeliveryTitle: 'To‘lov xabarlari holati',
      telegramDeliveryHelp: 'Telegram yuborilishi va xodim tasdig‘ini kuzating.',
      telegramDeliveryEmpty: 'Hali to‘lov xabarlari yo‘q.',
      telegramDeliveryMigration: 'To‘lov xabarlari tarixi uchun 108-migratsiyani ishga tushiring.',
      telegramStatusPending: 'Kutilmoqda',
      telegramStatusSent: 'Yuborildi',
      telegramStatusFailed: 'Xato',
      telegramStatusSkipped: 'O‘tkazib yuborildi',
      telegramStatusConfirmed: 'Qabul qilindi',
      telegramMessageId: 'Xabar',
    },
    ru: {
      title: 'Зарплаты',
      sub: 'Дата выхода, зарплата и сумма к выплате',
      back: 'Назад к бухгалтерии',
      add: 'Добавить зарплату сотрудника',
      employee: 'Сотрудник',
      employeeName: 'Имя сотрудника',
      joined: 'Дата выхода',
      effectiveDate: 'Действует с',
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
      paymentBonus: 'Записать выплату / бонус / штраф',
      paymentEntry: 'Выплата',
      bonusEntry: 'Бонус',
      fineEntry: 'Штраф',
      bonus: 'Бонус',
      addBonus: 'Добавить бонус',
      addFine: 'Записать штраф',
      paidDate: 'Дата выплаты',
      bonusDate: 'Дата бонуса',
      fineDate: 'Дата штрафа',
      fineReason: 'Причина штрафа',
      absence: 'Отсутствие',
      markAbsence: 'Отметить отсутствие',
      absenceDate: 'Дата отсутствия',
      absenceHistory: 'Дни отсутствия',
      absentLabel: 'Отсутствовал',
      amount: 'Сумма',
      due: 'К выплате',
      totalDue: 'Общий долг',
      monthlyPayroll: 'Зарплаты в месяц',
      employees: 'Сотрудники',
      openEmployees: 'Открыть список сотрудников',
      quickActions: 'Ежедневные операции',
      quickActionsHelp: 'Записывайте выплаты, бонусы, штрафы и отсутствия в одном месте.',
      salarySettings: 'Настройка зарплат',
      salarySettingsHelp: 'Назначьте зарплату новому сотруднику или измените действующую ставку.',
      addHelp: 'Укажите нового сотрудника и его первоначальную зарплату.',
      changeHelp: 'Укажите новую ставку и дату, с которой она действует.',
      transactionHelp: 'Сначала выберите тип операции, затем сотрудника и сумму.',
      paymentHelp: 'Выплата уменьшает долг перед сотрудником.',
      bonusHelp: 'Бонус — дополнительная выплата сверх зарплаты.',
      fineHelp: 'Штраф уменьшает долг по зарплате, но не считается расходом кассы.',
      absenceHelp: 'Отметьте сотрудника, который отсутствовал в выбранную дату.',
      absenceDuplicate: 'Отсутствие этого сотрудника на выбранную дату уже отмечено.',
      createdMessage: 'Зарплата сотрудника добавлена',
      rateSavedMessage: 'Новая ставка зарплаты сохранена',
      transactionSavedMessage: 'Операция сохранена',
      paymentTelegramFailed: 'Выплата сохранена, но сообщение в Telegram не отправлено.',
      absenceSavedMessage: 'Отсутствие сохранено',
      accruedToday: 'Расход за день',
      history: 'История зарплаты',
      historyBtn: 'История',
      payments: 'Выплаты',
      paymentHistory: 'Выплаты / бонусы / штрафы',
      paymentLabel: 'Выплата',
      bonusLabel: 'Бонус',
      fineLabel: 'Штраф',
      active: 'Активен',
      inactive: 'Неактивен',
      deactivate: 'Деактивировать',
      reactivate: 'Включить снова',
      page: 'Страница',
      empty: 'Настроек зарплаты пока нет',
      migration: 'Таблицы зарплат не обновлены. Запустите миграции с supabase/054_employee_salary_profiles.sql по supabase/063_employee_salary_absences.sql и supabase/099_employee_salary_fines.sql.',
      readOnly: 'Эта страница доступна только владельцу.',
      telegramTitle: 'Telegram-уведомления',
      telegramHelp: 'Отправьте сотруднику личную ссылку, которая действует 30 минут.',
      telegramCreateLink: 'Создать ссылку',
      telegramCopy: 'Копировать',
      telegramCopied: 'Ссылка Telegram скопирована',
      telegramLinked: 'Telegram подключён',
      telegramBotMissing: 'Не настроен VITE_TELEGRAM_BOT_USERNAME.',
      telegramDeliveryTitle: 'Статус уведомлений о выплатах',
      telegramDeliveryHelp: 'Проверяйте доставку в Telegram и подтверждение сотрудника.',
      telegramDeliveryEmpty: 'Уведомлений о выплатах пока нет.',
      telegramDeliveryMigration: 'Запустите миграцию 108 для истории уведомлений о выплатах.',
      telegramStatusPending: 'Ожидает',
      telegramStatusSent: 'Отправлено',
      telegramStatusFailed: 'Ошибка',
      telegramStatusSkipped: 'Пропущено',
      telegramStatusConfirmed: 'Получено',
      telegramMessageId: 'Сообщение',
    },
    en: {
      title: 'Salaries',
      sub: 'Joining date, salary, and amount due',
      back: 'Back to accounting',
      add: 'Add employee salary',
      employee: 'Employee',
      employeeName: 'Employee name',
      joined: 'Joining date',
      effectiveDate: 'Effective date',
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
      paymentBonus: 'Record payment / bonus / fine',
      paymentEntry: 'Payment',
      bonusEntry: 'Bonus',
      fineEntry: 'Fine',
      bonus: 'Bonus',
      addBonus: 'Add bonus',
      addFine: 'Record fine',
      paidDate: 'Paid date',
      bonusDate: 'Bonus date',
      fineDate: 'Fine date',
      fineReason: 'Reason for fine',
      absence: 'Absence',
      markAbsence: 'Mark absence',
      absenceDate: 'Absent date',
      absenceHistory: 'Absent dates',
      absentLabel: 'Absent',
      amount: 'Amount',
      due: 'Salary due',
      totalDue: 'Total due',
      monthlyPayroll: 'Monthly salaries',
      employees: 'Employees',
      openEmployees: 'Open employee list',
      quickActions: 'Daily operations',
      quickActionsHelp: 'Record payments, bonuses, fines, and absences in one place.',
      salarySettings: 'Salary setup',
      salarySettingsHelp: 'Set a salary for a new employee or change an active rate.',
      addHelp: 'Enter a new employee and their starting salary.',
      changeHelp: 'Set the new rate and the date it takes effect.',
      transactionHelp: 'Choose an operation first, then select the employee and amount.',
      paymentHelp: 'A payment reduces the amount owed to the employee.',
      bonusHelp: 'A bonus is an additional payment outside regular salary.',
      fineHelp: 'A fine reduces payroll liability but is not a cash expense.',
      absenceHelp: 'Mark the employee who was absent on the selected date.',
      absenceDuplicate: 'This employee is already marked absent on the selected date.',
      createdMessage: 'Employee salary added',
      rateSavedMessage: 'New salary rate saved',
      transactionSavedMessage: 'Transaction saved',
      paymentTelegramFailed: 'Payment saved, but the Telegram message was not sent.',
      absenceSavedMessage: 'Absence saved',
      accruedToday: 'Daily expense',
      history: 'Salary history',
      historyBtn: 'History',
      payments: 'Payments',
      paymentHistory: 'Payments / bonuses / fines',
      paymentLabel: 'Payment',
      bonusLabel: 'Bonus',
      fineLabel: 'Fine',
      active: 'Active',
      inactive: 'Inactive',
      deactivate: 'Deactivate',
      reactivate: 'Reactivate',
      page: 'Page',
      empty: 'No salary settings yet',
      migration: 'Salary tables are not up to date. Run migrations from supabase/054_employee_salary_profiles.sql through supabase/063_employee_salary_absences.sql, plus supabase/099_employee_salary_fines.sql.',
      readOnly: 'Only the owner can manage this page.',
      telegramTitle: 'Telegram notifications',
      telegramHelp: 'Send the employee a private link that expires after 30 minutes.',
      telegramCreateLink: 'Create link',
      telegramCopy: 'Copy',
      telegramCopied: 'Telegram link copied',
      telegramLinked: 'Telegram linked',
      telegramBotMissing: 'VITE_TELEGRAM_BOT_USERNAME is not configured.',
      telegramDeliveryTitle: 'Payment notification status',
      telegramDeliveryHelp: 'Track Telegram delivery and employee confirmation.',
      telegramDeliveryEmpty: 'No payment notifications yet.',
      telegramDeliveryMigration: 'Run migration 108 to enable payment notification history.',
      telegramStatusPending: 'Pending',
      telegramStatusSent: 'Sent',
      telegramStatusFailed: 'Failed',
      telegramStatusSkipped: 'Skipped',
      telegramStatusConfirmed: 'Received',
      telegramMessageId: 'Message',
    },
  }
  const l = L[lang] || L.en

  const [salaryProfiles, setSalaryProfiles] = useState([])
  const [telegramLinks, setTelegramLinks] = useState([])
  const [paymentDeliveries, setPaymentDeliveries] = useState([])
  const [paymentDeliveriesUnavailable, setPaymentDeliveriesUnavailable] = useState(false)
  const [telegramSalaryProfileId, setTelegramSalaryProfileId] = useState('')
  const [telegramInviteUrl, setTelegramInviteUrl] = useState('')
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
  const [absenceForm, setAbsenceForm] = useState({
    salary_profile_id: '',
    absence_date: today,
    note: '',
  })

  async function loadData() {
    setLoading(true)
    setError('')
    const [teamRes, profileRes, rateRes, paymentRes, bonusRes, fineRes, absenceRes, telegramLinkRes, paymentDeliveryRes] = await Promise.all([
      supabase.from('profiles').select('id, full_name, email, role, status, created_at').order('full_name'),
      supabase.from('employee_salary_profiles').select('*').order('employee_name'),
      supabase.from('employee_salary_rates').select('*').order('effective_from', { ascending: false }),
      supabase.from('employee_salary_payments').select('*').order('paid_date', { ascending: false }),
      supabase.from('employee_salary_bonuses').select('*').order('bonus_date', { ascending: false }),
      supabase.from('employee_salary_fines').select('*').order('fine_date', { ascending: false }),
      supabase.from('employee_salary_absences').select('*').order('absence_date', { ascending: false }),
      supabase.from('employee_salary_telegram_links').select('salary_profile_id, telegram_user_id, linked_at, notifications_enabled'),
      supabase.from('employee_salary_payment_notification_deliveries')
        .select('id, payment_id, salary_profile_id, status, telegram_message_id, error_message, attempted_at, sent_at, confirmed_at')
        .order('attempted_at', { ascending: false })
        .limit(20),
    ])
    if (profileRes.error || rateRes.error || paymentRes.error || bonusRes.error || absenceRes.error) {
      const err = profileRes.error || rateRes.error || paymentRes.error || bonusRes.error || absenceRes.error
      setError(isMissingSalaryMigration(err) ? l.migration : err.message)
      setSalaryProfiles([])
    } else {
      if (fineRes.error) setError(isMissingSalaryMigration(fineRes.error) ? l.migration : fineRes.error.message)
      const teamRows = teamRes.data || []
      setSalaryProfiles(composeSalaryProfiles(profileRes.data || [], rateRes.data || [], paymentRes.data || [], bonusRes.data || [], fineRes.error ? [] : fineRes.data || [], absenceRes.data || [], teamRows)
        .filter(salaryProfile => !salaryProfile.deleted_at))
      setTelegramLinks(telegramLinkRes.error ? [] : telegramLinkRes.data || [])
      setPaymentDeliveries(paymentDeliveryRes.error ? [] : paymentDeliveryRes.data || [])
      setPaymentDeliveriesUnavailable(Boolean(paymentDeliveryRes.error))
    }
    setLoading(false)
  }

  useEffect(() => { loadData() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function createTelegramInvite() {
    const botUsername = String(import.meta.env.VITE_TELEGRAM_BOT_USERNAME || '').trim().replace(/^@/, '')
    if (!botUsername) {
      setError(l.telegramBotMissing)
      return
    }
    if (!canManage || !telegramSalaryProfileId) return

    setError('')
    setMessage('')
    setTelegramInviteUrl('')
    setSaving('telegram-link')
    const { data: token, error: linkError } = await supabase.rpc('create_employee_salary_telegram_link', {
      target_salary_profile_id: telegramSalaryProfileId,
    })
    setSaving('')
    if (linkError) {
      setError(linkError.message)
      return
    }
    setTelegramInviteUrl(`https://t.me/${botUsername}?start=employee_${token}`)
  }

  async function copyTelegramInvite() {
    if (!telegramInviteUrl) return
    try {
      await navigator.clipboard.writeText(telegramInviteUrl)
      setMessage(l.telegramCopied)
    } catch {
      setError(telegramInviteUrl)
    }
  }

  const sortedSalaryProfiles = useMemo(() => (
    [...salaryProfiles].sort((a, b) => {
      if (Boolean(a.is_active) !== Boolean(b.is_active)) return a.is_active ? -1 : 1
      const dueDiff = getSalaryDue(b, today) - getSalaryDue(a, today)
      if (dueDiff !== 0) return dueDiff
      return String(a.employee_name || '').localeCompare(String(b.employee_name || ''))
    })
  ), [salaryProfiles, today])
  const pageCount = Math.max(1, Math.ceil(sortedSalaryProfiles.length / PAGE_SIZE))
  const pagedSalaryProfiles = useMemo(() => (
    sortedSalaryProfiles.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  ), [sortedSalaryProfiles, page])
  const activeSalaryProfiles = useMemo(() => (
    sortedSalaryProfiles.filter(item => item.is_active !== false)
  ), [sortedSalaryProfiles])
  const paymentDeliveryRows = useMemo(() => {
    const salaryProfileMap = new Map(salaryProfiles.map(item => [item.id, item]))
    return paymentDeliveries.map(delivery => {
      const salaryProfile = salaryProfileMap.get(delivery.salary_profile_id)
      const payment = salaryProfile?.payments?.find(item => item.id === delivery.payment_id)
      return {
        ...delivery,
        employeeName: salaryProfile?.employee_name || salaryProfile?.profile?.full_name || '—',
        amount: payment?.amount || 0,
        paidDate: payment?.paid_date || '',
      }
    })
  }, [paymentDeliveries, salaryProfiles])
  const paymentDeliveryStatusLabels = {
    pending: l.telegramStatusPending,
    sent: l.telegramStatusSent,
    failed: l.telegramStatusFailed,
    skipped: l.telegramStatusSkipped,
    confirmed: l.telegramStatusConfirmed,
  }
  const paymentDeliveryStatusClasses = {
    pending: 'border-amber-200 bg-amber-50 text-amber-700',
    sent: 'border-blue-200 bg-blue-50 text-blue-700',
    failed: 'border-red-200 bg-red-50 text-red-700',
    skipped: 'border-gray-200 bg-gray-50 text-gray-600',
    confirmed: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  }
  const transactionSalaryProfiles = useMemo(() => (
    sortedSalaryProfiles.filter(item => canRecordSalaryTransaction(
      item,
      transactionForm.entry_type,
      transactionForm.paid_date || today
    ))
  ), [sortedSalaryProfiles, transactionForm.entry_type, transactionForm.paid_date, today])
  const totalDue = useMemo(() => getTotalSalaryDue(salaryProfiles, today), [salaryProfiles, today])
  const monthlyPayrollTotal = useMemo(() => getTotalMonthlySalaryCommitment(salaryProfiles, today), [salaryProfiles, today])
  const selectedTransactionProfile = salaryProfiles.find(item => item.id === transactionForm.salary_profile_id)
  const selectedAbsenceProfile = salaryProfiles.find(item => item.id === absenceForm.salary_profile_id)
  const selectedAbsenceDate = String(absenceForm.absence_date || today).slice(0, 10)
  const absenceAlreadyRecorded = Boolean(
    selectedAbsenceProfile &&
    selectedAbsenceDate &&
    getSalaryAbsenceDates(selectedAbsenceProfile).has(selectedAbsenceDate)
  )
  const transactionGuidance = transactionForm.entry_type === 'fine'
    ? l.fineHelp
    : transactionForm.entry_type === 'bonus'
      ? l.bonusHelp
      : l.paymentHelp
  const salaryHistoryLabels = useMemo(() => ({
    absence: l.absenceHistory,
    payment: l.paymentHistory,
  }), [l.absenceHistory, l.paymentHistory])

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
    setMessage(l.createdMessage)
    setForm(current => ({ ...current, employee_name: '', salary_amount: '' }))
    await loadData()
  }

  async function addRate() {
    const selectedProfile = salaryProfiles.find(item => item.id === changeForm.salary_profile_id)
    if (!selectedProfile) return
    const amount = normalizeExpenseAmount(changeForm.salary_amount)
    const effectiveFrom = changeForm.effective_from || today
    if (!canManage || amount <= 0) return
    setError('')
    setMessage('')
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
    setMessage(l.rateSavedMessage)
    await loadData()
  }

  async function addTransaction() {
    const salaryProfile = salaryProfiles.find(item => item.id === transactionForm.salary_profile_id)
    if (!salaryProfile) return
    const paidDate = transactionForm.paid_date || today
    const due = getSalaryDue(salaryProfile, paidDate)
    const amount = normalizeExpenseAmount(transactionForm.amount || due)
    const entryType = transactionForm.entry_type
    const isBonus = entryType === 'bonus'
    const isFine = entryType === 'fine'
    const reason = String(transactionForm.note || '').trim()
    if (!canManage || amount <= 0 || (isFine && !reason) || !canRecordSalaryTransaction(salaryProfile, entryType, paidDate)) return
    setError('')
    setMessage('')
    setSaving(`${entryType}-create`)
    let writeResult
    if (isFine) {
      writeResult = await supabase.from('employee_salary_fines').insert({
        salary_profile_id: salaryProfile.id,
        fine_date: paidDate,
        amount,
        reason,
        created_by: profile?.id || null,
        created_by_name: profile?.full_name || profile?.email || state.user?.name || '',
      }).select('id').single()
    } else if (isBonus) {
      writeResult = await supabase.from('employee_salary_bonuses').insert({
        salary_profile_id: salaryProfile.id,
        bonus_date: paidDate,
        amount,
        payment_method: transactionForm.payment_method || salaryProfile.payment_method || 'cash',
        note: transactionForm.note || '',
        created_by: profile?.id || null,
        created_by_name: profile?.full_name || profile?.email || state.user?.name || '',
      })
    } else {
      writeResult = await supabase.from('employee_salary_payments').insert({
        salary_profile_id: salaryProfile.id,
        paid_date: paidDate,
        amount,
        payment_method: transactionForm.payment_method || salaryProfile.payment_method || 'cash',
        note: transactionForm.note || '',
        created_by: profile?.id || null,
        created_by_name: profile?.full_name || profile?.email || state.user?.name || '',
      }).select('id').single()
    }
    setSaving('')
    const { error: writeError } = writeResult
    if (writeError) {
      setError(writeError.message)
      return
    }
    let paymentTelegramSent = true
    if (isFine) await notifyTelegramEmployeeFine(writeResult.data?.id)
    if (!isFine && !isBonus) {
      paymentTelegramSent = await notifyTelegramEmployeePayment(writeResult.data?.id)
    }
    setTransactionForm({
      salary_profile_id: '',
      entry_type: 'payment',
      paid_date: today,
      amount: '',
      payment_method: 'cash',
      note: '',
    })
    setMessage(paymentTelegramSent ? l.transactionSavedMessage : l.paymentTelegramFailed)
    await loadData()
  }

  async function addAbsence() {
    const salaryProfile = salaryProfiles.find(item => item.id === absenceForm.salary_profile_id)
    const absenceDate = String(absenceForm.absence_date || today).slice(0, 10)
    if (!canManage || !salaryProfile || !absenceDate) return
    setError('')
    setMessage('')
    if (getSalaryAbsenceDates(salaryProfile).has(absenceDate)) {
      setError(l.absenceDuplicate)
      return
    }
    setSaving('absence-create')
    const { error: writeError } = await supabase.from('employee_salary_absences').insert({
      salary_profile_id: salaryProfile.id,
      absence_date: absenceDate,
      note: absenceForm.note || '',
      created_by: profile?.id || null,
      created_by_name: profile?.full_name || profile?.email || state.user?.name || '',
    })
    setSaving('')
    if (writeError) {
      setError(writeError.code === '23505' ? l.absenceDuplicate : writeError.message)
      return
    }
    setAbsenceForm({ salary_profile_id: '', absence_date: today, note: '' })
    setMessage(l.absenceSavedMessage)
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

  async function deleteFine(fine) {
    if (!canManage || !fine?.id) return
    const key = `fine-delete-${fine.id}`
    if (confirmActionKey !== key) {
      setConfirmActionKey(key)
      return
    }
    setSaving(key)
    const { error: deleteError } = await supabase.from('employee_salary_fines').delete().eq('id', fine.id)
    setSaving('')
    setConfirmActionKey('')
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    await loadData()
  }

  async function deleteAbsence(absence) {
    if (!canManage || !absence?.id) return
    const key = `absence-delete-${absence.id}`
    if (confirmActionKey !== key) {
      setConfirmActionKey(key)
      return
    }
    setSaving(key)
    const { error: deleteError } = await supabase.from('employee_salary_absences').delete().eq('id', absence.id)
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
    const nextActive = salaryProfile.is_active === false
    if (nextActive) {
      const absenceRows = buildSalaryReactivationAbsenceRows(salaryProfile, today)
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
      .update({
        is_active: false,
        ended_at: salaryProfile.ended_at || today,
        deleted_at: new Date().toISOString(),
      })
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
          <header className="mb-6">
            <button onClick={() => navigate('/admin/accounting')} className="mb-3 inline-flex items-center gap-2 text-xs font-black text-[#6B7280] transition-colors hover:text-[#ff5a00]">
              <ArrowLeft size={14} />{l.back}
            </button>
            <div className="mb-5">
              <h1 className="text-2xl font-black text-[#1F2937] sm:text-3xl">{l.title}</h1>
              <p className="mt-1 text-sm font-medium text-[#6B7280]">{l.sub}</p>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <MetricCard
                icon={BadgeMinus}
                label={l.totalDue}
                value={loading ? '—' : formatCurrency(totalDue)}
                tone="orange"
              />
              <MetricCard
                icon={WalletCards}
                label={l.monthlyPayroll}
                value={loading ? '—' : formatCurrency(monthlyPayrollTotal)}
                tone="blue"
              />
              <button
                type="button"
                onClick={() => navigate('/admin/accounting/employees')}
                className="group flex min-h-[88px] items-center gap-3 rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-md"
              >
                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-orange-50 text-[#ff5a00]">
                  <Users size={19} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[11px] font-black uppercase tracking-wide text-[#6B7280]">{l.employees}</span>
                  <span className="mt-0.5 block text-lg font-black text-[#1F2937]">{loading ? '—' : activeSalaryProfiles.length}</span>
                  <span className="block text-[11px] font-bold text-[#ff5a00] group-hover:underline">{l.openEmployees}</span>
                </span>
              </button>
            </div>
          </header>

          {!canManage && <div className="mb-5 rounded-xl border border-orange-100 bg-orange-50 px-4 py-3 text-sm font-bold text-[#ff5a00]">{l.readOnly}</div>}
          {error && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}
          {message && !error && <div role="status" aria-live="polite" className="mb-5 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-bold text-green-700">{message}</div>}

          <section className="mb-7" aria-labelledby="salary-operations-heading">
            <SectionHeading
              id="salary-operations-heading"
              title={l.quickActions}
              description={l.quickActionsHelp}
            />
            <div className={SECTION_GRID}>
              <div className="flex h-full flex-col rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm sm:p-5">
                <CardHeading icon={WalletCards} title={l.paymentBonus} description={l.transactionHelp} tone="orange" />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid grid-cols-3 gap-2 sm:col-span-2" role="group" aria-label={l.paymentBonus}>
                    {['payment', 'bonus', 'fine'].map(entryType => {
                      const active = transactionForm.entry_type === entryType
                      const isFine = entryType === 'fine'
                      const isBonus = entryType === 'bonus'
                      return (
                        <button
                          key={entryType}
                          type="button"
                          onClick={() => setTransactionForm(current => {
                            const selectedProfile = salaryProfiles.find(item => item.id === current.salary_profile_id)
                            const paidDate = current.paid_date || today
                            const keepSelected = canRecordSalaryTransaction(selectedProfile, entryType, paidDate)
                            return {
                              ...current,
                              entry_type: entryType,
                              salary_profile_id: keepSelected ? current.salary_profile_id : '',
                              amount: keepSelected && entryType === 'payment'
                                ? String(getSalaryDue(selectedProfile, paidDate) || '')
                                : '',
                              note: '',
                            }
                          })}
                          disabled={!canManage || loading}
                          aria-pressed={active}
                          className={`flex h-11 items-center justify-center rounded-xl border text-xs font-black transition-colors sm:text-sm ${
                            active && isFine
                              ? 'border-red-400 bg-red-50 text-red-700 ring-2 ring-red-100'
                              : active && isBonus
                                ? 'border-blue-400 bg-blue-50 text-blue-700 ring-2 ring-blue-100'
                              : active
                                ? 'border-[#ff5a00] bg-orange-50 text-[#ff5a00] ring-2 ring-orange-100'
                                : 'border-[#E5E7EB] bg-white text-[#6B7280] hover:bg-gray-50 disabled:cursor-not-allowed disabled:bg-gray-100'
                          }`}
                        >
                          {isFine ? l.fineEntry : entryType === 'bonus' ? l.bonusEntry : l.paymentEntry}
                        </button>
                      )
                    })}
                  </div>
                  <p className={`rounded-xl px-3 py-2 text-xs font-semibold sm:col-span-2 ${transactionForm.entry_type === 'fine' ? 'bg-red-50 text-red-700' : transactionForm.entry_type === 'bonus' ? 'bg-blue-50 text-blue-700' : 'bg-orange-50 text-[#9a4300]'}`}>
                    {transactionGuidance}
                  </p>
                  <div className="sm:col-span-2">
                    <Field
                      label={l.employee}
                      hint={selectedTransactionProfile ? `${l.due}: ${formatCurrency(getSalaryDue(selectedTransactionProfile, transactionForm.paid_date || today))}` : ''}
                    >
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
                        disabled={!canManage || loading}
                      >
                        <option value="">{l.selectEmployee}</option>
                        {transactionSalaryProfiles.map(item => {
                          const name = item.employee_name || item.profile?.full_name || item.profile?.email
                          const inactiveDue = item.is_active === false
                            ? ` · ${l.inactive} · ${l.due}: ${formatCurrency(getSalaryDue(item, transactionForm.paid_date || today))}`
                            : ''
                          return <option key={item.id} value={item.id}>{name}{inactiveDue}</option>
                        })}
                      </select>
                    </Field>
                  </div>
                  <Field label={transactionForm.entry_type === 'fine' ? l.fineDate : transactionForm.entry_type === 'bonus' ? l.bonusDate : l.paidDate}>
                    <DateInput
                      value={transactionForm.paid_date}
                      lang={lang}
                      onChange={value => {
                        const nextPaidDate = value
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
                      disabled={!canManage || loading}
                    />
                  </Field>
                  <Field label={l.amount}>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatAmountInput(transactionForm.amount)}
                      onChange={event => setTransactionForm(current => ({ ...current, amount: parseAmountInput(event.target.value) }))}
                      placeholder="0 UZS"
                      className={FIELD}
                      disabled={!canManage || loading}
                    />
                  </Field>
                  {transactionForm.entry_type !== 'fine' && (
                    <Field label={l.method}>
                      <select
                        value={transactionForm.payment_method}
                        onChange={event => setTransactionForm(current => ({ ...current, payment_method: event.target.value }))}
                        className={FIELD}
                        disabled={!canManage || loading}
                      >
                        {EXPENSE_PAYMENT_METHODS.map(method => <option key={method} value={method}>{expensePaymentMethodLabel(method, lang)}</option>)}
                      </select>
                    </Field>
                  )}
                  {transactionForm.entry_type === 'fine' && (
                    <div className="sm:col-span-2">
                      <Field label={l.fineReason}>
                        <input
                          type="text"
                          value={transactionForm.note}
                          onChange={event => setTransactionForm(current => ({ ...current, note: event.target.value }))}
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="none"
                          spellCheck={false}
                          data-gramm="false"
                          data-gramm_editor="false"
                          className={FIELD}
                          disabled={!canManage || loading}
                          required
                        />
                      </Field>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={addTransaction}
                    disabled={!canManage || loading || !transactionForm.salary_profile_id || normalizeExpenseAmount(transactionForm.amount) <= 0 || (transactionForm.entry_type === 'fine' && !transactionForm.note.trim()) || (saving !== '' && ['payment-create', 'bonus-create', 'fine-create'].includes(saving))}
                    className={`inline-flex h-11 self-end items-center justify-center gap-2 rounded-xl px-4 text-sm font-black text-white shadow-sm transition-colors disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500 disabled:shadow-none ${transactionForm.entry_type === 'fine' ? 'bg-red-600 hover:bg-red-700 sm:col-span-2' : transactionForm.entry_type === 'bonus' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-[#ff5a00] hover:bg-[#e85100]'}`}
                  >
                    {['payment-create', 'bonus-create', 'fine-create'].includes(saving)
                      ? <Loader2 size={16} className="animate-spin" />
                      : transactionForm.entry_type === 'fine'
                        ? <BadgeMinus size={15} />
                        : transactionForm.entry_type === 'bonus'
                          ? <Plus size={15} />
                          : <WalletCards size={15} />}
                    {transactionForm.entry_type === 'fine' ? l.addFine : transactionForm.entry_type === 'bonus' ? l.addBonus : l.recordPayment}
                  </button>
                </div>
              </div>
              <div className="flex h-full flex-col rounded-2xl border border-red-100 bg-white p-4 shadow-sm sm:p-5">
                  <CardHeading icon={CalendarX2} title={l.markAbsence} description={l.absenceHelp} tone="red" />
                  <div className="flex flex-1 flex-col gap-4">
                    <Field label={l.employee}>
                      <select
                        value={absenceForm.salary_profile_id}
                        onChange={event => setAbsenceForm(current => ({ ...current, salary_profile_id: event.target.value }))}
                        className={FIELD}
                        disabled={!canManage || loading}
                      >
                        <option value="">{l.selectEmployee}</option>
                        {activeSalaryProfiles.map(item => (
                          <option key={item.id} value={item.id}>{item.employee_name || item.profile?.full_name || item.profile?.email}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label={l.absenceDate}>
                      <DateInput value={absenceForm.absence_date} lang={lang} onChange={value => setAbsenceForm(current => ({ ...current, absence_date: value }))} disabled={!canManage || loading} />
                    </Field>
                    {absenceAlreadyRecorded && (
                      <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
                        {l.absenceDuplicate}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={addAbsence}
                      disabled={!canManage || loading || !absenceForm.salary_profile_id || !absenceForm.absence_date || absenceAlreadyRecorded || saving === 'absence-create'}
                      className="mt-auto inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-black text-white shadow-sm transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500 disabled:shadow-none"
                    >
                      {saving === 'absence-create' ? <Loader2 size={16} className="animate-spin" /> : <CalendarX2 size={15} />}
                      {l.absence}
                    </button>
                  </div>
              </div>
            </div>
          </section>

          <section className="mb-5" aria-labelledby="salary-settings-heading">
            <SectionHeading
              id="salary-settings-heading"
              title={l.salarySettings}
              description={l.salarySettingsHelp}
            />
            <div className={SECTION_GRID}>
              <div className="h-full rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm sm:p-5">
                <CardHeading icon={Plus} title={l.add} description={l.addHelp} tone="orange" />
                <form onSubmit={createSalaryProfile} className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Field label={l.employeeName}>
                      <input
                        type="text"
                        value={form.employee_name}
                        onChange={event => setForm(current => ({ ...current, employee_name: event.target.value }))}
                        className={FIELD}
                        disabled={!canManage || loading}
                      />
                    </Field>
                  </div>
                  <Field label={l.effectiveDate}>
                    <DateInput value={form.joined_at} lang={lang} onChange={value => setForm(current => ({ ...current, joined_at: value }))} disabled={!canManage || loading} />
                  </Field>
                  <Field label={l.salaryAmount}>
                    <input type="text" inputMode="numeric" value={formatAmountInput(form.salary_amount)} onChange={event => setForm(current => ({ ...current, salary_amount: parseAmountInput(event.target.value) }))} placeholder="0 UZS" className={FIELD} disabled={!canManage || loading} />
                  </Field>
                  <Field label={l.salaryUnit}>
                    <select value={form.salary_unit} onChange={event => setForm(current => ({ ...current, salary_unit: event.target.value }))} className={FIELD} disabled={!canManage || loading}>
                      {SALARY_RATE_UNITS.map(item => <option key={item} value={item}>{salaryRateUnitLabel(item, lang)}</option>)}
                    </select>
                  </Field>
                  <button
                    disabled={!canManage || loading || !form.employee_name.trim() || normalizeExpenseAmount(form.salary_amount) <= 0 || saving === 'create'}
                    className="flex h-11 self-end items-center justify-center gap-2 rounded-xl bg-[#ff5a00] px-4 text-sm font-black text-white shadow-sm transition-colors hover:bg-[#e85100] disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500 disabled:shadow-none"
                  >
                    {saving === 'create' ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}{l.save}
                  </button>
                </form>
              </div>

              <div className="h-full rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm sm:p-5">
                <CardHeading icon={Save} title={l.changeSalary} description={l.changeHelp} tone="dark" />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
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
                        disabled={!canManage || loading}
                      >
                        <option value="">{l.selectEmployee}</option>
                        {activeSalaryProfiles.map(item => (
                          <option key={item.id} value={item.id}>{item.employee_name || item.profile?.full_name || item.profile?.email}</option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <Field label={l.effectiveDate}>
                    <DateInput value={changeForm.effective_from} lang={lang} onChange={value => setChangeForm(current => ({ ...current, effective_from: value }))} disabled={!canManage || loading} />
                  </Field>
                  <Field label={l.salaryAmount}>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatAmountInput(changeForm.salary_amount)}
                      onChange={event => setChangeForm(current => ({ ...current, salary_amount: parseAmountInput(event.target.value) }))}
                      placeholder="0 UZS"
                      className={FIELD}
                      disabled={!canManage || loading}
                    />
                  </Field>
                  <Field label={l.salaryUnit}>
                    <select value={changeForm.salary_unit} onChange={event => setChangeForm(current => ({ ...current, salary_unit: event.target.value }))} className={FIELD} disabled={!canManage || loading}>
                      {SALARY_RATE_UNITS.map(item => <option key={item} value={item}>{salaryRateUnitLabel(item, lang)}</option>)}
                    </select>
                  </Field>
                  <button
                    type="button"
                    onClick={() => addRate()}
                    disabled={!canManage || loading || !changeForm.salary_profile_id || normalizeExpenseAmount(changeForm.salary_amount) <= 0 || saving === 'rate-create'}
                    className="inline-flex h-11 self-end items-center justify-center gap-2 rounded-xl bg-[#1F2937] px-4 text-sm font-black text-white shadow-sm transition-colors hover:bg-black disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500 disabled:shadow-none"
                  >
                    {saving === 'rate-create' ? <Loader2 size={16} className="animate-spin" /> : <Save size={15} />}{l.save}
                  </button>
                </div>
              </div>

              <div className="h-full rounded-2xl border border-blue-100 bg-white p-4 shadow-sm sm:p-5 lg:col-span-2">
                <CardHeading icon={Send} title={l.telegramTitle} description={l.telegramHelp} tone="blue" />
                <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <Field label={l.selectEmployee}>
                    <select
                      value={telegramSalaryProfileId}
                      onChange={event => {
                        setTelegramSalaryProfileId(event.target.value)
                        setTelegramInviteUrl('')
                      }}
                      className={FIELD}
                      disabled={!canManage || loading}
                    >
                      <option value="">{l.selectEmployee}</option>
                      {activeSalaryProfiles.map(item => {
                        const linked = telegramLinks.some(link => link.salary_profile_id === item.id && link.linked_at)
                        const name = item.employee_name || item.profile?.full_name || item.profile?.email
                        return <option key={item.id} value={item.id}>{name}{linked ? ` · ${l.telegramLinked}` : ''}</option>
                      })}
                    </select>
                  </Field>
                  <button
                    type="button"
                    onClick={createTelegramInvite}
                    disabled={!canManage || loading || !telegramSalaryProfileId || saving === 'telegram-link'}
                    className="inline-flex h-11 self-end items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-black text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500"
                  >
                    {saving === 'telegram-link' ? <Loader2 size={16} className="animate-spin" /> : <Send size={15} />}
                    {l.telegramCreateLink}
                  </button>
                  {telegramInviteUrl && (
                    <div className="flex min-w-0 items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 p-2 sm:col-span-2">
                      <input readOnly value={telegramInviteUrl} className={`${FIELD} min-w-0 bg-white font-mono text-xs`} />
                      <button
                        type="button"
                        onClick={copyTelegramInvite}
                        className="inline-flex h-11 flex-shrink-0 items-center justify-center gap-2 rounded-xl bg-[#1F2937] px-4 text-sm font-black text-white hover:bg-black"
                      >
                        <Copy size={15} />{l.telegramCopy}
                      </button>
                    </div>
                  )}
                  <div className="mt-2 border-t border-blue-100 pt-4 sm:col-span-2">
                    <div className="mb-3">
                      <p className="text-sm font-black text-[#1F2937]">{l.telegramDeliveryTitle}</p>
                      <p className="mt-0.5 text-xs font-semibold text-gray-500">{l.telegramDeliveryHelp}</p>
                    </div>
                    {paymentDeliveriesUnavailable ? (
                      <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs font-bold text-amber-800">
                        {l.telegramDeliveryMigration}
                      </p>
                    ) : paymentDeliveryRows.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-blue-200 bg-blue-50/50 px-3 py-4 text-center text-xs font-semibold text-gray-500">
                        {l.telegramDeliveryEmpty}
                      </p>
                    ) : (
                      <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                        {paymentDeliveryRows.map(delivery => (
                          <div key={delivery.id} className="rounded-xl border border-gray-200 bg-gray-50/60 px-3 py-3">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-black text-[#1F2937]">{delivery.employeeName}</p>
                                <p className="mt-0.5 text-xs font-bold text-gray-600">
                                  {formatCurrency(delivery.amount)}
                                  {delivery.paidDate ? ` · ${formatLongDate(delivery.paidDate, lang, delivery.paidDate)}` : ''}
                                </p>
                              </div>
                              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${
                                paymentDeliveryStatusClasses[delivery.status] || paymentDeliveryStatusClasses.pending
                              }`}>
                                {paymentDeliveryStatusLabels[delivery.status] || delivery.status}
                              </span>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-semibold text-gray-500">
                              <span>{formatDateTime(delivery.confirmed_at || delivery.sent_at || delivery.attempted_at, '—')}</span>
                              {delivery.telegram_message_id && (
                                <span>{l.telegramMessageId} #{delivery.telegram_message_id}</span>
                              )}
                            </div>
                            {delivery.error_message && (
                              <p className="mt-2 break-words rounded-lg bg-red-50 px-2.5 py-2 text-[11px] font-semibold text-red-700">
                                {delivery.error_message}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  )
}

function MetricCard({ icon: Icon, label, value, tone = 'orange' }) {
  const tones = {
    orange: {
      card: 'border-orange-200 bg-orange-50/70',
      icon: 'bg-white text-[#ff5a00]',
      label: 'text-[#c94b00]',
    },
    blue: {
      card: 'border-blue-200 bg-blue-50/70',
      icon: 'bg-white text-blue-700',
      label: 'text-blue-700',
    },
  }
  const colors = tones[tone] || tones.orange
  return (
    <div className={`flex min-h-[88px] items-center gap-3 rounded-2xl border px-4 py-3 shadow-sm ${colors.card}`}>
      <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl shadow-sm ${colors.icon}`}>
        <Icon size={19} />
      </span>
      <span className="min-w-0">
        <span className={`block text-[11px] font-black uppercase tracking-wide ${colors.label}`}>{label}</span>
        <span className="mt-1 block text-base font-black leading-tight text-[#1F2937] lg:text-lg">{value}</span>
      </span>
    </div>
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
  const iconTone = tone === 'red'
    ? 'bg-red-50 text-red-600'
    : tone === 'dark'
      ? 'bg-gray-100 text-[#1F2937]'
      : 'bg-orange-50 text-[#ff5a00]'
  return (
    <div className="mb-5 flex items-start gap-3 sm:min-h-[56px]">
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

function Field({ label, hint = '', children }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-xs font-bold text-[#596170]">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-[11px] font-semibold text-[#6B7280]">{hint}</span>}
    </label>
  )
}

function DateInput({ value, lang, onChange, disabled = false }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm font-semibold text-[#1F2937]">
        {formatLongDate(value, lang, value)}
      </span>
      <input
        type="date"
        value={value}
        onChange={event => onChange(event.target.value)}
        className={`${FIELD} text-transparent caret-transparent`}
        disabled={disabled}
      />
    </div>
  )
}
