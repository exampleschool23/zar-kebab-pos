import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  Banknote,
  BarChart2,
  CalendarDays,
  CreditCard,
  Edit3,
  FileText,
  Loader2,
  Package,
  Plus,
  ReceiptText,
  RefreshCw,
  Save,
  Scale,
  Search,
  Send,
  ShoppingBasket,
  Terminal,
  Trash2,
  TrendingDown,
  TrendingUp,
  UserRound,
  WalletCards,
  X,
} from 'lucide-react'
import AppShell from '../components/AppShell'
import { OperationalError, OperationalLoading } from '../components/OperationalState'
import { useApp } from '../store/AppContext'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { canEditFeature } from '../lib/permissions'
import { formatCurrency } from '../lib/formatCurrency'
import { formatLongDate } from '../lib/dateFormat'
import { formatMoneyInput, normalizeMoneyInput } from '../lib/moneyInput'
import { withWriteTimeout } from '../lib/writeTimeout'
import {
  BAZAAR_CATEGORIES,
  BAZAAR_ENTRY_CATEGORIES,
  BAZAAR_ENTRY_UNITS,
  BAZAAR_ENTRY_PAYMENT_METHODS,
  BAZAAR_PAYMENT_METHODS,
  bazaarCategoryLabel,
  bazaarPaymentMethodLabel,
  bazaarUnitLabel,
  calculateBazaarTotal,
  filterBazaarPurchases,
  formatBazaarQuantity,
  getBazaarPurchaseScopedItems,
  getBazaarPurchaseScopedTotal,
  getBazaarDisplayQuantity,
  getBazaarRange,
  getBazaarSubmissionAttempt,
  getBazaarUnitCost,
  normalizeBazaarProductKey,
  normalizeBazaarPurchase,
  normalizeBazaarQuantity,
  normalizeBazaarQuantityToBase,
  summarizeBazaarPurchases,
  todayBazaarDate,
  validateBazaarPurchase,
} from '../lib/bazaar'

const PURCHASE_COLUMNS = `
  id,
  expense_id,
  purchase_date,
  payment_method,
  buyer_profile_id,
  buyer_name,
  notes,
  total_amount,
  entry_source,
  created_by,
  created_by_name,
  created_at,
  updated_at,
  bazaar_purchase_items (
    id,
    product_name,
    product_key,
    category,
    quantity,
    unit,
    line_total,
    sort_order,
    notes
  )
`

const INPUT = 'w-full rounded-xl border border-[#E5E7EB] bg-white px-3 py-2.5 text-sm font-semibold text-[#1F2937] outline-none transition-all placeholder:text-[#C3C8D0] focus:border-[#ff5a00] focus:ring-2 focus:ring-[#ff5a00]/10 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-[#9CA3AF]'
const SELECT = `${INPUT} pr-8`
const LOAD_PAGE_SIZE = 500
const HISTORY_PAGE_SIZE = 10

const EN = {
  title: 'Daily Bazaar',
  sub: 'Record exactly what arrived and where every sum of bazaar money went',
  entry: 'New entry',
  history: 'History',
  analytics: 'Analytics',
  newEntry: 'New bazaar entry',
  editEntry: 'Edit bazaar entry',
  entryHint: 'One entry should use one payment method. Add another entry when payment methods differ.',
  purchaseDate: 'Purchase date',
  buyer: 'Buyer',
  selectBuyer: 'Select an employee',
  payment: 'Payment method',
  notes: 'Entry notes',
  notesPlaceholder: 'Optional context for this bazaar trip',
  products: 'Products received',
  productsHint: 'Quantity and total paid are the source of truth. Unit cost is calculated automatically.',
  addProduct: 'Add product',
  item: 'Item',
  product: 'Product',
  productPlaceholder: 'e.g. Tomatoes',
  category: 'Category',
  quantity: 'Quantity',
  unit: 'Unit',
  totalPaid: 'Total paid',
  unitCost: 'Cost per unit',
  lineNotes: 'Line note',
  lineNotesPlaceholder: 'Grade, seller, purpose…',
  removeLine: 'Remove line',
  totalBazaar: 'Bazaar total',
  itemCount: 'Product lines',
  exactHint: 'This total is mirrored into Accounting as one Products / bazaar expense.',
  save: 'Save bazaar',
  saving: 'Saving…',
  cancelEdit: 'Cancel edit',
  readOnly: 'Your access is read-only. You can review history and analytics.',
  saved: 'Bazaar entry saved and added to Accounting.',
  updated: 'Bazaar entry and its Accounting expense were updated.',
  deleted: 'Bazaar entry removed.',
  saveFailed: 'Could not save the bazaar entry.',
  deleteFailed: 'Could not delete the bazaar entry.',
  loadFailed: 'Could not load bazaar data',
  migrationMissing: 'Daily Bazaar is not ready in the database yet. Apply the latest bazaar migration, then refresh.',
  refresh: 'Refresh',
  dateRange: 'Date range',
  today: 'Today',
  week: '7 days',
  month: 'This month',
  previousMonth: 'Previous month',
  from: 'From',
  to: 'To',
  search: 'Search product, buyer or note…',
  searchLabel: 'Search bazaar history',
  clearSearch: 'Clear bazaar search',
  closeSearch: 'Close bazaar search',
  allCategories: 'All categories',
  allPayments: 'All payment methods',
  results: 'entries',
  noHistory: 'No bazaar entries match this period and filters.',
  noAnalytics: 'No bazaar spend is recorded for this period.',
  productName: 'Product name',
  itemPrice: 'Item total',
  actions: 'Actions',
  previous: 'Previous',
  next: 'Next',
  page: 'Page',
  of: 'of',
  details: 'Details',
  hideDetails: 'Hide details',
  edit: 'Edit',
  delete: 'Delete',
  confirmDelete: 'Confirm delete',
  deleting: 'Deleting…',
  addedBy: 'Added by',
  unspecifiedBuyer: 'Not specified',
  legacy: 'Historical entry',
  legacyReadOnly: 'Backfilled historical expense details cannot be edited here.',
  totalSpent: 'Total bazaar spend',
  averageDaily: 'Average per calendar day',
  calendarDays: 'calendar days',
  purchases: 'Bazaar entries',
  uniqueProducts: 'Unique products',
  activeDays: 'Days with bazaar',
  dailySpend: 'Daily spend',
  categorySpend: 'Spend by category',
  paymentSpend: 'Payment methods',
  buyerSpend: 'Spend by buyer',
  topProducts: 'Top products',
  ofTotal: 'of total',
  purchasesShort: 'entries',
  averageUnitCost: 'Avg unit cost',
  latestUnitCost: 'Latest',
  priceUp: 'up',
  priceDown: 'down',
  selectedCategory: 'Analytics are scoped to the selected category.',
  sendTelegram: 'Send selected date to Telegram',
  sendingTelegram: 'Sending…',
  telegramSent: 'Selected date’s Bazaar was sent to Telegram.',
  telegramSendFailed: 'Could not send the selected date’s Bazaar to Telegram.',
  selectSingleDate: 'Select one date containing Bazaar entries.',
  validation: {
    purchase_date_required: 'Choose the purchase date.',
    buyer_profile_id_required: 'Choose the employee who made the purchase.',
    payment_method_required: 'Choose a valid payment method.',
    items_required: 'Add at least one product.',
    product_name_required: 'Enter the product name.',
    category_required: 'Choose a valid category.',
    unit_required: 'Choose a valid unit.',
    quantity_required: 'Enter a quantity greater than zero.',
    quantity_must_be_whole: 'This unit requires a whole-number quantity.',
    quantity_precision: 'Weight and volume can have at most 3 decimal places.',
    line_total_required: 'Enter the total amount paid for this product.',
    total_required: 'Bazaar total must be greater than zero.',
  },
}

