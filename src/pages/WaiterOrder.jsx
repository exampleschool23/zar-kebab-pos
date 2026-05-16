import React, { useState, useMemo, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Search, ShoppingCart, Plus, Minus, UtensilsCrossed,
  Menu as MenuIcon, LayoutGrid, X, CheckCircle2, Clock,
  ChefHat, Receipt, Loader2, Tag, ArrowLeft,
} from 'lucide-react'
import { useApp } from '../store/AppContext'
import { useAuth } from '../contexts/AuthContext'
import { t, getItemName, getItemDesc, getCategoryName } from '../lib/i18n'
import { formatCurrency } from '../lib/formatCurrency'
import CartPanel from '../components/CartPanel'
import UnifiedSidebar from '../components/UnifiedSidebar'

// ── CategoryCard ───────────────────────────────────────────────────────────────
function CategoryCard({ cat, active, itemCount, onClick, lang }) {
  const isAll = cat.id === 'all'
  return (
    <button
      onClick={onClick}
      style={{ width: '120px', minWidth: '120px', height: '96px' }}
      className={`flex-shrink-0 flex flex-col items-center justify-center rounded-2xl border-2 transition-all gap-1.5 p-2 ${
        active
          ? 'border-[#ff5a00] bg-[#fff1e8]'
          : 'border-[#E5E7EB] bg-white hover:border-orange-200 hover:bg-orange-50/30 shadow-sm'
      }`}
    >
      {isAll ? (
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${active ? 'bg-[#ff5a00]/15' : 'bg-orange-50'}`}>
          <LayoutGrid size={20} className={active ? 'text-[#ff5a00]' : 'text-orange-400'} />
        </div>
      ) : cat.image_url ? (
        <img src={cat.image_url} alt="" className="w-11 h-11 rounded-xl object-cover flex-shrink-0" />
      ) : (
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${active ? 'bg-[#ff5a00]/15' : 'bg-gray-100'}`}>
          <UtensilsCrossed size={16} className={active ? 'text-[#ff5a00]' : 'text-gray-400'} />
        </div>
      )}
      <div className="text-center w-full px-0.5">
        <p className={`text-[12px] font-bold truncate leading-tight ${active ? 'text-[#ff5a00]' : 'text-[#1F2937]'}`}>
          {isAll
            ? (lang === 'uz' ? 'Barchasi' : lang === 'ru' ? 'Все' : 'All')
            : getCategoryName(cat, lang)}
        </p>
        <p className={`text-[10px] mt-0.5 ${active ? 'text-[#ff5a00]/70' : 'text-[#9CA3AF]'}`}>
          {itemCount} {lang === 'uz' ? 'ta' : lang === 'ru' ? 'шт' : 'items'}
        </p>
      </div>
    </button>
  )
}

