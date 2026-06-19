import React, { useEffect, useRef, useState } from 'react'
import { Search, BadgeDollarSign, Plus, RefreshCw, ChevronRight, ArrowLeft, Trash2, X } from 'lucide-react'
import AppShell from '../components/AppShell'
import { supabase } from '../lib/supabase'
import { formatCurrency } from '../lib/formatCurrency'
import {
  CASHBACK_TYPES,
  DEFAULT_CASHBACK_TYPE,
  adjustLoyaltyBalance,
  canAdjustLoyaltyBalance,
  canCreateLoyaltyCard,
  canDeleteLoyaltyTransaction,
  canEditLoyaltyCard,
  canRemoveLoyaltyCard,
  createLoyaltyCardRecord,
  editLoyaltyCardRecord,
  formatUzPhoneNumberInput,
  getCashbackTypePercent,
  isMissingLoyaltySchemaColumn,
} from '../lib/loyalty'
import { useApp } from '../store/AppContext'
import { useAuth } from '../contexts/AuthContext'
import { formatDateTime } from '../lib/dateFormat'

const CARD_PAGE_SIZE = 20
const CARD_SELECT_COLUMNS = 'id, card_number, public_token, customer_name, phone_number, cashback_type, balance, total_earned, total_redeemed, is_active, created_at, updated_at'
const TRANSACTION_SELECT_COLUMNS = 'id, loyalty_card_id, order_id, type, amount, balance_before, balance_after, reason, created_by, cashback_percent_used, card_type_at_transaction, card_number_at_transaction, customer_name_at_transaction, phone_number_at_transaction, created_at'