const LABELS = {
  en: EN,
  uz: {
    title: 'Kunlik bozor',
    sub: 'Nima kelgani va bozor pulining har bir so‘mi qayerga ketganini aniq yozing',
    entry: 'Yangi yozuv', history: 'Tarix', analytics: 'Tahlil',
    newEntry: 'Yangi bozor yozuvi', editEntry: 'Bozor yozuvini tahrirlash',
    entryHint: 'Bitta yozuvda bitta to‘lov turidan foydalaning. To‘lov turi boshqacha bo‘lsa, alohida yozuv qo‘shing.',
    purchaseDate: 'Xarid sanasi', buyer: 'Xarid qilgan', selectBuyer: 'Xodimni tanlang',
    payment: 'To‘lov turi', notes: 'Umumiy izoh', notesPlaceholder: 'Bozor xaridi haqida ixtiyoriy izoh',
    products: 'Kelgan mahsulotlar', productsHint: 'Miqdor va to‘langan summa asosiy ma’lumot. Birlik narxi avtomatik hisoblanadi.',
    addProduct: 'Mahsulot qo‘shish', item: 'Qator', product: 'Mahsulot', productPlaceholder: 'Masalan: Pomidor', category: 'Kategoriya',
    quantity: 'Miqdor', unit: 'Birlik', totalPaid: 'To‘langan jami', unitCost: 'Birlik narxi', lineNotes: 'Qator izohi',
    lineNotesPlaceholder: 'Navi, sotuvchi, maqsad…', removeLine: 'Qatorni o‘chirish', totalBazaar: 'Bozor jami', itemCount: 'Mahsulot qatorlari',
    exactHint: 'Bu jami Buxgalteriyaga bitta Bozor mahsulotlari xarajati sifatida tushadi.', save: 'Bozorni saqlash', saving: 'Saqlanmoqda…', cancelEdit: 'Tahrirni bekor qilish',
    readOnly: 'Siz faqat ko‘rishingiz mumkin. Tarix va tahlil mavjud.', saved: 'Bozor yozuvi saqlandi va Buxgalteriyaga qo‘shildi.',
    updated: 'Bozor yozuvi va Buxgalteriyadagi xarajat yangilandi.', deleted: 'Bozor yozuvi o‘chirildi.', saveFailed: 'Bozor yozuvini saqlab bo‘lmadi.',
    deleteFailed: 'Bozor yozuvini o‘chirib bo‘lmadi.', loadFailed: 'Bozor ma’lumotlarini yuklab bo‘lmadi',
    migrationMissing: 'Kunlik bozor bazada hali tayyor emas. Oxirgi bozor migratsiyasini ishga tushiring va yangilang.', refresh: 'Yangilash',
    dateRange: 'Sana oralig‘i', today: 'Bugun', week: '7 kun', month: 'Joriy oy', previousMonth: 'O‘tgan oy', from: 'Dan', to: 'Gacha',
    search: 'Mahsulot, xaridor yoki izoh…', searchLabel: 'Bozor tarixidan qidirish', clearSearch: 'Qidiruvni tozalash', closeSearch: 'Qidiruvni yopish',
    allCategories: 'Barcha kategoriyalar', allPayments: 'Barcha to‘lovlar', results: 'yozuv', noHistory: 'Bu davr va filtrlarga mos bozor yozuvi yo‘q.',
    productName: 'Mahsulot nomi', itemPrice: 'Mahsulot summasi', actions: 'Amallar', previous: 'Oldingi', next: 'Keyingi', page: 'Sahifa', of: '/',
    noAnalytics: 'Bu davr uchun bozor xarajati yozilmagan.', details: 'Tafsilotlar', hideDetails: 'Yopish', edit: 'Tahrirlash', delete: 'O‘chirish',
    confirmDelete: 'O‘chirishni tasdiqlash', deleting: 'O‘chirilmoqda…', addedBy: 'Kiritgan',
    unspecifiedSupplier: 'Ko‘rsatilmagan', unspecifiedBuyer: 'Ko‘rsatilmagan', legacy: 'Tarixiy yozuv', legacyReadOnly: 'Oldingi xarajatlardan ko‘chirilgan yozuvni bu yerda tahrirlab bo‘lmaydi.',
    totalSpent: 'Bozor jami xarajati', averageDaily: 'Kalendar kuniga o‘rtacha', calendarDays: 'kalendar kun', purchases: 'Bozor yozuvlari', uniqueProducts: 'Turli mahsulotlar', activeDays: 'Bozor qilingan kunlar',
    dailySpend: 'Kunlar bo‘yicha xarajat', categorySpend: 'Kategoriya bo‘yicha', paymentSpend: 'To‘lov turlari', buyerSpend: 'Xarid qilgan xodim bo‘yicha', topProducts: 'Eng ko‘p xarajatli mahsulotlar',
    ofTotal: 'jami ichida', purchasesShort: 'yozuv', averageUnitCost: 'O‘rtacha birlik narxi', latestUnitCost: 'Oxirgi', priceUp: 'oshdi', priceDown: 'tushdi',
    selectedCategory: 'Tahlil tanlangan kategoriya bo‘yicha hisoblandi.',
    sendTelegram: 'Tanlangan sanani Telegramga yuborish', sendingTelegram: 'Yuborilmoqda…',
    telegramSent: 'Tanlangan sanadagi bozor Telegramga yuborildi.', telegramSendFailed: 'Tanlangan sanadagi bozorni Telegramga yuborib bo‘lmadi.',
    selectSingleDate: 'Bozor yozuvlari bor bitta sanani tanlang.',
    validation: {
      purchase_date_required: 'Xarid sanasini tanlang.', buyer_profile_id_required: 'Xarid qilgan xodimni tanlang.', payment_method_required: 'To‘g‘ri to‘lov turini tanlang.', items_required: 'Kamida bitta mahsulot qo‘shing.',
      product_name_required: 'Mahsulot nomini kiriting.', category_required: 'To‘g‘ri kategoriyani tanlang.', unit_required: 'To‘g‘ri birlikni tanlang.',
      quantity_required: 'Noldan katta miqdor kiriting.', quantity_must_be_whole: 'Bu birlik uchun miqdor butun son bo‘lishi kerak.',
      quantity_precision: 'Og‘irlik va hajmda ko‘pi bilan 3 ta kasr xonasi bo‘lishi mumkin.', line_total_required: 'Mahsulot uchun to‘langan jami summani kiriting.',
      total_required: 'Bozor jami noldan katta bo‘lishi kerak.',
    },
  },
  ru: {
    title: 'Ежедневный базар',
    sub: 'Фиксируйте, что именно пришло и куда ушёл каждый сум',
    entry: 'Новая запись', history: 'История', analytics: 'Аналитика',
    newEntry: 'Новая запись базара', editEntry: 'Изменить запись базара',
    entryHint: 'В одной записи используйте один способ оплаты. Для другого способа создайте новую запись.',
    purchaseDate: 'Дата покупки', buyer: 'Закупщик', selectBuyer: 'Выберите сотрудника',
    payment: 'Способ оплаты', notes: 'Общее примечание', notesPlaceholder: 'Необязательный контекст закупки',
    products: 'Поступившие продукты', productsHint: 'Количество и оплаченная сумма — источник истины. Цена за единицу считается автоматически.',
    addProduct: 'Добавить продукт', item: 'Строка', product: 'Продукт', productPlaceholder: 'Например: Помидоры', category: 'Категория',
    quantity: 'Количество', unit: 'Единица', totalPaid: 'Оплачено всего', unitCost: 'Цена за единицу', lineNotes: 'Примечание',
    lineNotesPlaceholder: 'Сорт, продавец, назначение…', removeLine: 'Удалить строку', totalBazaar: 'Итого базар', itemCount: 'Строк продуктов',
    exactHint: 'Эта сумма попадёт в Бухгалтерию одним расходом «Продукты / базар».', save: 'Сохранить базар', saving: 'Сохраняется…', cancelEdit: 'Отменить изменение',
    readOnly: 'У вас доступ только для просмотра. История и аналитика доступны.', saved: 'Запись базара сохранена и добавлена в Бухгалтерию.',
    updated: 'Запись базара и расход в Бухгалтерии обновлены.', deleted: 'Запись базара удалена.', saveFailed: 'Не удалось сохранить запись базара.',
    deleteFailed: 'Не удалось удалить запись базара.', loadFailed: 'Не удалось загрузить данные базара',
    migrationMissing: 'Ежедневный базар ещё не готов в базе. Примените последнюю миграцию базара и обновите.', refresh: 'Обновить',
    dateRange: 'Период', today: 'Сегодня', week: '7 дней', month: 'Текущий месяц', previousMonth: 'Прошлый месяц', from: 'С', to: 'По',
    search: 'Продукт, закупщик или примечание…', searchLabel: 'Поиск по истории базара', clearSearch: 'Очистить поиск', closeSearch: 'Закрыть поиск',
    allCategories: 'Все категории', allPayments: 'Все способы оплаты', results: 'записей', noHistory: 'Нет записей базара для этого периода и фильтров.',
    productName: 'Название продукта', itemPrice: 'Сумма товара', actions: 'Действия', previous: 'Назад', next: 'Далее', page: 'Страница', of: 'из',
    noAnalytics: 'За этот период расходов базара нет.', details: 'Детали', hideDetails: 'Скрыть', edit: 'Изменить', delete: 'Удалить',
    confirmDelete: 'Подтвердить удаление', deleting: 'Удаляется…', addedBy: 'Добавил',
    unspecifiedSupplier: 'Не указано', unspecifiedBuyer: 'Не указано', legacy: 'Историческая запись', legacyReadOnly: 'Запись, перенесённую из старых расходов, нельзя изменить здесь.',
    totalSpent: 'Всего на базар', averageDaily: 'Среднее на календарный день', calendarDays: 'календарных дней', purchases: 'Записи базара', uniqueProducts: 'Разные продукты', activeDays: 'Дни с базаром',
    dailySpend: 'Расходы по дням', categorySpend: 'По категориям', paymentSpend: 'Способы оплаты', buyerSpend: 'Расходы по закупщику', topProducts: 'Главные продукты по расходам',
    ofTotal: 'от общей суммы', purchasesShort: 'записей', averageUnitCost: 'Средняя цена за ед.', latestUnitCost: 'Последняя', priceUp: 'выше', priceDown: 'ниже',
    selectedCategory: 'Аналитика рассчитана по выбранной категории.',
    sendTelegram: 'Отправить выбранную дату в Telegram', sendingTelegram: 'Отправляется…',
    telegramSent: 'Базар за выбранную дату отправлен в Telegram.', telegramSendFailed: 'Не удалось отправить базар за выбранную дату в Telegram.',
    selectSingleDate: 'Выберите одну дату, за которую есть записи базара.',
    validation: {
      purchase_date_required: 'Выберите дату покупки.', buyer_profile_id_required: 'Выберите сотрудника, который сделал закупку.', payment_method_required: 'Выберите корректный способ оплаты.', items_required: 'Добавьте хотя бы один продукт.',
      product_name_required: 'Введите название продукта.', category_required: 'Выберите корректную категорию.', unit_required: 'Выберите корректную единицу.',
      quantity_required: 'Введите количество больше нуля.', quantity_must_be_whole: 'Для этой единицы нужно целое количество.',
      quantity_precision: 'Вес и объём могут иметь не более 3 знаков после запятой.', line_total_required: 'Введите общую сумму за этот продукт.',
      total_required: 'Общая сумма базара должна быть больше нуля.',
    },
  },
}