// ── ProductCard ────────────────────────────────────────────────────────────────
function ProductCard({ item, qty, onAdd, onIncrement, onDecrement, onOpenDetail, lang }) {
  const inCart = qty > 0

  return (
    <div
      onClick={() => onOpenDetail(item)}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onOpenDetail(item)}
      className={`bg-white rounded-[18px] border-2 flex flex-col overflow-hidden transition-all cursor-pointer select-none ${
        inCart
          ? 'border-[#ff5a00]/40 shadow-md shadow-orange-100/60'
          : 'border-[#E5E7EB] shadow-sm hover:shadow-md hover:border-gray-200'
      }`}
    >
      {/* Image */}
      <div className="relative w-full bg-gray-50 flex-shrink-0" style={{ height: '140px' }}>
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={getItemName(item, lang)}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full bg-orange-50 flex items-center justify-center">
            <UtensilsCrossed size={32} className="text-orange-200" />
          </div>
        )}
        {inCart && (
          <div className="absolute top-2 right-2 bg-[#ff5a00] text-white text-[11px] font-black rounded-full w-6 h-6 flex items-center justify-center shadow">
            {qty}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-3 flex flex-col flex-1">
        <h3 className="font-bold text-[15px] text-[#1F2937] line-clamp-2 leading-snug mb-1 flex-1">
          {getItemName(item, lang)}
        </h3>
        {getItemDesc(item, lang) && (
          <p className="text-[12px] text-[#9CA3AF] line-clamp-1 mb-1.5">{getItemDesc(item, lang)}</p>
        )}
        <p className="font-black text-[16px] text-[#ff5a00] mb-2.5">{formatCurrency(item.price)}</p>

        {inCart ? (
          <div
            onClick={e => e.stopPropagation()}
            className="flex items-center justify-between bg-[#fff1e8] rounded-xl px-2 py-1 border border-[#ff5a00]/20"
          >
            <button
              onClick={e => { e.stopPropagation(); onDecrement(item) }}
              className="w-9 h-9 rounded-xl bg-white border border-[#E5E7EB] flex items-center justify-center hover:bg-red-50 hover:border-red-200 active:scale-90 transition-all shadow-sm"
            >
              <Minus size={14} className="text-[#6B7280]" />
            </button>
            <span className="font-black text-[18px] text-[#ff5a00] min-w-[24px] text-center">{qty}</span>
            <button
              onClick={e => { e.stopPropagation(); onIncrement(item) }}
              className="w-9 h-9 rounded-xl bg-[#ff5a00] flex items-center justify-center hover:bg-[#cc4800] active:scale-90 transition-all shadow-sm"
            >
              <Plus size={14} className="text-white" />
            </button>
          </div>
        ) : (
          <button
            onClick={e => { e.stopPropagation(); onAdd(item) }}
            className="w-full rounded-xl bg-[#fff1e8] text-[#ff5a00] border border-[#ff5a00]/20 text-[13px] font-bold hover:bg-[#ff5a00] hover:text-white active:scale-95 transition-all flex items-center justify-center gap-1.5"
            style={{ height: '40px' }}
          >
            <Plus size={14} />
            {lang === 'uz' ? "Qo'shish" : lang === 'ru' ? 'Добавить' : 'Add'}
          </button>
        )}
      </div>
    </div>
  )
}