export default function AdminLoyalty() {
  const { state } = useApp()
  const { profile } = useAuth()
  const lang = state.lang || 'ru'
  const role = profile?.role || state.user?.role || 'guest'
  const canCreate = canCreateLoyaltyCard(role)
  const canEdit = canEditLoyaltyCard(role)
  const canAdjust = canAdjustLoyaltyBalance(role)
  const canRemoveCard = canRemoveLoyaltyCard(role)
  const canDeleteTransactions = canDeleteLoyaltyTransaction(role)
  const [query, setQuery] = useState('')
  const [cards, setCards] = useState([])
  const [selected, setSelected] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [form, setForm] = useState({ card_number: '', customer_name: '', phone_number: '', cashback_type: DEFAULT_CASHBACK_TYPE })
  const [profileForm, setProfileForm] = useState({ customer_name: '', phone_number: '' })
  const [adjustment, setAdjustment] = useState({ amount: '', reason: '' })
  const [message, setMessage] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState('')
  const [deletingTransactionId, setDeletingTransactionId] = useState('')
  const [supportsCashbackType, setSupportsCashbackType] = useState(true)
  const [loadingCards, setLoadingCards] = useState(false)
  const [cardPage, setCardPage] = useState(0)
  const [hasMoreCards, setHasMoreCards] = useState(false)
  const cardSearchRequestRef = useRef(0)

  const L = {
    uz: {
      title: 'Sodiqlik kartalari',
      subtitle: 'Cashback hamyon balanslari va tranzaksiya tarixi',
      refresh: 'Yangilash',
      loadMore: 'Yana yuklash',
      loading: 'Yuklanmoqda...',
      noCards: 'Sodiqlik kartalari topilmadi',
      detailsTitle: 'Sodiqlik kartasi tafsilotlari',
      back: 'Orqaga',
      createTitle: 'Sodiqlik kartasini yaratish',
      cardNumber: 'Karta raqami',
      customerName: 'Mijoz ismi',
      phoneNumber: 'Telefon raqami',
      createCard: 'Sodiqlik kartasini ro‘yxatdan o‘tkazish',
      profileTitle: 'Mijoz sodiqlik profili',
      cardNo: 'Karta raqami',
      balance: 'Balans',
      cashbackType: 'Cashback turi',
      cashbackRate: 'Cashback foizi',
      searchPlaceholder: 'Karta, ism yoki telefon bo‘yicha qidirish',
      unnamedCustomer: 'Nomsiz mijoz',
      active: 'Faol',
      inactive: 'Faol emas',
      cashbackBalance: 'Cashback balansi',
      removeCard: 'Kartani o‘chirish',
      confirmRemoveCard: 'O‘chirishni tasdiqlash',
      removeCardHelp: 'Karta o‘chiriladi, lekin eski tranzaksiyalar va hisobotlar saqlanadi. Bu karta raqamini boshqa mijozga qayta berish mumkin.',
      removeCardFailed: 'Kartani o‘chirib bo‘lmadi. 051 migratsiyasini ishga tushiring.',
      totalEarned: 'Jami cashback',
      totalUsed: 'Jami ishlatilgan sodiqlik balansi',
      status: 'Status',
      ownerActions: 'Owner moliyaviy amallari',
      manualAdjustment: 'Balansni qo‘lda tuzatish',
      adjustmentHelper: 'Har bir qo‘lda tuzatish tranzaksiya yozuvini yaratadi.',
      ownerAdjustOnly: 'Faqat owner sodiqlik balansini qo‘lda tuzatishi mumkin.',
      ownerTypeOnly: 'Cashback turi ro‘yxatdan o‘tkazilgandan keyin qulflanadi, chunki u jismoniy kartaga bosilgan.',
      saveCustomer: 'Mijoz ma’lumotlarini saqlash',
      amountPlaceholder: '+/- summa',
      reason: 'Sabab',
      apply: 'Qo‘llash',
      transactionHistory: 'Balans tranzaksiyalari tarixi',
      noTransactions: 'Hali tranzaksiyalar yo‘q.',
      latestTransactions: 'So‘nggi tranzaksiyalar',
      noCustomerName: 'Mijoz ismi yo‘q',
      noPhoneNumber: 'Telefon raqami yo‘q',
      orderPrefix: 'Buyurtma',
      balanceFlow: 'Balans',
      cashbackMeta: 'karta · Cashback',
      usedForOrder: 'Buyurtma to‘lovi uchun ishlatildi',
      manualAdjustmentDesc: 'Qo‘lda balans tuzatildi',
      selectCard: 'Sodiqlik kartasini tanlang',
      selectCardSub: 'Balans, buyurtma faoliyati va hamyon tranzaksiyalarini ko‘ring.',
      adjustmentRequired: 'Tuzatish summasi va sababini kiriting.',
      balanceNegative: 'Sodiqlik balansi manfiy bo‘la olmaydi.',
      ownerOnly: 'Bu amal faqat owner uchun ruxsat etilgan.',
      deleteTransaction: 'O‘chirish',
      confirmDelete: 'O‘chirishni tasdiqlash',
      cancel: 'Bekor qilish',
      deletingTransaction: 'O‘chirilmoqda...',
      ownerDeleteOnly: 'Faqat owner test tranzaksiyalarini o‘chirishi mumkin.',
      deleteTransactionFailed: 'Tranzaksiyani o‘chirib bo‘lmadi. 042 migratsiyasini ishga tushiring.',
      cashbackTypeUnavailable: 'Cashback turi ustuni hali bazada qo‘llanmagan. 022 migratsiyasini ishga tushiring.',
      cardFormRequired: '8 xonali karta raqamini kiriting. Telefon ixtiyoriy, lekin kiritilsa +998 XX XXX XX XX formatida bo‘lishi kerak.',
      transactionTypes: {
        cashback_earned: 'Cashback hisoblandi',
        redeemed: 'Sodiqlik balansi ishlatildi',
        manual_adjustment: 'Qo‘lda tuzatish',
        refund_reversal: 'Qaytarish bekor qilindi',
        migrated_discount_card: 'Eski kartadan ko‘chirildi',
      },
    },
    ru: {
      title: 'Карты лояльности',
      subtitle: 'Балансы кешбэк-кошельков и история транзакций',
      refresh: 'Обновить',
      loadMore: 'Загрузить ещё',
      loading: 'Загрузка...',
      noCards: 'Карты лояльности не найдены',
      detailsTitle: 'Детали карты лояльности',
      back: 'Назад',
      createTitle: 'Создать карту лояльности',
      cardNumber: 'Номер карты',
      customerName: 'Имя клиента',
      phoneNumber: 'Номер телефона',
      createCard: 'Зарегистрировать карту лояльности',
      profileTitle: 'Профиль лояльности клиента',
      cardNo: 'Карта №',
      balance: 'Баланс',
      cashbackType: 'Тип кешбэка',
      cashbackRate: 'Процент кешбэка',
      searchPlaceholder: 'Поиск по карте, имени или телефону',
      unnamedCustomer: 'Клиент без имени',
      active: 'Активна',
      inactive: 'Неактивна',
      cashbackBalance: 'Баланс кешбэка',
      removeCard: 'Удалить карту',
      confirmRemoveCard: 'Подтвердить удаление',
      removeCardHelp: 'Карта будет удалена, но старые транзакции и отчёты сохранятся. Этот номер карты можно будет выдать другому клиенту.',
      removeCardFailed: 'Не удалось удалить карту. Запустите миграцию 051.',
      totalEarned: 'Всего кешбэка начислено',
      totalUsed: 'Всего использовано с баланса',
      status: 'Статус',
      ownerActions: 'Финансовые действия владельца',
      manualAdjustment: 'Ручная корректировка баланса',
      adjustmentHelper: 'Каждая ручная корректировка создаёт запись транзакции.',
      ownerAdjustOnly: 'Только владелец может вручную изменять баланс лояльности.',
      ownerTypeOnly: 'Тип кешбэка заблокирован после регистрации, потому что он напечатан на физической карте.',
      saveCustomer: 'Сохранить данные клиента',
      amountPlaceholder: '+/- сумма',
      reason: 'Причина',
      apply: 'Применить',
      transactionHistory: 'История транзакций баланса',
      noTransactions: 'Транзакций пока нет.',
      latestTransactions: 'Последние транзакции',
      noCustomerName: 'Имя клиента не указано',
      noPhoneNumber: 'Номер телефона не указан',
      orderPrefix: 'Заказ',
      balanceFlow: 'Баланс',
      cashbackMeta: 'карта · Кешбэк',
      usedForOrder: 'Использовано для оплаты заказа',
      manualAdjustmentDesc: 'Ручная корректировка баланса',
      selectCard: 'Выберите карту лояльности',
      selectCardSub: 'Просмотрите баланс, активность заказов и транзакции кошелька.',
      adjustmentRequired: 'Введите сумму корректировки и причину.',
      balanceNegative: 'Баланс лояльности не может быть отрицательным.',
      ownerOnly: 'Это действие доступно только владельцу.',
      deleteTransaction: 'Удалить',
      confirmDelete: 'Подтвердить удаление',
      cancel: 'Отмена',
      deletingTransaction: 'Удаление...',
      ownerDeleteOnly: 'Только владелец может удалять тестовые транзакции.',
      deleteTransactionFailed: 'Не удалось удалить транзакцию. Запустите миграцию 042.',
      cashbackTypeUnavailable: 'Колонка типа кешбэка ещё не применена в базе. Запустите миграцию 022.',
      cardFormRequired: 'Введите 8-значный номер карты. Телефон необязателен, но если указан, должен быть в формате +998 XX XXX XX XX.',
      transactionTypes: {
        cashback_earned: 'Кешбэк начислен',
        redeemed: 'Использовано с баланса',
        manual_adjustment: 'Ручная корректировка',
        refund_reversal: 'Отмена возврата',
        migrated_discount_card: 'Перенесено со старой карты',
      },
    },
    en: {
      title: 'Loyalty Cards',
      subtitle: 'Cashback wallet balances and transaction history',
      refresh: 'Refresh',
      loadMore: 'Load more',
      loading: 'Loading...',
      noCards: 'No loyalty cards found',
      detailsTitle: 'Loyalty card details',
      back: 'Back',
      createTitle: 'Create loyalty card',
      cardNumber: 'Card number',
      customerName: 'Customer name',
      phoneNumber: 'Phone number',
      createCard: 'Register loyalty card',
      profileTitle: 'Customer Loyalty Profile',
      cardNo: 'Card No',
      balance: 'Balance',
      cashbackType: 'Cashback type',
      cashbackRate: 'Cashback rate',
      searchPlaceholder: 'Search card, name, phone',
      unnamedCustomer: 'Unnamed customer',
      active: 'Active',
      inactive: 'Inactive',
      cashbackBalance: 'Cashback balance',
      removeCard: 'Remove card',
      confirmRemoveCard: 'Confirm remove',
      removeCardHelp: 'The card will be removed, but old transactions and reports stay preserved. This card number can be issued to another customer.',
      removeCardFailed: 'Could not remove card. Run migration 051.',
      totalEarned: 'Total cashback earned',
      totalUsed: 'Total loyalty used',
      status: 'Status',
      ownerActions: 'Owner financial actions',
      manualAdjustment: 'Manual balance adjustment',
      adjustmentHelper: 'Every manual adjustment creates a transaction record.',
      ownerAdjustOnly: 'Only owner can manually adjust loyalty balance.',
      ownerTypeOnly: 'Cashback type is locked after card registration because it is printed on the physical card.',
      saveCustomer: 'Save customer details',
      amountPlaceholder: '+/- amount',
      reason: 'Reason',
      apply: 'Apply',
      transactionHistory: 'Balance transaction history',
      noTransactions: 'No transactions yet.',
      latestTransactions: 'Latest transactions',
      noCustomerName: 'No customer name',
      noPhoneNumber: 'No phone number',
      orderPrefix: 'Order',
      balanceFlow: 'Balance',
      cashbackMeta: 'card · Cashback',
      usedForOrder: 'Used for order payment',
      manualAdjustmentDesc: 'Manual balance adjustment',
      selectCard: 'Select a loyalty card',
      selectCardSub: 'View balance, order activity, and wallet transactions.',
      adjustmentRequired: 'Enter an adjustment amount and reason.',
      balanceNegative: 'Loyalty balance cannot go negative.',
      ownerOnly: 'Only the owner can perform this action.',
      deleteTransaction: 'Delete',
      confirmDelete: 'Confirm delete',
      cancel: 'Cancel',
      deletingTransaction: 'Deleting...',
      ownerDeleteOnly: 'Only owner can delete test transactions.',
      deleteTransactionFailed: 'Could not delete transaction. Run migration 042.',
      cashbackTypeUnavailable: 'Cashback type is not available in the database yet. Run migration 022.',
      cardFormRequired: 'Enter an 8-digit card number. Phone is optional, but must match +998 XX XXX XX XX when provided.',
      transactionTypes: {
        cashback_earned: 'Cashback earned',
        redeemed: 'Loyalty balance used',
        manual_adjustment: 'Manual adjustment',
        refund_reversal: 'Refund reversal',
        migrated_discount_card: 'Migrated from old card',
      },
    },
  }
  const l = L[lang] || L.en

  function statusLabel(card) {
    return card?.is_active === false ? l.inactive : l.active
  }

  function transactionTypeLabel(type) {
    return l.transactionTypes[type] || String(type || '').replaceAll('_', ' ')
  }

  function cashbackTypeLabel(type) {
    const normalized = String(type || DEFAULT_CASHBACK_TYPE).toLowerCase()
    const config = CASHBACK_TYPES[normalized] || CASHBACK_TYPES[DEFAULT_CASHBACK_TYPE]
    return `${config.label} · ${config.percent}%`
  }

  function selectedName(card) {
    return card?.customer_name || l.noCustomerName
  }

  function selectedPhone(card) {
    return card?.phone_number || l.noPhoneNumber
  }

  function transactionAmount(tx) {
    const signedAmount = Number(tx.amount) || 0
    const amount = Math.abs(signedAmount)
    const isCredit = signedAmount > 0 || (signedAmount === 0 && (tx.type === 'cashback_earned' || tx.type === 'manual_adjustment' && Number(tx.balance_after) >= Number(tx.balance_before)))
    return `${isCredit ? '+' : '-'}${formatCurrency(amount)}`
  }

  function transactionAmountClass(tx) {
    const signedAmount = Number(tx.amount) || 0
    return signedAmount > 0 || (signedAmount === 0 && (tx.type === 'cashback_earned' || tx.type === 'manual_adjustment' && Number(tx.balance_after) >= Number(tx.balance_before)))
      ? 'text-[#16A34A]'
      : 'text-[#DC2626]'
  }

  function transactionDescription(tx) {
    if (tx.reason) return tx.reason
    if (tx.type === 'redeemed') return l.usedForOrder
    if (tx.type === 'manual_adjustment') return l.manualAdjustmentDesc
    return ''
  }

  function formatTransactionDate(value) {
    return formatDateTime(value)
  }

  function transactionCardType(tx) {
    const type = tx.card_type_at_transaction || DEFAULT_CASHBACK_TYPE
    const label = CASHBACK_TYPES[type]?.label || CASHBACK_TYPES[DEFAULT_CASHBACK_TYPE].label
    const percent = tx.cashback_percent_used ?? getCashbackTypePercent(type)
    return `${label} ${l.cashbackMeta} ${percent}%`
  }

  async function searchCards(term = query, { reset = true } = {}) {
    const requestId = cardSearchRequestRef.current + 1
    cardSearchRequestRef.current = requestId
    setMessage('')
    setLoadingCards(true)
    const nextPage = reset ? 0 : cardPage + 1
    const from = nextPage * CARD_PAGE_SIZE
    const to = from + CARD_PAGE_SIZE - 1
    let request = supabase
      .from('loyalty_cards')
      .select(CARD_SELECT_COLUMNS)
      .order('updated_at', { ascending: false })
      .range(from, to)
    const trimmed = term.trim()
    if (trimmed) {
      const safeTerm = trimmed.replace(/[%,]/g, '')
      request = request.or(`card_number.ilike.%${safeTerm}%,customer_name.ilike.%${safeTerm}%,phone_number.ilike.%${safeTerm}%`)
    }
    const { data, error } = await request
    if (requestId !== cardSearchRequestRef.current) return
    setLoadingCards(false)
    if (error) {
      setMessage(error.message)
      return
    }
    if ((data || []).some(card => !Object.prototype.hasOwnProperty.call(card, 'cashback_type'))) {
      setSupportsCashbackType(false)
    }
    setCards(prev => reset ? (data || []) : [...prev, ...(data || [])])
    setCardPage(nextPage)
    setHasMoreCards((data || []).length === CARD_PAGE_SIZE)
  }

  async function loadTransactions(card) {
    setSelected(card)
    setConfirmDeleteId('')
    setProfileForm({
      customer_name: card.customer_name || '',
      phone_number: card.phone_number || '',
    })
    const { data, error } = await supabase
      .from('loyalty_transactions')
      .select(TRANSACTION_SELECT_COLUMNS)
      .eq('loyalty_card_id', card.id)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) {
      setMessage(error.message)
      setTransactions([])
      return
    }
    setTransactions(data || [])
  }

  async function createCard() {
    setMessage('')
    if (!canCreate) {
      setMessage(l.ownerOnly)
      return
    }
    const now = new Date().toISOString()
    let cardRecord
    try {
      cardRecord = createLoyaltyCardRecord({
        role,
        cardNumber: form.card_number,
        customerName: form.customer_name,
        phoneNumber: form.phone_number,
        cashbackType: form.cashback_type,
        existingCardNumbers: cards.map(card => card.card_number),
        now,
      })
    } catch (error) {
      setMessage(['invalid_card_number', 'invalid_phone_number'].includes(error.code) ? l.cardFormRequired : error.message)
      return
    }
    const { cashback_type: ignoredCashbackType, ...legacyCardRecord } = cardRecord
    let insertRecord = supportsCashbackType ? cardRecord : legacyCardRecord
    let { data, error } = await supabase
      .from('loyalty_cards')
      .insert(insertRecord)
      .select(CARD_SELECT_COLUMNS)
      .single()
    if (error && isMissingLoyaltySchemaColumn(error, 'cashback_type')) {
      setSupportsCashbackType(false)
      ;({ data, error } = await supabase
        .from('loyalty_cards')
        .insert(legacyCardRecord)
        .select(CARD_SELECT_COLUMNS)
        .single())
    }
    if (error) {
      setMessage(error.message)
      return
    }
    setForm({ card_number: '', customer_name: '', phone_number: '', cashback_type: DEFAULT_CASHBACK_TYPE })
    setCards(prev => [data, ...prev])
    loadTransactions(data)
  }

  async function removeCard(card) {
    if (!canRemoveCard) {
      setMessage(l.ownerOnly)
      return
    }
    if (confirmDeleteId !== `card:${card.id}`) {
      setConfirmDeleteId(`card:${card.id}`)
      return
    }
    const { error } = await supabase.rpc('remove_loyalty_card', {
      p_card_id: card.id,
    })
    if (error) {
      setMessage(error.message || l.removeCardFailed)
      return
    }
    setCards(prev => prev.filter(row => row.id !== card.id))
    setSelected(null)
    setTransactions([])
    setConfirmDeleteId('')
    setMessage('')
  }

  async function updateCustomerProfile() {
    if (!selected) return
    if (!canEdit) {
      setMessage(l.ownerOnly)
      return
    }
    let next
    try {
      next = editLoyaltyCardRecord({
        role,
        card: selected,
        patch: {
          customer_name: profileForm.customer_name,
          phone_number: profileForm.phone_number,
        },
      })
    } catch (error) {
      setMessage(error.code === 'invalid_phone_number' ? l.cardFormRequired : error.message)
      return
    }
    const { data, error } = await supabase
      .from('loyalty_cards')
      .update({
        customer_name: next.customer_name,
        phone_number: next.phone_number,
        updated_at: next.updated_at,
      })
      .eq('id', selected.id)
      .select(CARD_SELECT_COLUMNS)
      .single()
    if (error) {
      setMessage(error.message)
      return
    }
    setCards(prev => prev.map(row => row.id === data.id ? data : row))
    setSelected(data)
    setProfileForm({ customer_name: data.customer_name || '', phone_number: data.phone_number || '' })
    setMessage('')
  }

  async function adjustBalance() {
    if (!selected) return
    if (!canAdjust) {
      setMessage(l.ownerOnly)
      return
    }
    let settlement
    try {
      settlement = adjustLoyaltyBalance({
        role,
        card: selected,
        amount: Number(adjustment.amount),
        reason: adjustment.reason,
        createdBy: profile?.id || state.user?.id || null,
      })
    } catch (error) {
      setMessage(error.code === 'negative_balance' ? l.balanceNegative : l.adjustmentRequired)
      return
    }
    const { data, error } = await supabase
      .from('loyalty_cards')
      .update({
        balance: settlement.card.balance,
        total_earned: settlement.card.total_earned,
        total_redeemed: settlement.card.total_redeemed,
        updated_at: settlement.card.updated_at,
      })
      .eq('id', selected.id)
      .select(CARD_SELECT_COLUMNS)
      .single()
    if (error) {
      setMessage(error.message)
      return
    }
    await supabase.from('loyalty_transactions').insert(settlement.transaction)
    setAdjustment({ amount: '', reason: '' })
    setCards(prev => prev.map(row => row.id === data.id ? data : row))
    loadTransactions(data)
  }

  async function deleteTransaction(tx) {
    if (!selected || !tx?.id) return
    if (!canDeleteTransactions) {
      setMessage(l.ownerOnly)
      return
    }
    if (confirmDeleteId !== tx.id) {
      setConfirmDeleteId(tx.id)
      return
    }
    setMessage('')
    setDeletingTransactionId(tx.id)
    const { data, error } = await supabase.rpc('delete_loyalty_transaction', {
      p_transaction_id: tx.id,
    })
    setDeletingTransactionId('')
    if (error) {
      setMessage(error.message || l.deleteTransactionFailed)
      return
    }
    const nextCard = data?.card || selected
    setCards(prev => prev.map(row => row.id === nextCard.id ? nextCard : row))
    setSelected(nextCard)
    setConfirmDeleteId('')
    loadTransactions(nextCard)
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      searchCards(query, { reset: true })
    }, 250)
    return () => clearTimeout(timer)
  }, [query])

  return (
    <AppShell title={selected ? l.detailsTitle : l.title}>
      <div className="w-full max-w-full overflow-x-hidden p-4 md:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="hidden md:block">
            <h1 className="text-2xl font-black text-[#1F2937]">{l.title}</h1>
            <p className="text-sm font-semibold text-[#6B7280]">{l.subtitle}</p>
          </div>
          <button onClick={() => searchCards(query, { reset: true })} disabled={loadingCards} className="flex items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-black text-[#1F2937] disabled:opacity-60">
            <RefreshCw size={15} className={loadingCards ? 'animate-spin' : ''} /> {l.refresh}
          </button>
        </div>

        {message && <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700">{message}</div>}

        <div className="grid max-w-full gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
          <section className={`${selected ? 'hidden lg:block' : ''} rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm md:p-5`}>
            <h2 className="mb-3 text-sm font-black text-[#1F2937]">{l.createTitle}</h2>
            <div className="space-y-2">
              <input value={form.card_number} onChange={e => setForm({ ...form, card_number: String(e.target.value || '').replace(/\D/g, '').slice(0, 8) })} placeholder={l.cardNumber} inputMode="numeric" maxLength={8} className="w-full rounded-xl border border-[#E5E7EB] px-3 py-2 text-sm font-semibold" />
              <input value={form.customer_name} onChange={e => setForm({ ...form, customer_name: e.target.value })} placeholder={l.customerName} className="w-full rounded-xl border border-[#E5E7EB] px-3 py-2 text-sm font-semibold" />
              <input value={form.phone_number} onChange={e => setForm({ ...form, phone_number: formatUzPhoneNumberInput(e.target.value) })} placeholder="+998 91 132 32 32" className="w-full rounded-xl border border-[#E5E7EB] px-3 py-2 text-sm font-semibold" />
              <select value={form.cashback_type} onChange={e => setForm({ ...form, cashback_type: e.target.value })} disabled={!canCreate} className="w-full rounded-xl border border-[#E5E7EB] px-3 py-2 text-sm font-semibold disabled:bg-gray-50 disabled:text-[#9CA3AF]">
                {Object.entries(CASHBACK_TYPES).map(([key, config]) => (
                  <option key={key} value={key}>{config.label} · {config.percent}%</option>
                ))}
              </select>
              <button onClick={createCard} disabled={!canCreate} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#ff5a00] px-4 py-3 text-sm font-black text-white disabled:bg-gray-200 disabled:text-[#9CA3AF]">
                <Plus size={16} /> {l.createCard}
              </button>
              {!canCreate && <p className="text-xs font-bold text-[#9CA3AF]">{l.ownerOnly}</p>}
            </div>

            <div className="mt-5">
              <div className="mb-3 flex items-center gap-2 rounded-xl border border-[#E5E7EB] px-3 py-2">
                <Search size={15} className="text-[#9CA3AF]" />
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder={l.searchPlaceholder} className="min-w-0 flex-1 text-sm font-semibold outline-none" />
              </div>
              <div className="space-y-2">
                {cards.map(card => (
                  <button key={card.id} onClick={() => loadTransactions(card)} className={`w-full rounded-xl border p-3 text-left ${selected?.id === card.id ? 'border-[#ff5a00] bg-[#fff7f2]' : 'border-[#E5E7EB] bg-white'}`}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-black text-[#1F2937]">{card.card_number}</span>
                      <span className="text-sm font-black text-[#16A34A]">{formatCurrency(card.balance || 0)}</span>
                    </div>
                    <div className="mt-1 flex min-w-0 items-end justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-[#6B7280]">{card.customer_name || l.unnamedCustomer} · {statusLabel(card)}</p>
                        <p className="mt-1 truncate text-xs font-bold text-[#9CA3AF]">{card.phone_number || l.noPhoneNumber} · {cashbackTypeLabel(card.cashback_type)}</p>
                      </div>
                      <ChevronRight size={16} className="flex-shrink-0 text-[#9CA3AF] lg:hidden" />
                    </div>
                  </button>
                ))}
                {!loadingCards && cards.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-[#D1D5DB] bg-white p-5 text-center text-sm font-bold text-[#6B7280]">
                    {l.noCards}
                  </div>
                )}
                {hasMoreCards && (
                  <button
                    type="button"
                    onClick={() => searchCards(query, { reset: false })}
                    disabled={loadingCards}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-4 py-2.5 text-sm font-black text-[#1F2937] disabled:opacity-60"
                  >
                    <RefreshCw size={14} className={loadingCards ? 'animate-spin' : ''} />
                    {loadingCards ? l.loading : l.loadMore}
                  </button>
                )}
              </div>
            </div>
          </section>

          <section className={`${selected ? '' : 'hidden lg:block'} min-w-0 rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm md:p-5`}>
            {selected ? (
              <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(320px,430px)_minmax(0,1fr)]">
                <div className="xl:col-span-2 lg:hidden">
                  <button onClick={() => setSelected(null)} className="mb-3 flex items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-sm font-black text-[#1F2937]">
                    <ArrowLeft size={16} /> {l.back}
                  </button>
                </div>
                <div className="space-y-4">
                  <div className="rounded-2xl border border-[#E5E7EB] bg-[#FBFCFE] p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-black uppercase tracking-widest text-[#9CA3AF]">{l.profileTitle}</p>
                        <h2 className="mt-2 truncate text-2xl font-black text-[#1F2937]">{selectedName(selected)}</h2>
                        <p className="mt-1 text-sm font-semibold text-[#6B7280]">{selectedPhone(selected)} · {l.cardNo}: {selected.card_number}</p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-black ${selected.is_active === false ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>
                        {statusLabel(selected)}
                      </span>
                    </div>

                    <div className="mt-4 rounded-2xl border border-[#E5E7EB] bg-white p-4">
                      <p className="text-xs font-black uppercase tracking-widest text-[#9CA3AF]">{l.customerName}</p>
                      {canEdit ? (
                        <div className="mt-3 grid gap-2">
                          <input value={profileForm.customer_name} onChange={e => setProfileForm({ ...profileForm, customer_name: e.target.value })} placeholder={l.noCustomerName} className="w-full rounded-xl border border-[#E5E7EB] px-3 py-2 text-sm font-semibold" />
                          <input value={profileForm.phone_number} onChange={e => setProfileForm({ ...profileForm, phone_number: formatUzPhoneNumberInput(e.target.value) })} placeholder="+998 91 132 32 32" className="w-full rounded-xl border border-[#E5E7EB] px-3 py-2 text-sm font-semibold" />
                          <button onClick={updateCustomerProfile} className="rounded-xl bg-[#1F2937] px-4 py-2.5 text-sm font-black text-white">{l.saveCustomer}</button>
                        </div>
                      ) : (
                        <div className="mt-3 space-y-1">
                          <p className="text-sm font-black text-[#1F2937]">{selectedName(selected)}</p>
                          <p className="text-sm font-semibold text-[#6B7280]">{selectedPhone(selected)}</p>
                        </div>
                      )}
                      <p className="mt-3 text-xs font-bold text-[#9CA3AF]">{l.cardNo}: {selected.card_number}</p>
                    </div>

                    <div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-4">
                      <p className="text-xs font-black uppercase tracking-widest text-emerald-700">{l.balance}</p>
                      <p className="mt-1 text-4xl font-black text-[#16A34A]">{formatCurrency(selected.balance || 0)}</p>
                    </div>

                    <div className="mt-4 rounded-2xl border border-[#E5E7EB] bg-white p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-black uppercase tracking-widest text-[#9CA3AF]">{l.cashbackType}</p>
                          <p className="mt-1 text-sm font-black text-[#1F2937]">{cashbackTypeLabel(selected.cashback_type)}</p>
                        </div>
                        <span className="rounded-full bg-[#fff1e8] px-3 py-1 text-xs font-black text-[#ff5a00]">{l.cashbackRate}: {getCashbackTypePercent(selected.cashback_type || DEFAULT_CASHBACK_TYPE)}%</span>
                      </div>
                      <p className="mt-3 rounded-xl bg-gray-50 px-3 py-2 text-xs font-bold text-[#6B7280]">{l.ownerTypeOnly}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-gray-50 p-4"><p className="text-xs font-bold text-[#6B7280]">{l.totalEarned}</p><p className="mt-1 font-black text-[#1F2937]">{formatCurrency(selected.total_earned || 0)}</p></div>
                    <div className="rounded-2xl bg-gray-50 p-4"><p className="text-xs font-bold text-[#6B7280]">{l.totalUsed}</p><p className="mt-1 font-black text-[#1F2937]">{formatCurrency(selected.total_redeemed || 0)}</p></div>
                    <div className="rounded-2xl bg-gray-50 p-4"><p className="text-xs font-bold text-[#6B7280]">{l.status}</p><p className="mt-1 font-black text-[#1F2937]">{statusLabel(selected)}</p></div>
                    <div className="rounded-2xl bg-gray-50 p-4"><p className="text-xs font-bold text-[#6B7280]">{l.cashbackType}</p><p className="mt-1 font-black text-[#1F2937]">{cashbackTypeLabel(selected.cashback_type)}</p></div>
                  </div>

                  <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <h3 className="flex items-center gap-2 text-sm font-black text-[#1F2937]"><BadgeDollarSign size={16} /> {l.ownerActions}</h3>
                        <p className="mt-1 text-xs font-bold text-[#6B7280]">{l.manualAdjustment}</p>
                      </div>
                      <button onClick={() => removeCard(selected)} disabled={!canRemoveCard} className="flex items-center gap-2 rounded-xl border border-red-200 px-3 py-2 text-xs font-black text-red-600 disabled:opacity-40">
                        <Trash2 size={14} /> {confirmDeleteId === `card:${selected.id}` ? l.confirmRemoveCard : l.removeCard}
                      </button>
                    </div>
                    {canRemoveCard && <p className="mb-3 text-xs font-semibold text-red-500">{l.removeCardHelp}</p>}
                    <p className="mb-3 text-xs font-semibold text-[#9CA3AF]">{canAdjust ? l.adjustmentHelper : l.ownerAdjustOnly}</p>
                    <div className="grid gap-2">
                      <input type="number" value={adjustment.amount} disabled={!canAdjust} onChange={e => setAdjustment({ ...adjustment, amount: e.target.value })} placeholder={l.amountPlaceholder} className="rounded-xl border border-[#E5E7EB] px-3 py-2 text-sm font-semibold disabled:bg-gray-50" />
                      <input value={adjustment.reason} disabled={!canAdjust} onChange={e => setAdjustment({ ...adjustment, reason: e.target.value })} placeholder={l.reason} className="rounded-xl border border-[#E5E7EB] px-3 py-2 text-sm font-semibold disabled:bg-gray-50" />
                      <button onClick={adjustBalance} disabled={!canAdjust} className="rounded-xl bg-[#0f3b2e] px-4 py-2.5 text-sm font-black text-white disabled:bg-gray-200 disabled:text-[#9CA3AF]">{l.apply}</button>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-[#E5E7EB] bg-[#FBFCFE] p-5">
                  <div className="mb-4">
                    <h3 className="text-base font-black text-[#1F2937]">{l.transactionHistory}</h3>
                    <p className="mt-1 text-xs font-bold text-[#9CA3AF]">{canDeleteTransactions ? l.latestTransactions : l.ownerDeleteOnly}</p>
                  </div>
                  <div className="space-y-3">
                    {transactions.map(tx => (
                      <div key={tx.id} className="rounded-2xl border border-[#E5E7EB] bg-white p-4 text-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-black text-[#1F2937]">{transactionTypeLabel(tx.type)}</p>
                            <p className="mt-1 text-xs font-semibold text-[#6B7280]">{transactionDescription(tx)}</p>
                          </div>
                          <p className={`text-base font-black ${transactionAmountClass(tx)}`}>{transactionAmount(tx)}</p>
                        </div>
                        {tx.type === 'cashback_earned' && (
                          <p className="mt-3 text-xs font-bold text-[#92400E]">{transactionCardType(tx)}</p>
                        )}
                        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-[#6B7280]">
                          {tx.order_id && <span>{l.orderPrefix} #{tx.order_id}</span>}
                          {tx.created_at && <span>{formatTransactionDate(tx.created_at)}</span>}
                        </div>
                        {tx.balance_before != null && tx.balance_after != null && (
                          <p className="mt-2 text-xs font-bold text-[#1F2937]">{l.balanceFlow}: {formatCurrency(tx.balance_before)} -&gt; {formatCurrency(tx.balance_after)}</p>
                        )}
                        {canDeleteTransactions && (
                          <div className="mt-3 flex flex-wrap justify-end gap-2">
                            {confirmDeleteId === tx.id && (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId('')}
                                className="inline-flex items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-xs font-black text-[#6B7280]"
                              >
                                <X size={13} /> {l.cancel}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => deleteTransaction(tx)}
                              disabled={deletingTransactionId === tx.id}
                              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-black ${
                                confirmDeleteId === tx.id
                                  ? 'bg-red-600 text-white'
                                  : 'border border-red-200 bg-red-50 text-red-600'
                              } disabled:opacity-60`}
                            >
                              <Trash2 size={13} />
                              {deletingTransactionId === tx.id
                                ? l.deletingTransaction
                                : confirmDeleteId === tx.id ? l.confirmDelete : l.deleteTransaction}
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                    {transactions.length === 0 && (
                      <div className="rounded-2xl border border-dashed border-[#D1D5DB] bg-white p-6 text-center text-sm font-semibold text-[#6B7280]">{l.noTransactions}</div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex min-h-[420px] items-center justify-center text-center">
                <div>
                  <BadgeDollarSign size={40} className="mx-auto mb-3 text-[#ff5a00]" />
                  <p className="font-black text-[#1F2937]">{l.selectCard}</p>
                  <p className="text-sm font-semibold text-[#6B7280]">{l.selectCardSub}</p>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  )
}