function labelsFor(lang) {
  const localized = LABELS[lang] || EN
  return { ...EN, ...localized, validation: { ...EN.validation, ...(localized.validation || {}) } }
}

function methodIcon(method) {
  if (method === 'card') return CreditCard
  if (method === 'terminal') return Terminal
  return Banknote
}

const ENTRY_CATEGORY_KEYS = new Set(BAZAAR_ENTRY_CATEGORIES.map(category => category.key))

let lineSequence = 0
function blankItem(overrides = {}) {
  lineSequence += 1
  return {
    _key: `bazaar-line-${Date.now()}-${lineSequence}`,
    product_name: '',
    category: 'vegetables',
    quantity: '',
    unit: 'kg',
    line_total: '',
    notes: '',
    ...overrides,
  }
}

function emptyForm(buyerName = '', buyerProfileId = '') {
  return {
    id: '',
    purchase_date: todayBazaarDate(),
    payment_method: 'cash',
    buyer_profile_id: buyerProfileId,
    buyer_name: buyerName,
    notes: '',
    items: [blankItem()],
  }
}

function formFromPurchase(purchase) {
  const normalized = normalizeBazaarPurchase(purchase)
  return {
    id: normalized.id,
    purchase_date: normalized.purchase_date,
    payment_method: normalized.payment_method,
    buyer_profile_id: normalized.buyer_profile_id || '',
    buyer_name: normalized.buyer_name,
    notes: normalized.notes,
    items: normalized.items.map(item => blankItem({
      product_name: item.product_name,
      category: item.category,
      quantity: String(item.quantity || ''),
      unit: item.unit,
      line_total: String(item.line_total || ''),
      notes: item.notes,
    })),
  }
}

function isLegacyPurchase(purchase) {
  return purchase?.entry_source === 'accounting_backfill'
}

function createBazaarRequestKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, character => {
    const value = Math.floor(Math.random() * 16)
    return (character === 'x' ? value : (value & 0x3) | 0x8).toString(16)
  })
}

function bazaarErrorMessage(error, l, fallback) {
  const text = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase()
  const missing = (
    text.includes('bazaar_purchases') ||
    text.includes('bazaar_purchase_items') ||
    text.includes('save_bazaar_purchase') ||
    text.includes('delete_bazaar_purchase')
  ) && (
    text.includes('does not exist') ||
    text.includes('schema cache') ||
    text.includes('could not find') ||
    text.includes('42p01') ||
    text.includes('pgrst202') ||
    text.includes('pgrst205')
  )
  return missing ? l.migrationMissing : (error?.message || fallback)
}

async function sendBazaarDateToTelegram(purchaseDate) {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token || ''
  const response = await fetch('/api/telegram/employee-notification', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ type: 'daily_bazaar', purchaseDate }),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || !data.ok) throw new Error(data.error || 'Daily Bazaar notification failed')
  return data
}

function validationMessage(validationError, l) {
  const message = l.validation[validationError?.code] || l.saveFailed
  return Number.isInteger(validationError?.index)
    ? `${l.item} ${validationError.index + 1}: ${message}`
    : message
}