// ── ProductDetailsModal ────────────────────────────────────────────────────────
function ProductDetailsModal({ item, category, currentQty, currentNotes, lang, onConfirm, onClose }) {
  const [qty,   setQty]   = useState(Math.max(1, currentQty))
  const [notes, setNotes] = useState(currentNotes || '')

  // Sync when item changes
  useEffect(() => {
    setQty(Math.max(1, currentQty))
    setNotes(currentNotes || '')
  }, [item?.id, currentQty, currentNotes])

  if (!item) return null

  const inCart = currentQty > 0
  const total  = item.price * qty

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 p-0 md:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Modal card */}
      <div className="bg-white w-full md:max-w-[680px] md:rounded-[24px] rounded-t-[24px] shadow-2xl overflow-hidden flex flex-col md:flex-row max-h-[92vh] md:max-h-[85vh]">

        {/* Image */}
        <div className="relative md:w-[280px] md:flex-shrink-0 h-[200px] md:h-auto">
          {item.image_url ? (
            <img src={item.image_url} alt={getItemName(item, lang)} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-orange-50 flex items-center justify-center">
              <UtensilsCrossed size={48} className="text-orange-200" />
            </div>
          )}
        </div>

        {/* Info side */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-5 pt-5 pb-2">

            {/* Header */}
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex-1 min-w-0">
                <h2 className="font-black text-[20px] text-[#1F2937] leading-tight">
                  {getItemName(item, lang)}
                </h2>
                {getItemDesc(item, lang) && (
                  <p className="text-[13px] text-[#6B7280] mt-1.5 leading-relaxed">
                    {getItemDesc(item, lang)}
                  </p>
                )}
              </div>
              <button
                onClick={onClose}
                className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors flex-shrink-0"
              >
                <X size={16} className="text-[#6B7280]" />
              </button>
            </div>

            {/* Category + Price */}
            <div className="flex items-center gap-3 mb-4">
              {category && (
                <div className="flex items-center gap-1.5 bg-orange-50 px-2.5 py-1.5 rounded-xl">
                  <Tag size={11} className="text-[#ff5a00]" />
                  <span className="text-[11px] font-bold text-[#ff5a00] uppercase tracking-wide">
                    {getCategoryName(category, lang)}
                  </span>
                </div>
              )}
              <span className="font-black text-[22px] text-[#ff5a00] ml-auto">
                {formatCurrency(item.price)}
              </span>
            </div>

            {/* Quantity */}
            <div className="mb-4">
              <p className="text-[11px] font-bold text-[#9CA3AF] uppercase tracking-wider mb-2.5">
                {lang === 'uz' ? 'Miqdor' : lang === 'ru' ? 'Количество' : 'Quantity'}
              </p>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setQty(q => Math.max(1, q - 1))}
                  className="w-11 h-11 rounded-xl bg-gray-100 flex items-center justify-center hover:bg-gray-200 active:scale-95 transition-all"
                >
                  <Minus size={16} className="text-[#1F2937]" />
                </button>
                <span className="font-black text-[26px] text-[#1F2937] min-w-[36px] text-center leading-none">
                  {qty}
                </span>
                <button
                  onClick={() => setQty(q => q + 1)}
                  className="w-11 h-11 rounded-xl bg-[#ff5a00] flex items-center justify-center hover:bg-[#cc4800] active:scale-95 transition-all shadow-sm shadow-orange-200"
                >
                  <Plus size={16} className="text-white" />
                </button>
              </div>
            </div>

            {/* Notes */}
            <div>
              <p className="text-[11px] font-bold text-[#9CA3AF] uppercase tracking-wider mb-2">
                {lang === 'uz' ? 'Izoh (ixtiyoriy)' : lang === 'ru' ? 'Заметки (опционально)' : 'Notes (optional)'}
              </p>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder={
                  lang === 'uz' ? 'Izoh qo\'shing...'
                  : lang === 'ru' ? 'Добавьте заметку...'
                  : 'Add notes...'
                }
                rows={2}
                className="w-full border border-[#E5E7EB] rounded-xl px-3 py-2.5 text-[13px] text-[#1F2937] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#ff5a00]/20 focus:border-[#ff5a00] resize-none transition-all"
              />
            </div>
          </div>

          {/* CTA */}
          <div className="px-5 py-4 flex-shrink-0 border-t border-[#F3F4F6]">
            <button
              onClick={() => onConfirm(item, qty, notes)}
              className="w-full bg-[#ff5a00] text-white rounded-xl font-black text-[15px] flex items-center justify-center gap-2.5 hover:bg-[#cc4800] active:scale-[0.98] transition-all shadow-md shadow-orange-200"
              style={{ height: '52px' }}
            >
              <ShoppingCart size={18} />
              <span>
                {inCart
                  ? (lang === 'uz' ? 'Yangilash' : lang === 'ru' ? 'Обновить корзину' : 'Update Cart')
                  : (lang === 'uz' ? "Savatga qo'shish" : lang === 'ru' ? 'Добавить в корзину' : 'Add to Cart')
                }
              </span>
              <span className="font-medium opacity-80 text-[13px]">{formatCurrency(total)}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── OrderActionPanel ───────────────────────────────────────────────────────────
