import React, { useMemo } from 'react'
import { X, ShoppingCart, Minus, Plus, Trash2, UtensilsCrossed } from 'lucide-react'
import { useApp } from '../store/AppContext'
import { t, getItemDesc } from '../lib/i18n'
import { formatCurrency } from '../lib/formatCurrency'

// Delivery tab removed — only Dine In and Take Away
const ORDER_TYPES = [
  { key: 'dine_in',  uz: 'Zalda',      ru: 'В зале',  en: 'Dine In'  },
  { key: 'take_away', uz: 'Olib ketish', ru: 'С собой', en: 'Take Away' },
]

function orderTypeLabel(ot, lang) {
  return ot[lang] || ot.en
}

// ── Cart item row ──────────────────────────────────────────────────────────────
function CartItemRow({ item, lang, dispatch, menuItem }) {
  const desc = menuItem ? getItemDesc(menuItem, lang) : null

  function decrement() {
    const qty = item.quantity - 1
    if (qty <= 0) dispatch({ type: 'REMOVE_FROM_CART', payload: item.menu_item_id })
    else dispatch({ type: 'UPDATE_CART_QTY', payload: { menu_item_id: item.menu_item_id, qty } })
  }

  function increment() {
    dispatch({ type: 'UPDATE_CART_QTY', payload: { menu_item_id: item.menu_item_id, qty: item.quantity + 1 } })
  }

  return (
    <div className="flex gap-3 py-4 border-b border-[#F3F4F6] last:border-0">
      {/* Thumbnail */}
      <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 bg-orange-50 border border-[#F3F4F6]">
        {menuItem?.image_url ? (
          <img src={menuItem.image_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <UtensilsCrossed size={16} className="text-orange-300" />
          </div>
        )}
      </div>

      {/* Info + controls */}
      <div className="flex-1 min-w-0">
        {/* Title row */}
        <div className="flex items-start justify-between gap-1 mb-0.5">
          <p className="font-bold text-[14px] text-[#1F2937] leading-snug line-clamp-1 flex-1 min-w-0">
            {item.name}
          </p>
          <button
            onClick={() => dispatch({ type: 'REMOVE_FROM_CART', payload: item.menu_item_id })}
            className="p-1.5 rounded-xl hover:bg-red-50 text-[#D1D5DB] hover:text-red-400 transition-colors flex-shrink-0"
          >
            <Trash2 size={13} />
          </button>
        </div>

        {desc && <p className="text-[12px] text-[#9CA3AF] line-clamp-1 mb-2">{desc}</p>}

        {/* Qty stepper + price */}
        <div className="flex items-center justify-between mt-1">
          <div className="flex items-center gap-2 bg-[#F9FAFB] rounded-xl p-1 border border-[#F3F4F6]">
            <button
              onClick={decrement}
              className="w-9 h-9 rounded-lg bg-white border border-[#E5E7EB] flex items-center justify-center hover:bg-red-50 hover:border-red-200 active:scale-90 transition-all shadow-sm"
            >
              <Minus size={13} className="text-[#6B7280]" />
            </button>
            <span className="font-black text-[17px] text-[#1F2937] min-w-[22px] text-center leading-none">
              {item.quantity}
            </span>
            <button
              onClick={increment}
              className="w-9 h-9 rounded-lg bg-[#ff5a00] flex items-center justify-center hover:bg-[#cc4800] active:scale-90 transition-all shadow-sm"
            >
              <Plus size={13} className="text-white" />
            </button>
          </div>
          <span className="font-black text-[15px] text-[#ff5a00]">
            {formatCurrency(item.price * item.quantity)}
          </span>
        </div>

        {/* Kitchen note */}
        <input
          type="text"
          placeholder={t(lang, 'notes') || (lang === 'uz' ? 'Izoh...' : lang === 'ru' ? 'Заметка...' : 'Notes (optional)')}
          value={item.notes || ''}
          onChange={e => dispatch({ type: 'UPDATE_CART_NOTES', payload: { menu_item_id: item.menu_item_id, notes: e.target.value } })}
          className="mt-2 w-full text-[12px] border border-[#E5E7EB] rounded-xl px-3 py-2 focus:outline-none focus:border-[#ff5a00]/50 focus:ring-1 focus:ring-[#ff5a00]/20 bg-white placeholder-[#9CA3AF] transition-colors"
        />
      </div>
    </div>
  )
}

// ── Cart panel ─────────────────────────────────────────────────────────────────
export default function CartPanel({ tableName, orderType, onOrderTypeChange, onClose }) {
  const { state, dispatch } = useApp()
  const lang    = state.lang
  const cart    = state.cart

  const menuItemMap = useMemo(() => {
    const map = {}
    state.menuItems.forEach(i => { map[i.id] = i })
    return map
  }, [state.menuItems])

  const subtotal  = cart.reduce((s, i) => s + i.price * i.quantity, 0)
  const serviceRate = Math.max(0, Math.min(100, Number(state.settings?.serviceRate) || 20)) / 100
  const service   = Math.round(subtotal * serviceRate)
  const total     = subtotal + service
  const itemCount = cart.reduce((s, i) => s + i.quantity, 0)

  function handleSend() {
    if (cart.length === 0) return
    console.log('Order type', orderType)
    console.log('Send to kitchen payload', { orderType, items: cart })
    dispatch({ type: 'SEND_TO_KITCHEN', payload: { orderType } })
    onClose?.()
  }

  return (
    <div className="flex flex-col h-full w-full">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="px-4 pt-4 pb-3 border-b border-[#F3F4F6] flex-shrink-0">
        <div className="flex items-start justify-between mb-1">
          <div className="flex items-center gap-2 min-w-0">
            {onClose && (
              <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-gray-100 transition-colors flex-shrink-0">
                <X size={16} className="text-[#9CA3AF]" />
              </button>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-black text-[#1F2937] text-[18px] leading-tight">{tableName}</p>
                {orderType && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#E8FFF0] text-green-700 border border-green-100 flex-shrink-0">
                    {ORDER_TYPES.find(o => o.key === orderType)?.[lang] || 'Dine In'}
                  </span>
                )}
              </div>
              <p className="text-[12px] text-[#9CA3AF] mt-0.5">
                {itemCount > 0
                  ? `${itemCount} ${lang === 'uz' ? 'ta mahsulot' : lang === 'ru' ? 'позиций' : 'items'}`
                  : lang === 'uz' ? "Buyurtma yo'q" : lang === 'ru' ? 'Нет позиций' : 'No items yet'}
              </p>
            </div>
          </div>
        </div>

        {/* Order type tabs */}
        <div className="flex gap-1 bg-[#F3F4F6] p-1 rounded-xl mt-3">
          {ORDER_TYPES.map(ot => (
            <button
              key={ot.key}
              onClick={() => onOrderTypeChange?.(ot.key)}
              className={`flex-1 py-1.5 text-[12px] font-bold rounded-lg transition-all ${
                orderType === ot.key
                  ? 'bg-white text-[#1F2937] shadow-sm'
                  : 'text-[#9CA3AF] hover:text-[#6B7280]'
              }`}
            >
              {orderTypeLabel(ot, lang)}
            </button>
          ))}
        </div>
      </div>

      {/* ── Cart items ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto min-h-0 px-4 py-1">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 select-none">
            <div className="w-16 h-16 bg-[#F9FAFB] rounded-2xl flex items-center justify-center mb-3">
              <ShoppingCart size={26} strokeWidth={1.5} className="text-[#D1D5DB]" />
            </div>
            <p className="text-sm font-semibold text-[#9CA3AF]">
              {lang === 'uz' ? "Savat bo'sh" : lang === 'ru' ? 'Корзина пуста' : 'Cart is empty'}
            </p>
            <p className="text-[12px] text-[#D1D5DB] mt-1">
              {lang === 'uz' ? "Menyudan taom qo'shing" : lang === 'ru' ? 'Добавьте блюда из меню' : 'Add items from the menu'}
            </p>
          </div>
        ) : (
          cart.map(item => (
            <CartItemRow
              key={item.menu_item_id}
              item={item}
              lang={lang}
              dispatch={dispatch}
              menuItem={menuItemMap[item.menu_item_id]}
            />
          ))
        )}
      </div>

      {/* ── Summary + Send button ──────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-t border-[#F3F4F6] px-4 pt-4 pb-5">
        {cart.length > 0 && (
          <div className="space-y-2 mb-4">
            <div className="flex justify-between items-center text-[13px]">
              <span className="text-[#9CA3AF] font-medium">
                {lang === 'uz' ? 'Buyurtma summasi' : lang === 'ru' ? 'Сумма заказа' : 'Order amount'}
              </span>
              <span className="text-[#1F2937] font-semibold">{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between items-center text-[13px]">
              <span className="text-[#9CA3AF] font-medium">
                {lang === 'uz' ? 'Xizmat (20%)' : lang === 'ru' ? 'Сервис (20%)' : 'Service (20%)'}
              </span>
              <span className="text-[#1F2937] font-semibold">{formatCurrency(service)}</span>
            </div>
            <div className="flex justify-between items-baseline pt-3 border-t border-dashed border-[#E5E7EB]">
              <span className="font-black text-[14px] text-[#1F2937]">
                {lang === 'uz' ? "To'lovga jami" : lang === 'ru' ? 'Итого к оплате' : 'Total to pay'}
              </span>
              <span className="font-black text-[22px] text-[#ff5a00] leading-none">{formatCurrency(total)}</span>
            </div>
          </div>
        )}

        <button
          onClick={handleSend}
          disabled={cart.length === 0}
          className={`w-full rounded-xl font-black text-[14px] active:scale-[0.98] transition-all flex items-center justify-center gap-2 ${
            cart.length > 0
              ? 'bg-[#ff5a00] text-white hover:bg-[#cc4800] shadow-lg shadow-orange-200'
              : 'bg-[#F3F4F6] text-[#D1D5DB] cursor-not-allowed'
          }`}
          style={{ height: '52px' }}
        >
          <UtensilsCrossed size={17} />
          {lang === 'uz' ? 'Oshxonaga yuborish' : lang === 'ru' ? 'Отправить на кухню' : 'Send to Kitchen'}
        </button>
      </div>
    </div>
  )
}
