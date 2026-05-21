import React, { useEffect, useState } from 'react'
import { Search, BadgeDollarSign, Plus, Ban, RefreshCw } from 'lucide-react'
import UnifiedSidebar from '../components/UnifiedSidebar'
import { supabase } from '../lib/supabase'
import { formatCurrency } from '../lib/formatCurrency'
import {
  CASHBACK_TYPES,
  DEFAULT_CASHBACK_TYPE,
  adjustLoyaltyBalance,
  canAdjustLoyaltyBalance,
  canCreateLoyaltyCard,
  canDeactivateLoyaltyCard,
  canEditLoyaltyCard,
  createLoyaltyCardRecord,
  editLoyaltyCardRecord,
  formatUzPhoneNumberInput,
  getCashbackTypePercent,
  isMissingLoyaltySchemaColumn,
} from '../lib/loyalty'
import { useApp } from '../store/AppContext'
import { useAuth } from '../contexts/AuthContext'

function makeCardNumber() {
  return String(Math.floor(10000000 + Math.random() * 90000000))
}

export default function AdminLoyalty() {
  const { state } = useApp()
  const { profile } = useAuth()
  const lang = state.lang || 'ru'
  const role = profile?.role || state.user?.role || 'guest'
  const canCreate = canCreateLoyaltyCard(role)
  const canEdit = canEditLoyaltyCard(role)
  const canAdjust = canAdjustLoyaltyBalance(role)
  const canDeactivate = canDeactivateLoyaltyCard(role)
  const [query, setQuery] = useState('')
  const [cards, setCards] = useState([])
  const [selected, setSelected] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [form, setForm] = useState({ customer_name: '', phone_number: '', cashback_type: DEFAULT_CASHBACK_TYPE })
  const [adjustment, setAdjustment] = useState({ amount: '', reason: '' })
  const [message, setMessage] = useState('')
  const [supportsCashbackType, setSupportsCashbackType] = useState(true)

  const L = {
    uz: {
      title: 'Sodiqlik kartalari',
      subtitle: 'Cashback hamyon balanslari va tranzaksiya tarixi',
      refresh: 'Yangilash',
      createTitle: 'Sodiqlik kartasini yaratish',
      customerName: 'Mijoz ismi',
      phoneNumber: 'Telefon raqami',
      createCard: 'Sodiqlik kartasini yaratish',
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
      deactivate: 'Faolsizlantirish',
      totalEarned: 'Jami cashback',
      totalUsed: 'Jami ishlatilgan sodiqlik balansi',
      status: 'Status',
      ownerActions: 'Owner moliyaviy amallari',
      manualAdjustment: 'Balansni qo‘lda tuzatish',
      adjustmentHelper: 'Har bir qo‘lda tuzatish tranzaksiya yozuvini yaratadi.',
      ownerAdjustOnly: 'Faqat owner sodiqlik balansini qo‘lda tuzatishi mumkin.',
      ownerTypeOnly: 'Cashback turini faqat owner o‘zgartirishi mumkin.',
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
      cashbackTypeUnavailable: 'Cashback turi ustuni hali bazada qo‘llanmagan. 022 migratsiyasini ishga tushiring.',
      cardFormRequired: 'Mijoz ismi va +998 XX XXX XX XX formatidagi telefon raqamini kiriting.',
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
      createTitle: 'Создать карту лояльности',
      customerName: 'Имя клиента',
      phoneNumber: 'Номер телефона',
      createCard: 'Создать карту лояльности',
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
      deactivate: 'Деактивировать',
      totalEarned: 'Всего кешбэка начислено',
      totalUsed: 'Всего использовано с баланса',
      status: 'Статус',
      ownerActions: 'Финансовые действия владельца',
      manualAdjustment: 'Ручная корректировка баланса',
      adjustmentHelper: 'Каждая ручная корректировка создаёт запись транзакции.',
      ownerAdjustOnly: 'Только владелец может вручную изменять баланс лояльности.',
      ownerTypeOnly: 'Только владелец может менять тип кешбэка.',
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
      cashbackTypeUnavailable: 'Колонка типа кешбэка ещё не применена в базе. Запустите миграцию 022.',
      cardFormRequired: 'Введите имя клиента и телефон в формате +998 XX XXX XX XX.',
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
      createTitle: 'Create loyalty card',
      customerName: 'Customer name',
      phoneNumber: 'Phone number',
      createCard: 'Create loyalty card',
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
      deactivate: 'Deactivate',
      totalEarned: 'Total cashback earned',
      totalUsed: 'Total loyalty used',
      status: 'Status',
      ownerActions: 'Owner financial actions',
      manualAdjustment: 'Manual balance adjustment',
      adjustmentHelper: 'Every manual adjustment creates a transaction record.',
      ownerAdjustOnly: 'Only owner can manually adjust loyalty balance.',
      ownerTypeOnly: 'Only owner can change cashback type.',
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
      cashbackTypeUnavailable: 'Cashback type is not available in the database yet. Run migration 022.',
      cardFormRequired: 'Enter customer name and phone number in +998 XX XXX XX XX format.',
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
    const amount = Number(tx.amount) || 0
    const isCredit = tx.type === 'cashback_earned' || tx.type === 'manual_adjustment' && Number(tx.balance_after) >= Number(tx.balance_before)
    return `${isCredit ? '+' : '-'}${formatCurrency(amount)}`
  }

  function transactionAmountClass(tx) {
    return tx.type === 'cashback_earned' || tx.type === 'manual_adjustment' && Number(tx.balance_after) >= Number(tx.balance_before)
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
    if (!value) return ''
    try {
      return new Date(value).toLocaleString()
    } catch {
      return ''
    }
  }

  function transactionCardType(tx) {
    const type = tx.card_type_at_transaction || DEFAULT_CASHBACK_TYPE
    const label = CASHBACK_TYPES[type]?.label || CASHBACK_TYPES[DEFAULT_CASHBACK_TYPE].label
    const percent = tx.cashback_percent_used ?? getCashbackTypePercent(type)
    return `${label} ${l.cashbackMeta} ${percent}%`
  }

  async function searchCards(term = query) {
    setMessage('')
    let request = supabase
      .from('loyalty_cards')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(25)
    const trimmed = term.trim()
    if (trimmed) {
      request = request.or(`card_number.ilike.%${trimmed}%,customer_name.ilike.%${trimmed}%,phone_number.ilike.%${trimmed}%`)
    }
    const { data, error } = await request
    if (error) {
      setMessage(error.message)
      return
    }
    if ((data || []).some(card => !Object.prototype.hasOwnProperty.call(card, 'cashback_type'))) {
      setSupportsCashbackType(false)
    }
    setCards(data || [])
  }

  async function loadTransactions(card) {
    setSelected(card)
    const { data, error } = await supabase
      .from('loyalty_transactions')
      .select('*')
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
        cardNumber: makeCardNumber(),
        customerName: form.customer_name,
        phoneNumber: form.phone_number,
        cashbackType: form.cashback_type,
        existingCardNumbers: cards.map(card => card.card_number),
        now,
      })
    } catch (error) {
      setMessage(['customer_name_required', 'invalid_phone_number'].includes(error.code) ? l.cardFormRequired : error.message)
      return
    }
    const { cashback_type: ignoredCashbackType, ...legacyCardRecord } = cardRecord
    let insertRecord = supportsCashbackType ? cardRecord : legacyCardRecord
    let { data, error } = await supabase
      .from('loyalty_cards')
      .insert(insertRecord)
      .select('*')
      .single()
    if (error && isMissingLoyaltySchemaColumn(error, 'cashback_type')) {
      setSupportsCashbackType(false)
      ;({ data, error } = await supabase
        .from('loyalty_cards')
        .insert(legacyCardRecord)
        .select('*')
        .single())
    }
    if (error) {
      setMessage(error.message)
      return
    }
    setForm({ customer_name: '', phone_number: '', cashback_type: DEFAULT_CASHBACK_TYPE })
    setCards(prev => [data, ...prev])
    loadTransactions(data)
  }

  async function deactivateCard(card) {
    if (!canDeactivate) {
      setMessage(l.ownerOnly)
      return
    }
    const { data, error } = await supabase
      .from('loyalty_cards')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', card.id)
      .select('*')
      .single()
    if (error) {
      setMessage(error.message)
      return
    }
    setCards(prev => prev.map(row => row.id === data.id ? data : row))
    setSelected(data)
  }

  async function updateCashbackType(card, cashbackType) {
    if (!canEdit) {
      setMessage(l.ownerOnly)
      return
    }
    if (!supportsCashbackType) {
      if (cashbackType === DEFAULT_CASHBACK_TYPE) {
        const fallbackCard = { ...card, cashback_type: DEFAULT_CASHBACK_TYPE }
        setSelected(fallbackCard)
        setCards(prev => prev.map(row => row.id === card.id ? fallbackCard : row))
        setMessage('')
        return
      }
      setMessage(l.cashbackTypeUnavailable)
      return
    }
    const next = editLoyaltyCardRecord({ role, card, patch: { cashback_type: cashbackType } })
    const { data, error } = await supabase
      .from('loyalty_cards')
      .update({
        cashback_type: next.cashback_type,
        updated_at: next.updated_at,
      })
      .eq('id', card.id)
      .select('*')
      .single()
    if (error) {
      if (isMissingLoyaltySchemaColumn(error, 'cashback_type')) {
        setSupportsCashbackType(false)
        setMessage(l.cashbackTypeUnavailable)
        return
      }
      setMessage(error.message)
      return
    }
    setCards(prev => prev.map(row => row.id === data.id ? data : row))
    setSelected(data)
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
      .select('*')
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

  useEffect(() => {
    searchCards('')
  }, [])

  return (
    <div className="flex min-h-screen bg-[#FAF7F0]">
      <UnifiedSidebar />
      <main className="flex-1 p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black text-[#1F2937]">{l.title}</h1>
            <p className="text-sm font-semibold text-[#6B7280]">{l.subtitle}</p>
          </div>
          <button onClick={() => searchCards()} className="flex items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-black text-[#1F2937]">
            <RefreshCw size={15} /> {l.refresh}
          </button>
        </div>

        {message && <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700">{message}</div>}

        <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
          <section className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-black text-[#1F2937]">{l.createTitle}</h2>
            <div className="space-y-2">
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
                <input value={query} onChange={e => { setQuery(e.target.value); searchCards(e.target.value) }} placeholder={l.searchPlaceholder} className="min-w-0 flex-1 text-sm font-semibold outline-none" />
              </div>
              <div className="space-y-2">
                {cards.map(card => (
                  <button key={card.id} onClick={() => loadTransactions(card)} className={`w-full rounded-xl border p-3 text-left ${selected?.id === card.id ? 'border-[#ff5a00] bg-[#fff7f2]' : 'border-[#E5E7EB] bg-white'}`}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-black text-[#1F2937]">{card.card_number}</span>
                      <span className="text-sm font-black text-[#16A34A]">{formatCurrency(card.balance || 0)}</span>
                    </div>
                    <p className="mt-1 text-xs font-semibold text-[#6B7280]">{card.customer_name || l.unnamedCustomer} · {statusLabel(card)}</p>
                    <p className="mt-1 text-xs font-bold text-[#9CA3AF]">{card.phone_number || '—'} · {cashbackTypeLabel(card.cashback_type)}</p>
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
            {selected ? (
              <div className="grid gap-4 xl:grid-cols-[minmax(320px,430px)_1fr]">
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
                      {canEdit ? (
                        <select value={selected.cashback_type || DEFAULT_CASHBACK_TYPE} onChange={e => updateCashbackType(selected, e.target.value)} className="mt-3 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-sm font-black text-[#1F2937]">
                          {Object.entries(CASHBACK_TYPES).map(([key, config]) => (
                            <option key={key} value={key}>{config.label} · {config.percent}%</option>
                          ))}
                        </select>
                      ) : (
                        <p className="mt-3 rounded-xl bg-gray-50 px-3 py-2 text-xs font-bold text-[#6B7280]">{l.ownerTypeOnly}</p>
                      )}
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
                      <button onClick={() => deactivateCard(selected)} disabled={selected.is_active === false || !canDeactivate} className="flex items-center gap-2 rounded-xl border border-red-200 px-3 py-2 text-xs font-black text-red-600 disabled:opacity-40">
                        <Ban size={14} /> {l.deactivate}
                      </button>
                    </div>
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
                    <p className="mt-1 text-xs font-bold text-[#9CA3AF]">{l.latestTransactions}</p>
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
      </main>
    </div>
  )
}