function OrderActionPanel({ order, tableId, lang, dispatch, cartCount }) {
  const [busy, setBusy] = useState(false)

  if (!order) return null
  if (cartCount > 0) return null

  const items       = order.items || []
  const newCount    = items.filter(i => i.status === 'new').length
  const prepCount   = items.filter(i => i.status === 'preparing').length
  const readyCount  = items.filter(i => i.status === 'ready').length
  const inKitchen   = newCount > 0 || prepCount > 0
  const allReady    = items.length > 0 && !inKitchen
  const isDelivered = !inKitchen && order.status === 'delivered'
  const isNeedsBill = !inKitchen && order.status === 'needs_bill'

  const L = {
    uz: {
      kitchenTitle: 'Oshxonada tayyorlanmoqda',
      kitchenSub: (n, p) => [n > 0 && `${n} yangi`, p > 0 && `${p} tayyorlanmoqda`].filter(Boolean).join(' · '),
      readyTitle: 'Barcha taomlar tayyor!',
      readySub: 'Mijozga yetkazilganini tasdiqlang',
      confirmBtn: 'Yetkazildi ✓',
      deliveredTitle: 'Yetkazildi',
      deliveredSub: 'Hisob so\'rash mumkin',
      billBtn: 'Hisob so\'rash',
      needsBillTitle: 'Hisob so\'raldi',
      needsBillSub: 'Kassir to\'lovni qayta ishlaydi',
    },
    ru: {
      kitchenTitle: 'Готовится на кухне',
      kitchenSub: (n, p) => [n > 0 && `${n} новых`, p > 0 && `${p} готовится`].filter(Boolean).join(' · '),
      readyTitle: 'Все блюда готовы!',
      readySub: 'Подтвердите, что заказ подан гостю',
      confirmBtn: 'Подано ✓',
      deliveredTitle: 'Подано',
      deliveredSub: 'Можно запросить счёт',
      billBtn: 'Запросить счёт',
      needsBillTitle: 'Счёт запрошен',
      needsBillSub: 'Кассир обрабатывает оплату',
    },
    en: {
      kitchenTitle: 'Kitchen is preparing',
      kitchenSub: (n, p) => [n > 0 && `${n} new`, p > 0 && `${p} preparing`].filter(Boolean).join(' · '),
      readyTitle: 'All items ready!',
      readySub: 'Confirm the order has been served to the guest',
      confirmBtn: 'Mark as Served ✓',
      deliveredTitle: 'Order Served',
      deliveredSub: 'You can now request the bill',
      billBtn: 'Request Bill',
      needsBillTitle: 'Bill Requested',
      needsBillSub: 'Cashier is processing payment',
    },
  }
  const l = L[lang] || L.en

  function handleConfirmDelivery() {
    if (busy) return
    setBusy(true)
    dispatch({ type: 'CONFIRM_ORDER_DELIVERED', payload: tableId })
    setTimeout(() => setBusy(false), 700)
  }
  function handleRequestBill() {
    if (busy) return
    setBusy(true)
    dispatch({ type: 'MARK_TABLE_NEEDS_BILL', payload: tableId })
    setTimeout(() => setBusy(false), 700)
  }

  if (inKitchen) {
    return (
      <div className="mx-4 mb-3 rounded-2xl border border-orange-100 bg-[#fff7ed] px-4 py-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0">
          <ChefHat size={16} className="text-[#ff5a00]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold text-[#ff5a00]">{l.kitchenTitle}</p>
          <p className="text-[11px] text-[#9CA3AF] mt-0.5">{l.kitchenSub(newCount, prepCount)}</p>
        </div>
        {readyCount > 0 && (
          <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded-full flex-shrink-0">
            {readyCount} {lang === 'uz' ? 'tayyor' : lang === 'ru' ? 'готово' : 'ready'}
          </span>
        )}
      </div>
    )
  }
  if (allReady && !isDelivered && !isNeedsBill) {
    return (
      <div className="mx-4 mb-3 rounded-2xl border-2 border-green-300 bg-[#f0fdf4] px-4 py-3">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 size={16} className="text-[#16A34A]" />
          </div>
          <div className="flex-1">
            <p className="text-[13px] font-bold text-[#16A34A]">{l.readyTitle}</p>
            <p className="text-[11px] text-[#6B7280] mt-0.5">{l.readySub}</p>
          </div>
        </div>
        <button
          onClick={handleConfirmDelivery}
          disabled={busy}
          className={`w-full py-2.5 rounded-xl font-black text-[13px] flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
            busy ? 'bg-green-200 text-green-500 cursor-not-allowed' : 'bg-[#16A34A] text-white hover:bg-[#15803D] shadow-sm'
          }`}
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
          {l.confirmBtn}
        </button>
      </div>
    )
  }
  if (isDelivered) {
    return (
      <div className="mx-4 mb-3 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
            <Receipt size={16} className="text-blue-600" />
          </div>
          <div className="flex-1">
            <p className="text-[13px] font-bold text-blue-700">{l.deliveredTitle}</p>
            <p className="text-[11px] text-[#6B7280] mt-0.5">{l.deliveredSub}</p>
          </div>
        </div>
        <button
          onClick={handleRequestBill}
          disabled={busy}
          className={`w-full py-2.5 rounded-xl font-black text-[13px] flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
            busy ? 'bg-blue-200 text-blue-400 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'
          }`}
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Receipt size={15} />}
          {l.billBtn}
        </button>
      </div>
    )
  }
  if (isNeedsBill) {
    return (
      <div className="mx-4 mb-3 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
          <Clock size={16} className="text-[#DC2626]" />
        </div>
        <div>
          <p className="text-[13px] font-bold text-[#DC2626]">{l.needsBillTitle}</p>
          <p className="text-[11px] text-[#9CA3AF] mt-0.5">{l.needsBillSub}</p>
        </div>
      </div>
    )
  }
  return null
}

