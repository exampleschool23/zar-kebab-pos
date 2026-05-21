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
      manualAdjustment: 'Balansni qo‘lda tuzatish',
      amountPlaceholder: '+/- summa',
      reason: 'Sabab',
      apply: 'Qo‘llash',
      transactionHistory: 'Balans tranzaksiyalari tarixi',
      noTransactions: 'Hali tranzaksiyalar yo‘q.',
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
      manualAdjustment: 'Ручная корректировка баланса',
      amountPlaceholder: '+/- сумма',
      reason: 'Причина',
      apply: 'Применить',
      transactionHistory: 'История транзакций баланса',
      noTransactions: 'Транзакций пока нет.',
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
      manualAdjustment: 'Manual balance adjustment',
      amountPlaceholder: '+/- amount',
      reason: 'Reason',
      apply: 'Apply',
      transactionHistory: 'Balance transaction history',
      noTransactions: 'No transactions yet.',
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
              <>
                <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-[#9CA3AF]">{l.cashbackBalance}</p>
                    <h2 className="mt-1 text-3xl font-black text-[#16A34A]">{formatCurrency(selected.balance || 0)}</h2>
                    <p className="mt-1 text-sm font-semibold text-[#6B7280]">{selected.customer_name || l.unnamedCustomer} · {selected.phone_number || '—'} · {selected.card_number}</p>
                  </div>
                  <button onClick={() => deactivateCard(selected)} disabled={selected.is_active === false || !canDeactivate} className="flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2 text-sm font-black text-red-600 disabled:opacity-40">
                    <Ban size={15} /> {l.deactivate}
                  </button>
                </div>

                <div className="mb-5 grid gap-3 md:grid-cols-4">
                  <div className="rounded-xl bg-gray-50 p-4"><p className="text-xs font-bold text-[#6B7280]">{l.totalEarned}</p><p className="mt-1 font-black text-[#1F2937]">{formatCurrency(selected.total_earned || 0)}</p></div>
                  <div className="rounded-xl bg-gray-50 p-4"><p className="text-xs font-bold text-[#6B7280]">{l.totalUsed}</p><p className="mt-1 font-black text-[#1F2937]">{formatCurrency(selected.total_redeemed || 0)}</p></div>
                  <div className="rounded-xl bg-gray-50 p-4"><p className="text-xs font-bold text-[#6B7280]">{l.status}</p><p className="mt-1 font-black text-[#1F2937]">{statusLabel(selected)}</p></div>
                  <div className="rounded-xl bg-gray-50 p-4">
                    <p className="text-xs font-bold text-[#6B7280]">{l.cashbackType}</p>
                    {canEdit ? (
                      <select value={selected.cashback_type || DEFAULT_CASHBACK_TYPE} onChange={e => updateCashbackType(selected, e.target.value)} className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-white px-2 py-1 text-sm font-black text-[#1F2937]">
                        {Object.entries(CASHBACK_TYPES).map(([key, config]) => (
                          <option key={key} value={key}>{config.label} · {config.percent}%</option>
                        ))}
                      </select>
                    ) : (
                      <p className="mt-1 font-black text-[#1F2937]">{cashbackTypeLabel(selected.cashback_type)}</p>
                    )}
                    <p className="mt-1 text-xs font-bold text-[#9CA3AF]">{l.cashbackRate}: {getCashbackTypePercent(selected.cashback_type || DEFAULT_CASHBACK_TYPE)}%</p>
                  </div>
                </div>

                <div className="mb-5 rounded-2xl border border-[#E5E7EB] p-4">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-black text-[#1F2937]"><BadgeDollarSign size={16} /> {l.manualAdjustment}</h3>
                  <div className="grid gap-2 md:grid-cols-[160px_1fr_auto]">
                    <input type="number" value={adjustment.amount} disabled={!canAdjust} onChange={e => setAdjustment({ ...adjustment, amount: e.target.value })} placeholder={l.amountPlaceholder} className="rounded-xl border border-[#E5E7EB] px-3 py-2 text-sm font-semibold disabled:bg-gray-50" />
                    <input value={adjustment.reason} disabled={!canAdjust} onChange={e => setAdjustment({ ...adjustment, reason: e.target.value })} placeholder={l.reason} className="rounded-xl border border-[#E5E7EB] px-3 py-2 text-sm font-semibold disabled:bg-gray-50" />
                    <button onClick={adjustBalance} disabled={!canAdjust} className="rounded-xl bg-[#0f3b2e] px-4 py-2 text-sm font-black text-white disabled:bg-gray-200 disabled:text-[#9CA3AF]">{l.apply}</button>
                  </div>
                </div>

                <h3 className="mb-3 text-sm font-black text-[#1F2937]">{l.transactionHistory}</h3>
                <div className="divide-y divide-gray-100 rounded-xl border border-[#E5E7EB]">
                  {transactions.map(tx => (
                    <div key={tx.id} className="grid gap-2 p-3 text-sm md:grid-cols-[1fr_auto_auto]">
                      <div>
                        <p className="font-black text-[#1F2937]">{transactionTypeLabel(tx.type)}</p>
                        <p className="text-xs font-semibold text-[#6B7280]">{tx.reason || tx.order_id || ''}</p>
                      </div>
                      <p className="font-black text-[#1F2937]">{formatCurrency(tx.amount || 0)}</p>
                      <p className="text-xs font-semibold text-[#6B7280]">{new Date(tx.created_at).toLocaleString()}</p>
                    </div>
                  ))}
                  {transactions.length === 0 && <p className="p-4 text-sm font-semibold text-[#6B7280]">{l.noTransactions}</p>}
                </div>
              </>
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