export default function DailyBazaar() {
  const { state } = useApp()
  const { profile } = useAuth()
  const lang = state.lang || 'ru'
  const l = useMemo(() => labelsFor(lang), [lang])
  const role = profile?.role || state.user?.role || 'guest'
  const canManage = canEditFeature(profile || { role }, 'bazaar')
  const defaultBuyer = profile?.full_name || profile?.email || state.user?.name || ''
  const defaultBuyerProfileId = profile?.id || state.user?.id || ''

  const initialRange = useMemo(() => getBazaarRange('today'), [])
  const [tab, setTab] = useState(canManage ? 'entry' : 'history')
  const [rangeKey, setRangeKey] = useState('today')
  const [dateFrom, setDateFrom] = useState(initialRange.dateFrom)
  const [dateTo, setDateTo] = useState(initialRange.dateTo)
  const [purchases, setPurchases] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sendingTelegram, setSendingTelegram] = useState(false)
  const [deletingId, setDeletingId] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState('')
  const [historyPage, setHistoryPage] = useState(1)
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [paymentFilter, setPaymentFilter] = useState('all')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [validationErrors, setValidationErrors] = useState([])
  const [form, setForm] = useState(() => emptyForm(defaultBuyer, defaultBuyerProfileId))
  const [employees, setEmployees] = useState([])
  const [catalogProducts, setCatalogProducts] = useState([])
  const requestRef = useRef(0)
  const labelsRef = useRef(l)
  const submissionAttemptRef = useRef(null)
  const loadedRangeRef = useRef('')

  useEffect(() => {
    labelsRef.current = l
  }, [l])

  useEffect(() => {
    if (!defaultBuyer) return
    setForm(current => current.buyer_name ? current : {
      ...current,
      buyer_profile_id: defaultBuyerProfileId,
      buyer_name: defaultBuyer,
    })
  }, [defaultBuyer, defaultBuyerProfileId])

  useEffect(() => {
    let active = true

    async function loadReferenceData() {
      try {
        const [profilesResult, catalogResult] = await Promise.all([
          supabase
            .from('profiles')
            .select('id, full_name, email, role, status')
            .eq('status', 'active')
            .neq('role', 'guest')
            .order('full_name'),
          supabase
            .from('bazaar_product_catalog')
            .select('product_key, product_name, category, unit, last_purchase_date, updated_at')
            .order('last_purchase_date', { ascending: false })
            .order('updated_at', { ascending: false }),
        ])
        if (!active) return
        if (!profilesResult.error) setEmployees(profilesResult.data || [])
        if (!catalogResult.error) setCatalogProducts(catalogResult.data || [])
      } catch {
        // The current signed-in employee and range purchases remain usable fallbacks.
      }
    }

    loadReferenceData()
    return () => { active = false }
  }, [])

  const loadPurchases = useCallback(async () => {
    const requestId = requestRef.current + 1
    const requestedRange = `${dateFrom}:${dateTo}`
    requestRef.current = requestId
    setLoading(true)
    setError('')
    const rows = []
    let from = 0

    try {
      while (true) {
        const { data, error: loadError } = await supabase
          .from('bazaar_purchases')
          .select(PURCHASE_COLUMNS)
          .gte('purchase_date', dateFrom)
          .lte('purchase_date', dateTo)
          .order('purchase_date', { ascending: false })
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .range(from, from + LOAD_PAGE_SIZE - 1)

        if (requestId !== requestRef.current) return
        if (loadError) throw loadError

        const page = data || []
        rows.push(...page)
        if (page.length < LOAD_PAGE_SIZE) break
        from += LOAD_PAGE_SIZE
      }

      if (requestId !== requestRef.current) return
      setPurchases(rows.map(normalizeBazaarPurchase))
      loadedRangeRef.current = requestedRange
    } catch (loadError) {
      if (requestId !== requestRef.current) return
      if (loadedRangeRef.current !== requestedRange) setPurchases([])
      const currentLabels = labelsRef.current
      setError(bazaarErrorMessage(loadError, currentLabels, currentLabels.loadFailed))
    } finally {
      if (requestId === requestRef.current) setLoading(false)
    }
  }, [dateFrom, dateTo])

  useEffect(() => {
    loadPurchases()
    return () => { requestRef.current += 1 }
  }, [loadPurchases])

  const productSuggestions = useMemo(() => {
    const suggestions = new Map()
    for (const product of catalogProducts) {
      const key = normalizeBazaarProductKey(product.product_key || product.product_name)
      if (key) suggestions.set(key, { name: product.product_name, category: product.category, unit: product.unit })
    }
    for (const purchase of purchases) {
      for (const item of purchase.items || []) {
        if (!item.product_name) continue
        const key = item.product_key || normalizeBazaarProductKey(item.product_name)
        if (!suggestions.has(key)) suggestions.set(key, { name: item.product_name, category: item.category, unit: item.unit })
      }
    }
    return [...suggestions.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [catalogProducts, purchases])

  const buyerOptions = useMemo(() => {
    const options = new Map()
    for (const employee of employees) {
      const name = String(employee.full_name || employee.email || '').trim()
      if (employee.id && name) options.set(employee.id, { id: employee.id, name })
    }
    if (defaultBuyerProfileId && defaultBuyer && !options.has(defaultBuyerProfileId)) {
      options.set(defaultBuyerProfileId, { id: defaultBuyerProfileId, name: defaultBuyer })
    }
    if (form.buyer_profile_id && form.buyer_name && !options.has(form.buyer_profile_id)) {
      options.set(form.buyer_profile_id, { id: form.buyer_profile_id, name: form.buyer_name })
    }
    return [...options.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [employees, defaultBuyerProfileId, defaultBuyer, form.buyer_profile_id, form.buyer_name])

  const historyRows = useMemo(() => filterBazaarPurchases(
    purchases.filter(purchase => purchase.entry_source === 'daily_bazaar'),
    {
      dateFrom,
      dateTo,
      query,
      category: categoryFilter,
      paymentMethod: paymentFilter,
    },
  ), [purchases, dateFrom, dateTo, query, categoryFilter, paymentFilter])

  const historyPageCount = Math.max(1, Math.ceil(historyRows.length / HISTORY_PAGE_SIZE))
  const pagedHistoryRows = useMemo(() => {
    const start = (historyPage - 1) * HISTORY_PAGE_SIZE
    return historyRows.slice(start, start + HISTORY_PAGE_SIZE)
  }, [historyRows, historyPage])

  useEffect(() => {
    setHistoryPage(1)
  }, [dateFrom, dateTo, query, categoryFilter, paymentFilter])

  useEffect(() => {
    setHistoryPage(current => Math.min(current, historyPageCount))
  }, [historyPageCount])

  const analytics = useMemo(() => summarizeBazaarPurchases(purchases, {
    dateFrom,
    dateTo,
    category: categoryFilter,
    paymentMethod: paymentFilter,
  }), [purchases, dateFrom, dateTo, categoryFilter, paymentFilter])

  const formTotal = useMemo(() => calculateBazaarTotal(form.items), [form.items])
  const canSendSelectedDate = dateFrom === dateTo && purchases.some(purchase => (
    purchase.entry_source === 'daily_bazaar' && purchase.purchase_date === dateFrom
  ))

  function selectRange(key) {
    const range = getBazaarRange(key)
    setRangeKey(key)
    setDateFrom(range.dateFrom)
    setDateTo(range.dateTo)
  }

  function setCustomFrom(value) {
    if (!value) return
    setRangeKey('custom')
    setDateFrom(value)
    if (value > dateTo) setDateTo(value)
  }

  function setCustomTo(value) {
    if (!value) return
    setRangeKey('custom')
    setDateTo(value)
    if (value < dateFrom) setDateFrom(value)
  }

  async function sendSelectedDateToTelegram() {
    if (!canManage || sendingTelegram || !canSendSelectedDate) return
    setError('')
    setNotice('')
    setSendingTelegram(true)
    try {
      await sendBazaarDateToTelegram(dateFrom)
      setNotice(l.telegramSent)
    } catch (sendError) {
      console.error('[daily-bazaar] Telegram notification failed:', sendError)
      setError(l.telegramSendFailed)
    } finally {
      setSendingTelegram(false)
    }
  }

  function updateForm(field, value) {
    setForm(current => ({ ...current, [field]: value }))
    setValidationErrors(current => current.filter(item => item.field !== field))
  }

  function updateBuyer(profileId) {
    const selected = buyerOptions.find(employee => employee.id === profileId)
    setForm(current => ({
      ...current,
      buyer_profile_id: profileId,
      buyer_name: selected?.name || '',
    }))
    setValidationErrors(current => current.filter(item => item.field !== 'buyer_profile_id'))
  }

  function updateItem(index, field, value) {
    setForm(current => ({
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item),
    }))
    setValidationErrors(current => current.filter(item => item.index !== index || item.field !== field))
  }

  function updateProductName(index, value) {
    const matched = productSuggestions.find(item => normalizeBazaarProductKey(item.name) === normalizeBazaarProductKey(value))
    setForm(current => ({
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index ? {
        ...item,
        product_name: value,
        ...(matched ? {
          ...(ENTRY_CATEGORY_KEYS.has(matched.category) ? { category: matched.category } : {}),
          unit: matched.unit,
        } : {}),
      } : item),
    }))
    setValidationErrors(current => current.filter(item => item.index !== index || item.field !== 'product_name'))
  }

  function addItem() {
    setForm(current => ({ ...current, items: [...current.items, blankItem()] }))
  }

  function removeItem(index) {
    setForm(current => ({
      ...current,
      items: current.items.length === 1
        ? [blankItem()]
        : current.items.filter((_, itemIndex) => itemIndex !== index),
    }))
    setValidationErrors([])
  }

  function resetEntry() {
    setForm(emptyForm(defaultBuyer, defaultBuyerProfileId))
    setValidationErrors([])
    submissionAttemptRef.current = null
  }

  async function savePurchase(event) {
    event.preventDefault()
    if (!canManage || saving) return
    setError('')
    setNotice('')
    const validation = validateBazaarPurchase(form)
    setValidationErrors(validation.errors)
    if (!validation.valid) {
      setError(validationMessage(validation.errors[0], l))
      return
    }

    const normalized = validation.purchase
    const payload = {
      ...(normalized.id ? { id: normalized.id } : {}),
      purchase_date: normalized.purchase_date,
      payment_method: normalized.payment_method,
      buyer_profile_id: normalized.buyer_profile_id || null,
      buyer_name: normalized.buyer_name,
      notes: normalized.notes,
      items: normalized.items.map(item => ({
        product_name: item.product_name,
        category: item.category,
        quantity: item.quantity,
        unit: item.unit,
        line_total: item.line_total,
        notes: item.notes,
      })),
    }

    if (!normalized.id) {
      const attempt = getBazaarSubmissionAttempt(
        submissionAttemptRef.current,
        payload,
        createBazaarRequestKey,
      )
      submissionAttemptRef.current = attempt
      payload.request_key = attempt.requestKey
    }

    setSaving(true)
    try {
      const { error: saveError } = await withWriteTimeout(
        signal => supabase.rpc('save_bazaar_purchase', { payload }).abortSignal(signal),
        'SAVE_BAZAAR_PURCHASE',
      )
      if (saveError) throw saveError

      const wasEditing = Boolean(form.id)
      setCatalogProducts(current => {
        const next = new Map(current.map(product => [
          product.product_key || normalizeBazaarProductKey(product.product_name),
          product,
        ]))
        for (const item of normalized.items) {
          next.set(item.product_key, {
            product_key: item.product_key,
            product_name: item.product_name,
            category: item.category,
            unit: item.unit,
            last_purchase_date: normalized.purchase_date,
          })
        }
        return [...next.values()]
      })
      resetEntry()
      setNotice(wasEditing ? l.updated : l.saved)
      await loadPurchases()
      if (wasEditing) setTab('history')
    } catch (saveError) {
      setError(bazaarErrorMessage(saveError, l, l.saveFailed))
    } finally {
      setSaving(false)
    }
  }

  function beginEdit(purchase) {
    if (!canManage) return
    if (isLegacyPurchase(purchase)) {
      setError(l.legacyReadOnly)
      return
    }
    setError('')
    setNotice('')
    setForm(formFromPurchase(purchase))
    setValidationErrors([])
    setTab('entry')
  }

  async function deletePurchase(purchase) {
    if (!canManage || !purchase?.id || deletingId) return
    if (confirmDeleteId !== purchase.id) {
      setConfirmDeleteId(purchase.id)
      return
    }
    setError('')
    setNotice('')
    setDeletingId(purchase.id)
    try {
      const { error: deleteError } = await withWriteTimeout(
        signal => supabase.rpc('delete_bazaar_purchase', { p_purchase_id: purchase.id }).abortSignal(signal),
        'DELETE_BAZAAR_PURCHASE',
      )
      if (deleteError) throw deleteError

      setConfirmDeleteId('')
      setNotice(l.deleted)
      await loadPurchases()
    } catch (deleteError) {
      setError(bazaarErrorMessage(deleteError, l, l.deleteFailed))
    } finally {
      setDeletingId('')
    }
  }

  function lineHasError(index, field) {
    return validationErrors.some(errorItem => errorItem.index === index && errorItem.field === field)
  }

  return (
    <AppShell title={l.title}>
      <div className="min-h-full bg-[#FAF7F0]">
        <div className="mx-auto max-w-[1320px] px-4 py-5 sm:px-5 sm:py-6">
          <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50 text-[#ff5a00]">
                <ShoppingBasket size={21} />
              </div>
              <h1 className="text-2xl font-black text-[#1F2937]">{l.title}</h1>
              <p className="mt-1 max-w-2xl text-sm font-medium text-[#6B7280]">{l.sub}</p>
            </div>
            <button
              type="button"
              onClick={loadPurchases}
              disabled={loading}
              className="inline-flex h-10 items-center justify-center gap-2 self-start rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs font-black text-[#6B7280] shadow-sm transition-colors hover:border-orange-200 hover:text-[#ff5a00] disabled:opacity-60"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              {l.refresh}
            </button>
          </div>

          <div role="tablist" aria-label={l.title} className="mb-5 flex gap-1 overflow-x-auto rounded-2xl border border-[#E5E7EB] bg-white p-1.5 shadow-sm">
            {[
              { key: 'entry', label: l.entry, icon: Plus, hidden: !canManage },
              { key: 'history', label: l.history, icon: ReceiptText },
              { key: 'analytics', label: l.analytics, icon: BarChart2 },
            ].filter(item => !item.hidden).map(item => {
              const Icon = item.icon
              const active = tab === item.key
              return (
                <button
                  key={item.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-controls={`bazaar-${item.key}-panel`}
                  onClick={() => setTab(item.key)}
                  className={`inline-flex min-w-max flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black transition-all ${
                    active ? 'bg-[#ff5a00] text-white shadow-sm shadow-orange-200' : 'text-[#6B7280] hover:bg-gray-50 hover:text-[#1F2937]'
                  }`}
                >
                  <Icon size={16} />{item.label}
                </button>
              )
            })}
          </div>

          {tab !== 'entry' && (
            <RangeAndFilters
              l={l}
              lang={lang}
              rangeKey={rangeKey}
              dateFrom={dateFrom}
              dateTo={dateTo}
              onRange={selectRange}
              onFrom={setCustomFrom}
              onTo={setCustomTo}
              query={query}
              onQuery={setQuery}
              categoryFilter={categoryFilter}
              onCategory={setCategoryFilter}
              paymentFilter={paymentFilter}
              onPayment={setPaymentFilter}
              showSearch={tab === 'history'}
              canSendTelegram={canManage}
              canSendSelectedDate={canSendSelectedDate}
              sendingTelegram={sendingTelegram}
              onSendTelegram={sendSelectedDateToTelegram}
            />
          )}

          {error && (tab === 'entry' || purchases.length > 0) && (
            <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
              {error}
            </div>
          )}
          {notice && !error && (
            <div role="status" aria-live="polite" className="mb-5 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-bold text-green-700">
              {notice}
            </div>
          )}

          {tab === 'entry' && canManage && (
            <div id="bazaar-entry-panel" role="tabpanel">
              <BazaarEntryForm
                l={l}
                lang={lang}
                form={form}
                buyerOptions={buyerOptions}
                total={formTotal}
                saving={saving}
                suggestions={productSuggestions}
                validationErrors={validationErrors}
                onUpdateForm={updateForm}
                onUpdateBuyer={updateBuyer}
                onUpdateItem={updateItem}
                onUpdateProduct={updateProductName}
                onAddItem={addItem}
                onRemoveItem={removeItem}
                onSubmit={savePurchase}
                onCancelEdit={resetEntry}
                lineHasError={lineHasError}
              />
            </div>
          )}

          {tab === 'entry' && !canManage && (
            <div className="rounded-2xl border border-[#E5E7EB] bg-white p-8 text-center shadow-sm">
              <ShoppingBasket size={28} className="mx-auto mb-3 text-orange-200" />
              <p className="text-sm font-bold text-[#6B7280]">{l.readOnly}</p>
            </div>
          )}

          {tab === 'history' && (
            <div id="bazaar-history-panel" role="tabpanel">
              {loading ? (
                <OperationalLoading title={l.history} description="" />
              ) : error && purchases.length === 0 ? (
                <OperationalError title={l.loadFailed} description={error} actionLabel={l.refresh} onAction={loadPurchases} />
              ) : (
                <BazaarHistory
                  l={l}
                  lang={lang}
                  purchases={pagedHistoryRows}
                  resultCount={historyRows.length}
                  page={historyPage}
                  pageCount={historyPageCount}
                  canManage={canManage}
                  confirmDeleteId={confirmDeleteId}
                  deletingId={deletingId}
                  categoryFilter={categoryFilter}
                  query={query}
                  onPage={setHistoryPage}
                  onEdit={beginEdit}
                  onDelete={deletePurchase}
                />
              )}
            </div>
          )}

          {tab === 'analytics' && (
            <div id="bazaar-analytics-panel" role="tabpanel">
              {loading ? (
                <OperationalLoading title={l.analytics} description="" />
              ) : error && purchases.length === 0 ? (
                <OperationalError title={l.loadFailed} description={error} actionLabel={l.refresh} onAction={loadPurchases} />
              ) : (
                <BazaarAnalytics
                  l={l}
                  lang={lang}
                  summary={analytics}
                  categoryFilter={categoryFilter}
                  dateFrom={dateFrom}
                  dateTo={dateTo}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}

function RangeAndFilters({
  l,
  lang,
  rangeKey,
  dateFrom,
  dateTo,
  onRange,
  onFrom,
  onTo,
  query,
  onQuery,
  categoryFilter,
  onCategory,
  paymentFilter,
  onPayment,
  showSearch,
  canSendTelegram,
  canSendSelectedDate,
  sendingTelegram,
  onSendTelegram,
}) {
  const rangeSummary = dateFrom === dateTo
    ? formatLongDate(dateFrom, lang, dateFrom)
    : `${formatLongDate(dateFrom, lang, dateFrom)} — ${formatLongDate(dateTo, lang, dateTo)}`
  const rangeOptions = [
    { key: 'today', label: l.today },
    { key: 'week', label: l.week },
    { key: 'month', label: l.month },
    { key: 'previousMonth', label: l.previousMonth },
  ]

  return (
    <section aria-labelledby="bazaar-range-heading" className="mb-5 rounded-2xl border border-[#E5E7EB] bg-white p-3 shadow-sm sm:p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 id="bazaar-range-heading" className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-[#9CA3AF]">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-50 text-[#ff5a00]">
            <CalendarDays size={14} />
          </span>
          {l.dateRange}
        </h2>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <p className="rounded-lg bg-[#F8F9FB] px-2.5 py-1.5 text-[11px] font-black text-[#7B8494]">
            {rangeSummary}
          </p>
          {canSendTelegram && (
            <button
              type="button"
              onClick={onSendTelegram}
              disabled={!canSendSelectedDate || sendingTelegram}
              title={!canSendSelectedDate ? l.selectSingleDate : l.sendTelegram}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3 text-xs font-black text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500 disabled:shadow-none"
            >
              {sendingTelegram ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {sendingTelegram ? l.sendingTelegram : l.sendTelegram}
            </button>
          )}
        </div>
      </div>

      <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(380px,520px)] xl:items-center">
        <div className="grid w-full grid-cols-2 gap-1.5 rounded-2xl bg-[#F8F9FB] p-1.5 sm:grid-cols-4 xl:max-w-[720px]">
          {rangeOptions.map(option => (
            <button
              key={option.key}
              type="button"
              onClick={() => onRange(option.key)}
              aria-pressed={rangeKey === option.key}
              className={`min-h-10 min-w-0 rounded-xl px-2 text-xs font-black transition-all sm:whitespace-nowrap sm:px-3 ${
                rangeKey === option.key
                  ? 'bg-[#ff5a00] text-white shadow-sm'
                  : 'bg-transparent text-[#6B7280] hover:bg-white hover:text-[#ff5a00]'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_20px_minmax(0,1fr)] sm:items-center">
          <div className="min-w-0 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 py-2 transition-colors focus-within:border-[#ff5a00] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#ff5a00]/10">
            <p className="text-[9px] font-black uppercase tracking-wider text-[#9CA3AF]">{l.from}</p>
            <FormattedDateInput value={dateFrom} lang={lang} onChange={onFrom} className="h-6 w-full min-w-0 bg-transparent pr-7 text-sm font-black outline-none" />
          </div>
          <ArrowRight size={14} className="hidden justify-self-center text-[#C3C8D0] sm:block" />
          <div className="min-w-0 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 py-2 transition-colors focus-within:border-[#ff5a00] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#ff5a00]/10">
            <p className="text-[9px] font-black uppercase tracking-wider text-[#9CA3AF]">{l.to}</p>
            <FormattedDateInput value={dateTo} lang={lang} onChange={onTo} className="h-6 w-full min-w-0 bg-transparent pr-7 text-sm font-black outline-none" />
          </div>
        </div>
      </div>

      <div className={`mt-3 grid min-w-0 gap-2 border-t border-[#EEF0F3] pt-3 lg:ml-auto lg:w-full ${
        showSearch
          ? 'sm:grid-cols-2 lg:max-w-[1100px] lg:grid-cols-[minmax(200px,260px)_minmax(220px,280px)_minmax(260px,1fr)]'
          : 'sm:grid-cols-2 lg:max-w-[548px]'
      }`}>
          <label className="rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 py-2 transition-colors focus-within:border-[#ff5a00] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#ff5a00]/10">
            <span className="block text-[9px] font-black uppercase tracking-wider text-[#9CA3AF]">{l.category}</span>
            <select value={categoryFilter} onChange={event => onCategory(event.target.value)} className="mt-0.5 h-6 w-full bg-transparent text-xs font-black text-[#4B5563] outline-none">
              <option value="all">{l.allCategories}</option>
              {BAZAAR_CATEGORIES.map(category => <option key={category.key} value={category.key}>{bazaarCategoryLabel(category.key, lang)}</option>)}
            </select>
          </label>
          <label className="rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 py-2 transition-colors focus-within:border-[#ff5a00] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#ff5a00]/10">
            <span className="block text-[9px] font-black uppercase tracking-wider text-[#9CA3AF]">{l.payment}</span>
            <select value={paymentFilter} onChange={event => onPayment(event.target.value)} className="mt-0.5 h-6 w-full bg-transparent text-xs font-black text-[#4B5563] outline-none">
              <option value="all">{l.allPayments}</option>
              {BAZAAR_PAYMENT_METHODS.map(method => <option key={method.key} value={method.key}>{bazaarPaymentMethodLabel(method.key, lang)}</option>)}
            </select>
          </label>
          {showSearch && (
            <div className="min-w-0 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 py-2 transition-colors focus-within:border-[#ff5a00] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#ff5a00]/10 sm:col-span-2 lg:col-span-1">
              <label htmlFor="bazaar-history-search" className="block text-[9px] font-black uppercase tracking-wider text-[#9CA3AF]">{l.searchLabel}</label>
              <div className="relative mt-0.5">
                <Search size={15} className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
                <input
                  id="bazaar-history-search"
                  type="text"
                  autoComplete="off"
                  value={query}
                  onChange={event => onQuery(event.target.value)}
                  placeholder={l.search}
                  className="h-6 w-full min-w-0 bg-transparent pl-6 pr-7 text-xs font-bold text-[#4B5563] outline-none placeholder:text-[#A8B0BD]"
                />
                {query && (
                  <button type="button" onClick={() => onQuery('')} aria-label={l.clearSearch} className="absolute right-0 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-[#9CA3AF] transition-colors hover:bg-white hover:text-[#ff5a00]">
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
    </section>
  )
}

function BazaarEntryForm({
  l,
  lang,
  form,
  buyerOptions,
  total,
  saving,
  suggestions,
  validationErrors,
  onUpdateForm,
  onUpdateBuyer,
  onUpdateItem,
  onUpdateProduct,
  onAddItem,
  onRemoveItem,
  onSubmit,
  onCancelEdit,
  lineHasError,
}) {
  return (
    <form onSubmit={onSubmit} className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <fieldset disabled={saving} className="contents">
        <div className="min-w-0 space-y-5">
        <section className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-black text-[#1F2937]">{form.id ? l.editEntry : l.newEntry}</h2>
              <p className="mt-1 max-w-2xl text-xs font-medium text-[#9CA3AF]">{l.entryHint}</p>
            </div>
            {form.id && (
              <button type="button" onClick={onCancelEdit} className="inline-flex items-center gap-1.5 rounded-xl border border-[#E5E7EB] px-3 py-2 text-xs font-black text-[#6B7280] hover:border-red-200 hover:text-red-600">
                <X size={14} />{l.cancelEdit}
              </button>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={l.purchaseDate} icon={CalendarDays}>
              <FormattedDateInput value={form.purchase_date} lang={lang} onChange={value => onUpdateForm('purchase_date', value)} className={`${INPUT} native-date-input cursor-pointer text-transparent caret-transparent`} />
            </Field>
            <Field label={l.buyer} icon={UserRound} error={validationErrors.some(item => item.field === 'buyer_profile_id')}>
              <select aria-invalid={validationErrors.some(item => item.field === 'buyer_profile_id')} value={form.buyer_profile_id || ''} onChange={event => onUpdateBuyer(event.target.value)} className={SELECT}>
                <option value="">{l.selectBuyer}</option>
                {buyerOptions.map(employee => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
              </select>
            </Field>
          </div>

          <div className="mt-4 max-w-xl">
            <fieldset className="min-w-0">
              <legend className="mb-1.5 flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-[#6B7280]">
                <WalletCards size={12} />{l.payment}
              </legend>
              <div className="grid grid-cols-2 gap-2">
                {BAZAAR_ENTRY_PAYMENT_METHODS.map(method => {
                  const Icon = methodIcon(method.key)
                  const active = form.payment_method === method.key
                  return (
                    <label
                      key={method.key}
                      className={`flex h-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl border text-xs font-black transition-colors focus-within:ring-2 focus-within:ring-[#ff5a00]/20 ${
                        active ? 'border-[#ff5a00] bg-orange-50 text-[#ff5a00]' : 'border-[#E5E7EB] bg-white text-[#6B7280] hover:bg-gray-50'
                      }`}
                    >
                      <input type="radio" name="bazaar-payment-method" value={method.key} checked={active} onChange={() => onUpdateForm('payment_method', method.key)} className="sr-only" />
                      <Icon size={14} />{bazaarPaymentMethodLabel(method.key, lang)}
                    </label>
                  )
                })}
              </div>
            </fieldset>
          </div>

          <div className="mt-4">
            <Field label={l.notes} icon={FileText}>
              <textarea value={form.notes} onChange={event => onUpdateForm('notes', event.target.value)} rows={2} placeholder={l.notesPlaceholder} className={`${INPUT} min-h-[72px] resize-y`} />
            </Field>
          </div>
        </section>

        <section className="rounded-2xl border border-[#E5E7EB] bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-[#F3F4F6] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div>
              <h2 className="text-base font-black text-[#1F2937]">{l.products}</h2>
              <p className="mt-1 text-xs font-medium text-[#9CA3AF]">{l.productsHint}</p>
            </div>
            <button type="button" onClick={onAddItem} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-3 text-xs font-black text-[#ff5a00] transition-colors hover:bg-orange-100">
              <Plus size={15} />{l.addProduct}
            </button>
          </div>

          <datalist id="bazaar-product-suggestions">
            {suggestions.map(suggestion => <option key={normalizeBazaarProductKey(suggestion.name)} value={suggestion.name} />)}
          </datalist>

          <div className="space-y-3 p-3 sm:p-4">
            {form.items.map((item, index) => {
              const quantity = normalizeBazaarQuantity(item.quantity)
              const base = normalizeBazaarQuantityToBase(quantity, item.unit)
              const unitCost = getBazaarUnitCost(item)
              return (
                <div key={item._key} className="rounded-2xl border border-[#E5E7EB] bg-[#FBFCFD] p-3 sm:p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-lg bg-orange-50 px-2 text-xs font-black text-[#ff5a00]">{index + 1}</span>
                    <button type="button" onClick={() => onRemoveItem(index)} aria-label={l.removeLine} className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#E5E7EB] bg-white text-[#9CA3AF] transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600">
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-[minmax(180px,1.5fr)_150px_110px_100px_160px]">
                    <Field label={l.product} error={lineHasError(index, 'product_name')}>
                      <input aria-invalid={lineHasError(index, 'product_name')} list="bazaar-product-suggestions" value={item.product_name} onChange={event => onUpdateProduct(index, event.target.value)} placeholder={l.productPlaceholder} className={`${INPUT} ${lineHasError(index, 'product_name') ? 'border-red-300 bg-red-50' : ''}`} />
                    </Field>
                    <Field label={l.category} error={lineHasError(index, 'category')}>
                      <select aria-invalid={lineHasError(index, 'category')} value={item.category} onChange={event => onUpdateItem(index, 'category', event.target.value)} className={SELECT}>
                        {BAZAAR_ENTRY_CATEGORIES.map(category => <option key={category.key} value={category.key}>{bazaarCategoryLabel(category.key, lang)}</option>)}
                      </select>
                    </Field>
                    <Field label={l.quantity} error={lineHasError(index, 'quantity')}>
                      <input aria-invalid={lineHasError(index, 'quantity')} type="text" inputMode="decimal" value={item.quantity} onChange={event => onUpdateItem(index, 'quantity', event.target.value.replace(/[^0-9.,]/g, ''))} placeholder="0" className={`${INPUT} tabular-nums ${lineHasError(index, 'quantity') ? 'border-red-300 bg-red-50' : ''}`} />
                    </Field>
                    <Field label={l.unit} error={lineHasError(index, 'unit')}>
                      <select aria-invalid={lineHasError(index, 'unit')} value={item.unit} onChange={event => onUpdateItem(index, 'unit', event.target.value)} className={SELECT}>
                        {BAZAAR_ENTRY_UNITS.map(unit => <option key={unit.key} value={unit.key}>{bazaarUnitLabel(unit.key, lang)}</option>)}
                      </select>
                    </Field>
                    <Field label={l.totalPaid} error={lineHasError(index, 'line_total')}>
                      <input aria-invalid={lineHasError(index, 'line_total')} type="text" inputMode="numeric" value={formatMoneyInput(item.line_total)} onChange={event => onUpdateItem(index, 'line_total', normalizeMoneyInput(event.target.value))} placeholder="0" className={`${INPUT} text-right font-black tabular-nums ${lineHasError(index, 'line_total') ? 'border-red-300 bg-red-50' : ''}`} />
                    </Field>
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px] md:items-end">
                    <Field label={l.lineNotes}>
                      <input value={item.notes} onChange={event => onUpdateItem(index, 'notes', event.target.value)} placeholder={l.lineNotesPlaceholder} className={INPUT} />
                    </Field>
                    <div className="rounded-xl border border-[#E5E7EB] bg-white px-3 py-2.5 text-right">
                      <p className="text-[10px] font-black uppercase tracking-wide text-[#9CA3AF]">{l.unitCost}</p>
                      <p className="mt-0.5 text-sm font-black text-[#1F2937] tabular-nums">
                        {unitCost > 0 ? `${formatCurrency(Math.round(unitCost))} / ${bazaarUnitLabel(base.unit, lang)}` : '—'}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
        </div>

        <aside className="sticky bottom-3 z-10 rounded-2xl border border-orange-100 bg-white p-4 shadow-xl shadow-orange-100/40 xl:top-4 xl:bottom-auto xl:z-0">
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-orange-50 text-[#ff5a00]">
          <ShoppingBasket size={20} />
        </div>
        <p className="text-xs font-black uppercase tracking-wide text-[#9CA3AF]">{l.totalBazaar}</p>
        <p className="mt-1 break-words text-3xl font-black text-[#1F2937] tabular-nums">{formatCurrency(total)}</p>
        <div className="mt-4 flex items-center justify-between rounded-xl bg-[#F9FAFB] px-3 py-2.5 text-xs font-bold text-[#6B7280]">
          <span>{l.itemCount}</span>
          <span className="font-black text-[#1F2937]">{form.items.length}</span>
        </div>
        <p className="mt-3 text-xs font-medium leading-relaxed text-[#9CA3AF]">{l.exactHint}</p>
        {validationErrors.length > 0 && (
          <p role="alert" className="mt-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
            {validationMessage(validationErrors[0], l)}
          </p>
        )}
        <button type="submit" disabled={saving || total <= 0} className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#ff5a00] text-sm font-black text-white shadow-sm shadow-orange-200 transition-colors hover:bg-[#e95100] disabled:cursor-not-allowed disabled:bg-gray-200 disabled:shadow-none">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {saving ? l.saving : l.save}
        </button>
        </aside>
      </fieldset>
    </form>
  )
}

function BazaarHistory({
  l,
  lang,
  purchases,
  resultCount,
  page,
  pageCount,
  canManage,
  confirmDeleteId,
  deletingId,
  categoryFilter,
  query,
  onPage,
  onEdit,
  onDelete,
}) {
  if (purchases.length === 0) {
    return <EmptyState icon={ShoppingBasket} title={l.noHistory} />
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <p className="text-xs font-black uppercase tracking-wide text-[#9CA3AF]">{resultCount} {l.results}</p>
        {pageCount > 1 && <p className="text-xs font-bold text-[#9CA3AF]">{l.page} {page} {l.of} {pageCount}</p>}
      </div>
      <div className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1280px] border-collapse text-left">
            <thead className="bg-[#F8F9FB] text-[10px] font-black uppercase tracking-wide text-[#8B95A5]">
              <tr>
                <th className="w-[150px] px-3 py-2.5">{l.purchaseDate}</th>
                <th className="min-w-[220px] px-3 py-2.5">{l.productName}</th>
                <th className="w-[140px] px-3 py-2.5">{l.quantity}</th>
                <th className="w-[165px] px-3 py-2.5 text-right">{l.unitCost}</th>
                <th className="w-[150px] px-3 py-2.5 text-right">{l.itemPrice}</th>
                <th className="w-[150px] px-3 py-2.5">{l.category}</th>
                <th className="w-[170px] px-3 py-2.5">{l.addedBy}</th>
                <th className="w-[150px] px-3 py-2.5 text-right">{l.totalPaid}</th>
                {canManage && <th className="w-[120px] px-3 py-2.5 text-right">{l.actions}</th>}
              </tr>
            </thead>
            <tbody>
              {purchases.map((purchase, purchaseIndex) => {
                const items = getBazaarPurchaseScopedItems(purchase, categoryFilter, query)
                const total = getBazaarPurchaseScopedTotal(purchase, categoryFilter, query)
                const MethodIcon = methodIcon(purchase.payment_method)
                const columnCount = canManage ? 9 : 8
                return (
                  <React.Fragment key={purchase.id}>
                    {purchaseIndex > 0 && (
                      <tr aria-hidden="true">
                        <td colSpan={columnCount} className="h-3 border-y border-[#E5E7EB] bg-[#FAF7F0] p-0" />
                      </tr>
                    )}
                    {items.map((item, index) => {
                      const unitCost = getBazaarUnitCost(item)
                      const baseUnit = normalizeBazaarQuantityToBase(item.quantity, item.unit).unit
                      const displayQuantity = getBazaarDisplayQuantity(item.quantity, item.unit)
                      return (
                        <tr key={`${purchase.id}-${item.id || index}`} className="border-t border-[#F3F4F6] text-xs text-[#4B5563] first:border-t-0">
                          <td className="bg-[#FCFCFD] px-3 py-2.5" />
                          <td className="px-3 py-2.5" title={item.notes || undefined}>
                            <p className="truncate font-black text-[#1F2937]">{item.product_name}</p>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 font-black text-[#1F2937]">
                            {formatBazaarQuantity(displayQuantity.quantity)} {bazaarUnitLabel(displayQuantity.unit, lang)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-right text-sm font-black text-[#1F2937] tabular-nums">
                            {unitCost > 0 ? `${formatCurrency(Math.round(unitCost))} / ${bazaarUnitLabel(baseUnit, lang)}` : '—'}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-right text-sm font-black text-[#1F2937] tabular-nums">
                            {formatCurrency(item.line_total)}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="inline-flex rounded-full bg-gray-100 px-2 py-1 text-[11px] font-black text-[#6B7280]">{bazaarCategoryLabel(item.category, lang)}</span>
                          </td>
                          <td className="bg-[#FCFCFD] px-3 py-2.5" />
                          <td className="bg-[#FCFCFD] px-3 py-2.5" />
                          {canManage && <td className="bg-[#FCFCFD] px-3 py-2.5" />}
                        </tr>
                      )
                    })}
                    <tr data-bazaar-purchase-summary="true" className="border-t-2 border-[#DDE2E8] bg-[#F7F9FC] text-xs text-[#4B5563]">
                      <td className="whitespace-nowrap px-3 py-3 font-black text-[#1F2937]">
                        {formatLongDate(purchase.purchase_date, lang, purchase.purchase_date)}
                      </td>
                      <td colSpan={5} className="px-3 py-3 text-[10px] font-black uppercase tracking-wide text-[#9CA3AF]">
                        {l.itemCount}: {items.length}
                      </td>
                      <td className="px-3 py-3" title={purchase.notes || undefined}>
                        <p className="truncate font-black text-[#1F2937]">{purchase.created_by_name || '—'}</p>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                          <p className="text-sm font-black text-[#1F2937] tabular-nums">{formatCurrency(total)}</p>
                          <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-1 text-[10px] font-black text-[#ff5a00]">
                            <MethodIcon size={10} />{bazaarPaymentMethodLabel(purchase.payment_method, lang)}
                          </span>
                        </div>
                      </td>
                      {canManage && (
                        <td className="px-3 py-3">
                          <div className="flex justify-end gap-1.5">
                            <button type="button" onClick={() => onEdit(purchase)} aria-label={l.edit} title={l.edit} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100">
                              <Edit3 size={13} />
                            </button>
                            <button type="button" disabled={deletingId === purchase.id} onClick={() => onDelete(purchase)} aria-label={confirmDeleteId === purchase.id ? l.confirmDelete : l.delete} title={confirmDeleteId === purchase.id ? l.confirmDelete : l.delete} className={`inline-flex h-8 items-center justify-center rounded-lg border px-2 text-[10px] font-black transition-colors disabled:opacity-60 ${
                              confirmDeleteId === purchase.id ? 'border-red-200 bg-red-50 text-red-600' : 'w-8 border-[#E5E7EB] text-[#6B7280] hover:border-red-200 hover:text-red-600'
                            }`}>
                              {deletingId === purchase.id ? <Loader2 size={13} className="animate-spin" /> : confirmDeleteId === purchase.id ? l.confirmDelete : <Trash2 size={13} />}
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {pageCount > 1 && (
        <nav aria-label={l.history} className="flex items-center justify-center gap-2 pt-1">
          <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className="h-9 rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs font-black text-[#6B7280] disabled:cursor-not-allowed disabled:opacity-40">
            {l.previous}
          </button>
          <span className="min-w-[100px] text-center text-xs font-black text-[#6B7280]">{l.page} {page} {l.of} {pageCount}</span>
          <button type="button" disabled={page >= pageCount} onClick={() => onPage(page + 1)} className="h-9 rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs font-black text-[#6B7280] disabled:cursor-not-allowed disabled:opacity-40">
            {l.next}
          </button>
        </nav>
      )}
    </div>
  )
}

function BazaarAnalytics({ l, lang, summary, categoryFilter, dateFrom, dateTo }) {
  if (summary.totalSpent <= 0) return <EmptyState icon={BarChart2} title={l.noAnalytics} />
  const maxDaily = Math.max(...summary.daily.map(row => row.total), 1)
  const maxProduct = Math.max(...summary.products.map(row => row.spend), 1)

  return (
    <div className="space-y-5">
      {categoryFilter !== 'all' && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-bold text-blue-700">
          {l.selectedCategory} <span className="font-black">{bazaarCategoryLabel(categoryFilter, lang)}</span>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard icon={WalletCards} tone="orange" label={l.totalSpent} value={formatCurrency(summary.totalSpent)} sub={`${formatLongDate(dateFrom, lang, dateFrom)} — ${formatLongDate(dateTo, lang, dateTo)}`} />
        <MetricCard icon={CalendarDays} tone="blue" label={l.averageDaily} value={formatCurrency(Math.round(summary.averagePerDay))} sub={`${summary.activeDays} ${l.activeDays.toLowerCase()} · ${summary.dayCount} ${l.calendarDays}`} />
        <MetricCard icon={ReceiptText} tone="purple" label={l.purchases} value={summary.purchaseCount} />
        <MetricCard icon={Package} tone="green" label={l.uniqueProducts} value={summary.uniqueProducts} sub={`${summary.totalItemLines} ${l.itemCount.toLowerCase()}`} />
        <MetricCard icon={ShoppingBasket} tone="teal" label={l.activeDays} value={summary.activeDays} />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <AnalyticsSection title={l.dailySpend} icon={CalendarDays}>
          <div className="max-h-[390px] space-y-2 overflow-y-auto pr-1">
            {summary.daily.map(row => {
              const width = Math.max(4, (row.total / maxDaily) * 100)
              return (
                <div key={row.date} className="grid grid-cols-[92px_minmax(0,1fr)_112px] items-center gap-2 sm:grid-cols-[140px_minmax(0,1fr)_140px]">
                  <span className="truncate text-xs font-bold text-[#6B7280]">{formatLongDate(row.date, lang, row.date, { includeYear: false })}</span>
                  <div className="h-8 overflow-hidden rounded-lg bg-gray-100">
                    <div className="flex h-full items-center rounded-lg bg-[#ff5a00] px-2" style={{ width: `${width}%` }}>
                      {width > 24 && <span className="truncate text-[10px] font-black text-white">{row.purchases} {l.purchasesShort}</span>}
                    </div>
                  </div>
                  <span className="text-right text-xs font-black text-[#1F2937] tabular-nums">{formatCurrency(row.total)}</span>
                </div>
              )
            })}
          </div>
        </AnalyticsSection>

        <AnalyticsSection title={l.categorySpend} icon={Package}>
          <RankedMoneyBars
            rows={summary.categories.map(row => ({ ...row, label: bazaarCategoryLabel(row.key, lang) }))}
            total={summary.totalSpent}
            color="#0F766E"
            l={l}
          />
        </AnalyticsSection>
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <AnalyticsSection title={l.paymentSpend} icon={CreditCard}>
          <div className="space-y-3">
            {summary.payments.map(row => {
              const Icon = methodIcon(row.key)
              return (
                <div key={row.key} className="rounded-xl border border-[#E5E7EB] bg-[#FBFCFD] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 text-[#ff5a00]"><Icon size={15} /></span>
                      <span className="text-sm font-black text-[#1F2937]">{bazaarPaymentMethodLabel(row.key, lang)}</span>
                    </div>
                    <span className="text-sm font-black text-[#1F2937]">{formatCurrency(row.amount)}</span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-[#ff5a00]" style={{ width: `${Math.max(3, row.percent)}%` }} /></div>
                  <p className="mt-1 text-right text-[11px] font-bold text-[#9CA3AF]">{Math.round(row.percent)}% {l.ofTotal}</p>
                </div>
              )
            })}
          </div>
        </AnalyticsSection>

        <AnalyticsSection title={l.buyerSpend} icon={UserRound}>
          <RankedMoneyBars
            rows={summary.buyers.slice(0, 10).map(row => ({
              ...row,
              label: row.name || l.unspecifiedBuyer,
              sub: `${row.purchases} ${l.purchasesShort}`,
            }))}
            total={summary.totalSpent}
            color="#7C3AED"
            l={l}
          />
        </AnalyticsSection>
      </div>

      <AnalyticsSection title={l.topProducts} icon={Scale}>
        <div className="space-y-2">
          {summary.products.slice(0, 12).map((product, index) => {
            const width = Math.max(3, (product.spend / maxProduct) * 100)
            const change = product.unitCostChangePct
            return (
              <div key={product.key} className="rounded-xl border border-[#E5E7EB] bg-[#FBFCFD] p-3 sm:p-4">
                <div className="grid gap-3 sm:grid-cols-[38px_minmax(160px,1fr)_140px_170px] sm:items-center">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-xs font-black text-[#6B7280] shadow-sm">{index + 1}</span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-black text-[#1F2937]">{product.product_name}</p>
                      <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-black text-[#6B7280]">{bazaarCategoryLabel(product.category, lang)}</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-[#ff5a00]" style={{ width: `${width}%` }} /></div>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase text-[#9CA3AF]">{l.quantity}</p>
                    <p className="text-sm font-black text-[#1F2937]">{formatBazaarQuantity(product.quantity)} {bazaarUnitLabel(product.unit, lang)}</p>
                  </div>
                  <div className="sm:text-right">
                    <p className="text-base font-black text-[#1F2937]">{formatCurrency(product.spend)}</p>
                    <p className="text-[11px] font-bold text-[#9CA3AF]">{l.averageUnitCost}: {formatCurrency(Math.round(product.averageUnitCost))} / {bazaarUnitLabel(product.unit, lang)}</p>
                    <p className="text-[11px] font-bold text-[#9CA3AF]">{l.latestUnitCost}: {formatCurrency(Math.round(product.latestUnitCost))} / {bazaarUnitLabel(product.unit, lang)}</p>
                    {product.previousUnitCost > 0 && Math.abs(change) >= 0.1 && (
                      <p className={`mt-0.5 inline-flex items-center gap-1 text-[11px] font-black ${change > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {change > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                        {Math.abs(change).toFixed(1)}% {change > 0 ? l.priceUp : l.priceDown}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </AnalyticsSection>
    </div>
  )
}

function RankedMoneyBars({ rows, total, color, l }) {
  if (rows.length === 0) return <p className="py-8 text-center text-sm font-bold text-[#9CA3AF]">{l.noAnalytics}</p>
  return (
    <div className="space-y-3">
      {rows.map(row => {
        const percent = total > 0 ? (row.amount / total) * 100 : 0
        return (
          <div key={row.key}>
            <div className="mb-1.5 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-[#374151]">{row.label}</p>
                {row.sub && <p className="truncate text-[11px] font-bold text-[#9CA3AF]">{row.sub}</p>}
              </div>
              <div className="flex-shrink-0 text-right">
                <p className="text-sm font-black text-[#1F2937]">{formatCurrency(row.amount)}</p>
                <p className="text-[10px] font-bold text-[#9CA3AF]">{Math.round(percent)}%</p>
              </div>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full" style={{ width: `${Math.max(3, percent)}%`, backgroundColor: color }} /></div>
          </div>
        )
      })}
    </div>
  )
}

function AnalyticsSection({ title, icon: Icon, children }) {
  return (
    <section className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 text-[#ff5a00]"><Icon size={15} /></span>
        <h2 className="text-base font-black text-[#1F2937]">{title}</h2>
      </div>
      {children}
    </section>
  )
}

function MetricCard({ icon: Icon, label, value, sub = '', tone = 'orange' }) {
  const tones = {
    orange: 'bg-orange-50 text-[#ff5a00]',
    blue: 'bg-blue-50 text-blue-600',
    purple: 'bg-purple-50 text-purple-600',
    green: 'bg-green-50 text-green-600',
    teal: 'bg-teal-50 text-teal-600',
  }
  return (
    <div className="min-w-0 rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
      <span className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl ${tones[tone] || tones.orange}`}><Icon size={18} /></span>
      <p className="text-xs font-black uppercase tracking-wide text-[#9CA3AF]">{label}</p>
      <p className="mt-1 break-words text-2xl font-black text-[#1F2937] tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-xs font-bold text-[#9CA3AF]">{sub}</p>}
    </div>
  )
}

function EmptyState({ icon: Icon, title }) {
  return (
    <div className="rounded-2xl border border-[#E5E7EB] bg-white px-5 py-14 text-center shadow-sm">
      <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50 text-orange-200"><Icon size={25} /></span>
      <p className="mx-auto max-w-md text-sm font-bold text-[#9CA3AF]">{title}</p>
    </div>
  )
}

function Field({ label, icon: Icon, error = false, children }) {
  return (
    <label className="block min-w-0">
      <span className={`mb-1.5 flex items-center gap-1.5 text-xs font-black uppercase tracking-wide ${error ? 'text-red-600' : 'text-[#6B7280]'}`}>
        {Icon && <Icon size={12} />}{label}
      </span>
      {children}
    </label>
  )
}

function FormattedDateInput({ value, lang, onChange, className = INPUT }) {
  const inputRef = useRef(null)

  function openPicker(event) {
    if (event?.button && event.button !== 0) return
    const input = inputRef.current
    if (!input) return
    input.focus()
    if (typeof input.showPicker === 'function') {
      try {
        input.showPicker()
      } catch {
        // Focusing the native input remains a usable fallback.
      }
    }
  }

  const formatted = formatLongDate(value, lang, value)
  return (
    <div className="relative min-w-0 cursor-pointer" onPointerDown={openPicker}>
      <span className="pointer-events-none absolute inset-y-0 left-3 right-10 z-10 flex items-center overflow-hidden text-ellipsis whitespace-nowrap text-sm font-semibold text-[#1F2937]">
        {formatted}
      </span>
      <input
        ref={inputRef}
        type="date"
        value={value}
        aria-label={formatted}
        onChange={event => onChange(event.target.value)}
        className={`native-date-input cursor-pointer text-transparent caret-transparent ${className}`}
      />
    </div>
  )
}