// ── BottomTableChips ───────────────────────────────────────────────────────────
function BottomTableChips({ currentTableId, onNewOrder }) {
  const { state } = useApp()
  const navigate  = useNavigate()

  const chips = useMemo(() => {
    const byTable = {}
    state.orders.forEach(o => {
      if (o.payment_status === 'paid') return
      if (!byTable[o.table_id]) {
        byTable[o.table_id] = {
          table_id:   o.table_id,
          table_name: o.table_name,
          itemCount:  o.items?.length ?? 0,
          status:     o.status,
        }
      } else {
        byTable[o.table_id].itemCount += o.items?.length ?? 0
        // escalate status
        const priority = ['needs_bill', 'preparing', 'sent_to_kitchen', 'delivered']
        const cur = priority.indexOf(byTable[o.table_id].status)
        const nxt = priority.indexOf(o.status)
        if (nxt !== -1 && (cur === -1 || nxt < cur)) byTable[o.table_id].status = o.status
      }
    })
    return Object.values(byTable)
  }, [state.orders])

  if (chips.length === 0) return null

  const STATUS_LABEL = {
    sent_to_kitchen: { en: 'Kitchen', uz: 'Oshxona', ru: 'Кухня',   cls: 'bg-orange-100 text-[#ff5a00]' },
    preparing:       { en: 'Cooking', uz: 'Pishirilmoqda', ru: 'Готовится', cls: 'bg-yellow-100 text-yellow-700' },
    delivered:       { en: 'Served',  uz: 'Yetkazildi', ru: 'Подано', cls: 'bg-green-100 text-green-700' },
    needs_bill:      { en: 'Bill',    uz: 'Hisob', ru: 'Счёт',      cls: 'bg-red-100 text-red-600' },
  }
  const lang = state.lang

  return (
    <div className="flex-shrink-0 bg-white border-t border-[#E5E7EB] px-3 py-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
      <div className="flex items-center gap-2 min-w-max">
        {chips.map((chip, idx) => {
          const isActive = chip.table_id === currentTableId
          const sl = STATUS_LABEL[chip.status]
          return (
            <button
              key={chip.table_id}
              onClick={() => navigate(`/waiter/order/${chip.table_id}`)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-[11px] font-semibold transition-all flex-shrink-0 ${
                isActive
                  ? 'bg-[#fff1e8] border-[#ff5a00]/40 text-[#ff5a00]'
                  : 'bg-gray-50 border-[#E5E7EB] text-[#6B7280] hover:border-orange-200 hover:bg-orange-50/30'
              }`}
            >
              <span className={`w-6 h-6 rounded-lg flex items-center justify-center font-black text-[10px] flex-shrink-0 ${
                isActive ? 'bg-[#ff5a00] text-white' : 'bg-gray-200 text-gray-600'
              }`}>
                T{idx + 1}
              </span>
              <span className="max-w-[72px] truncate font-bold">{chip.table_name}</span>
              <span className="text-[#9CA3AF] font-medium">{chip.itemCount}</span>
              {sl && (
                <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold flex-shrink-0 ${sl.cls}`}>
                  {sl[lang] || sl.en}
                </span>
              )}
            </button>
          )
        })}

        {/* New Order button */}
        <button
          onClick={onNewOrder}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-dashed border-[#ff5a00]/40 text-[#ff5a00] text-[11px] font-bold hover:bg-orange-50 transition-colors flex-shrink-0"
        >
          <Plus size={12} />
          {lang === 'uz' ? 'Yangi buyurtma' : lang === 'ru' ? 'Новый заказ' : 'New Order'}
        </button>
      </div>
    </div>
  )
}

// ── Product section (used inside "All" grouped view) ──────────────────────────
function ProductSection({ cat, items, cartQtyMap, lang, onAdd, onIncrement, onDecrement, onOpenDetail }) {
  return (
    <div>
      <div className="flex items-center gap-2.5 mb-4">
        <h2 className="font-black text-[18px] text-[#1F2937]">{getCategoryName(cat, lang)}</h2>
        <span className="bg-[#F3F4F6] text-[#6B7280] text-[12px] font-bold px-2.5 py-0.5 rounded-full">
          {items.length}
        </span>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
        {items.map(item => (
          <ProductCard
            key={item.id}
            item={item}
            qty={cartQtyMap[item.id] || 0}
            lang={lang}
            onAdd={onAdd}
            onIncrement={onIncrement}
            onDecrement={onDecrement}
            onOpenDetail={onOpenDetail}
          />
        ))}
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function WaiterOrder() {
  const { tableId }         = useParams()
  const navigate            = useNavigate()
  const { state, dispatch } = useApp()
  const lang                = state.lang
  const [search,        setSearch]       = useState('')
  const [activeCategory,setCategory]     = useState('all')
  const [cartOpen,      setCartOpen]     = useState(false)
  const [sidebarOpen,   setSidebarOpen]  = useState(false)
  const [orderType,     setOrderType]    = useState('dine_in')
  const [detailItem,    setDetailItem]   = useState(null)

  const table = state.tables.find(t => t.id === tableId)

  // Merge all active orders for this table
  const activeOrder = useMemo(() => {
    const orders = state.orders.filter(o => o.table_id === tableId && o.payment_status !== 'paid')
    if (orders.length === 0) return null
    const merged = { ...orders[0] }
    merged.items = orders.flatMap(o => o.items || [])
    const priority = ['needs_bill', 'preparing', 'sent_to_kitchen', 'delivered']
    for (const p of priority) {
      if (orders.some(o => o.status === p)) { merged.status = p; break }
    }
    return merged
  }, [state.orders, tableId])

  // Cart lookups
  const cartQtyMap = useMemo(() => {
    const map = {}
    state.cart.forEach(i => { map[i.menu_item_id] = i.quantity })
    return map
  }, [state.cart])

  const cartNotesMap = useMemo(() => {
    const map = {}
    state.cart.forEach(i => { if (i.notes) map[i.menu_item_id] = i.notes })
    return map
  }, [state.cart])

  const cartCount = state.cart.reduce((s, i) => s + i.quantity, 0)

  // Categories
  const sortedCategories = useMemo(() =>
    [...state.categories].sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999)),
    [state.categories]
  )

  const categoryItemCounts = useMemo(() => {
    const counts = { all: 0 }
    state.menuItems.forEach(item => {
      if (!item.available) return
      counts.all = (counts.all || 0) + 1
      counts[item.category_id] = (counts[item.category_id] || 0) + 1
    })
    return counts
  }, [state.menuItems])

  const allCategoryCards = useMemo(() => [
    { id: 'all' },
    ...sortedCategories,
  ], [sortedCategories])

  // Filtered items
  const q = search.trim().toLowerCase()
  const filteredItems = useMemo(() => {
    return state.menuItems
      .filter(item => {
        if (!item.available) return false
        const matchCat    = activeCategory === 'all' || item.category_id === activeCategory
        const matchSearch = !q || [item.name_uz, item.name_ru, item.name_en].some(n => n?.toLowerCase().includes(q))
        return matchCat && matchSearch
      })
      .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999))
  }, [state.menuItems, activeCategory, q])

  // Grouped sections when "All" is selected without a search query
  const sections = useMemo(() => {
    if (activeCategory !== 'all' || q) return null
    return sortedCategories
      .map(cat => ({ cat, items: filteredItems.filter(i => i.category_id === cat.id) }))
      .filter(s => s.items.length > 0)
  }, [activeCategory, q, sortedCategories, filteredItems])

  // Category lookup map (for modal)
  const categoryMap = useMemo(() => {
    const map = {}
    state.categories.forEach(c => { map[c.id] = c })
    return map
  }, [state.categories])

  // ── Cart handlers ──────────────────────────────────────────────────────────

  function handleAdd(item) {
    dispatch({ type: 'ADD_TO_CART', payload: { menu_item_id: item.id, name: getItemName(item, lang), price: item.price } })
  }

  function handleIncrement(item) {
    dispatch({ type: 'ADD_TO_CART', payload: { menu_item_id: item.id, name: getItemName(item, lang), price: item.price } })
  }

  function handleDecrement(item) {
    const qty = (cartQtyMap[item.id] || 0) - 1
    if (qty <= 0) dispatch({ type: 'REMOVE_FROM_CART', payload: item.id })
    else dispatch({ type: 'UPDATE_CART_QTY', payload: { menu_item_id: item.id, qty } })
  }

  // ── Modal handlers ─────────────────────────────────────────────────────────

  function openDetail(item) {
    setDetailItem(item)
  }

  function handleModalConfirm(item, qty, notes) {
    const alreadyInCart = (cartQtyMap[item.id] || 0) > 0
    if (!alreadyInCart) {
      dispatch({ type: 'ADD_TO_CART', payload: { menu_item_id: item.id, name: getItemName(item, lang), price: item.price } })
    }
    dispatch({ type: 'UPDATE_CART_QTY', payload: { menu_item_id: item.id, qty } })
    dispatch({ type: 'UPDATE_CART_NOTES', payload: { menu_item_id: item.id, notes: notes || '' } })
    setDetailItem(null)
  }

  if (!table) {
    return (
      <div className="min-h-screen bg-[#FAF7F0] flex items-center justify-center">
        <div className="text-center">
          <UtensilsCrossed size={40} className="mx-auto mb-3 text-gray-200" />
          <p className="mb-4 text-sm text-gray-400">Table not found</p>
          <button onClick={() => navigate('/waiter/tables')} className="text-[#ff5a00] font-semibold hover:underline text-sm">
            Back
          </button>
        </div>
      </div>
    )
  }

  // ── Shared card props ─────────────────────────────────────────────────────
  const cardProps = {
    cartQtyMap, lang,
    onAdd:        handleAdd,
    onIncrement:  handleIncrement,
    onDecrement:  handleDecrement,
    onOpenDetail: openDetail,
  }

  return (
    <div className="flex overflow-hidden bg-[#FAF7F0]" style={{ height: '100dvh' }}>

      {/* ── Desktop sidebar ──────────────────────────────────────────────── */}
      <div className="hidden lg:block flex-shrink-0 h-full">
        <UnifiedSidebar />
      </div>

      {/* ── Mobile sidebar overlay ───────────────────────────────────────── */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
          <div className="relative z-10 h-full">
            <UnifiedSidebar onClose={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      {/* ── Center column ───────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

        {/* Search bar */}
        <div className="flex-shrink-0 bg-white border-b border-[#E5E7EB] px-4 py-3 flex items-center gap-3 shadow-sm">
          {/* Mobile hamburger */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 -ml-1 rounded-xl hover:bg-gray-100 transition-colors flex-shrink-0"
          >
            <MenuIcon size={20} className="text-[#6B7280]" />
          </button>

          {/* Back to Tables */}
          <button
            onClick={() => navigate('/waiter/tables')}
            className="flex items-center justify-center w-9 h-9 rounded-xl border border-[#E5E7EB] text-[#6B7280] hover:text-[#ff5a00] hover:border-orange-300 hover:bg-orange-50 transition-colors flex-shrink-0"
            title={lang === 'uz' ? 'Stollar' : lang === 'ru' ? 'Столы' : 'Tables'}
          >
            <ArrowLeft size={17} />
          </button>

          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF] pointer-events-none" />
            <input
              type="text"
              placeholder={lang === 'uz' ? 'Menyu qidirish...' : lang === 'ru' ? 'Поиск по меню...' : 'Search menu...'}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-9 py-2.5 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-[14px] text-[#1F2937] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#ff5a00]/20 focus:border-[#ff5a00] focus:bg-white transition-all"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#6B7280]">
                <X size={14} />
              </button>
            )}
          </div>

          {/* Mobile cart FAB */}
          <button
            onClick={() => setCartOpen(true)}
            className="lg:hidden relative flex-shrink-0 bg-[#ff5a00] text-white w-10 h-10 rounded-xl flex items-center justify-center shadow-md"
          >
            <ShoppingCart size={17} />
            {cartCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-[#1F2937] text-white text-[9px] font-black rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                {cartCount}
              </span>
            )}
          </button>
        </div>

        {/* Category row */}
        <div className="flex-shrink-0 bg-white border-b border-[#E5E7EB] px-4 py-3">
          <div className="flex gap-2.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
            {allCategoryCards.map(cat => (
              <CategoryCard
                key={cat.id}
                cat={cat}
                active={activeCategory === cat.id}
                itemCount={categoryItemCounts[cat.id] || 0}
                onClick={() => setCategory(cat.id)}
                lang={lang}
              />
            ))}
          </div>
        </div>

        {/* Product area */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4">
          {filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-[#9CA3AF]">
              <Search size={36} className="mb-3 opacity-20" />
              <p className="text-sm font-semibold">
                {lang === 'uz' ? 'Mahsulot topilmadi' : lang === 'ru' ? 'Ничего не найдено' : 'No items found'}
              </p>
              {search && (
                <button onClick={() => setSearch('')} className="mt-2 text-xs text-[#ff5a00] hover:underline">
                  {lang === 'uz' ? 'Tozalash' : lang === 'ru' ? 'Очистить' : 'Clear search'}
                </button>
              )}
            </div>
          ) : sections ? (
            // Grouped by category when "All" selected, no search
            <div className="space-y-8">
              {sections.map(({ cat, items }) => (
                <ProductSection
                  key={cat.id}
                  cat={cat}
                  items={items}
                  {...cardProps}
                />
              ))}
            </div>
          ) : (
            // Flat grid for specific category or search results
            <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
              {filteredItems.map(item => (
                <ProductCard
                  key={item.id}
                  item={item}
                  qty={cartQtyMap[item.id] || 0}
                  lang={lang}
                  onAdd={handleAdd}
                  onIncrement={handleIncrement}
                  onDecrement={handleDecrement}
                  onOpenDetail={openDetail}
                />
              ))}
            </div>
          )}
        </div>

        {/* Bottom table chips */}
        <BottomTableChips
          currentTableId={tableId}
          onNewOrder={() => navigate('/waiter/tables')}
        />
      </div>

      {/* ── Desktop cart panel ───────────────────────────────────────────── */}
      <div
        className="hidden lg:flex flex-col flex-shrink-0 bg-white border-l border-[#E5E7EB] overflow-hidden"
        style={{ width: '380px', boxShadow: '-4px 0 20px rgba(0,0,0,0.04)' }}
      >
        <div className="flex-shrink-0 pt-3">
          <OrderActionPanel
            order={activeOrder}
            tableId={tableId}
            lang={lang}
            dispatch={dispatch}
            cartCount={cartCount}
          />
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          <CartPanel
            tableName={table.name}
            orderType={orderType}
            onOrderTypeChange={setOrderType}
          />
        </div>
      </div>

      {/* ── Mobile cart bottom sheet ─────────────────────────────────────── */}
      {cartOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setCartOpen(false)} />
          <div className="relative bg-white rounded-t-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mt-3 flex-shrink-0" />
            <div className="flex-shrink-0">
              <OrderActionPanel
                order={activeOrder}
                tableId={tableId}
                lang={lang}
                dispatch={dispatch}
                cartCount={cartCount}
              />
            </div>
            <CartPanel
              tableName={table.name}
              orderType={orderType}
              onOrderTypeChange={setOrderType}
              onClose={() => setCartOpen(false)}
            />
          </div>
        </div>
      )}

      {/* ── Product details modal ────────────────────────────────────────── */}
      {detailItem && (
        <ProductDetailsModal
          item={detailItem}
          category={categoryMap[detailItem.category_id]}
          currentQty={cartQtyMap[detailItem.id] || 0}
          currentNotes={cartNotesMap[detailItem.id] || ''}
          lang={lang}
          onConfirm={handleModalConfirm}
          onClose={() => setDetailItem(null)}
        />
      )}
    </div>
  )
}
