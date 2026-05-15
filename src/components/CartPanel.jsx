import React, { useMemo } from 'react'
import { X, ShoppingCart, Minus, Plus, Trash2, UtensilsCrossed } from 'lucide-react'
import { useApp } from '../store/AppContext'
import { t } from '../lib/i18n'
import { formatCurrency } from '../lib/formatCurrency'

const ORDER_TYPES = [
  { key: 'dine_in',  label: 'Dine In' },
  { key: 'takeaway', label: 'Take Away' },
  { key: 'delivery', label: 'Delivery' },
]

function CartItemRow({ item, lang, dispatch, menuItemMap }) {
  const menuItem = menuItemMap[item.menu_item_id]

  return (
    <div className="flex gap-2.5 py-2.5 border-b border-gray-50 last:border-0">
      {/* Thumbnail */}
      <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-orange-50">
        {menuItem?.image_url ? (
          <img src={menuItem.image_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <UtensilsCrossed size={13} className="text-orange-300" />
          </div>
        )}
      </div>

      {/* Info + controls */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-1">
          <p className="font-semibold text-[12px] text-gray-900 leading-snug line-clamp-1 flex-1 min-w-0">
            {item.name}
          </p>
          <button
            onClick={() => dispatch({ type: 'REMOVE_FROM_CART', payload: item.menu_item_id })}
            className="p-0.5 rounded-md hover:bg-red-50 text-gray-300 hover:text-red-400 transition-colors flex-shrink-0"
          >
            <Trash2 size={11} />
          </button>
        </div>

        <div className="flex items-center justify-between mt-1.5">
          {/* Qty stepper */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg px-1 py-0.5">
            <button
              onClick={() => {
                const qty = item.quantity - 1
                if (qty <= 0) dispatch({ type: 'REMOVE_FROM_CART', payload: item.menu_item_id })
                else dispatch({ type: 'UPDATE_CART_QTY', payload: { menu_item_id: item.menu_item_id, qty } })
              }}
              className="w-5 h-5 rounded flex items-center justify-center hover:bg-white transition-colors"
            >
              <Minus size={9} className="text-gray-600" />
            </button>
            <span className="font-black text-[11px] w-4 text-center text-gray-900">{item.quantity}</span>
            <button
              onClick={() => dispatch({ type: 'UPDATE_CART_QTY', payload: { menu_item_id: item.menu_item_id, qty: item.quantity + 1 } })}
              className="w-5 h-5 rounded bg-[#ff5a00] flex items-center justify-center hover:bg-[#cc4800] transition-colors"
            >
              <Plus size={9} className="text-white" />
            </button>
          </div>
          <span className="font-black text-[12px] text-[#ff5a00]">
            {formatCurrency(item.price * item.quantity)}
          </span>
        </div>

        {/* Notes */}
        <input
          type="text"
          placeholder={t(lang, 'notes') || 'Note for kitchen...'}
          value={item.notes || ''}
          onChange={e => dispatch({ type: 'UPDATE_CART_NOTES', payload: { menu_item_id: item.menu_item_id, notes: e.target.value } })}
          className="mt-1.5 w-full text-[10px] border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:border-[#ff5a00]/50 bg-white placeholder-gray-300 transition-colors"
        />
      </div>
    </div>
  )
}

export default function CartPanel({ tableName, orderType, onOrderTypeChange, onClose }) {
  const { state, dispatch } = useApp()
  const lang = state.lang
  const cart = state.cart

  const menuItemMap = useMemo(() => {
    const map = {}
    state.menuItems.forEach(i => { map[i.id] = i })
    return map
  }, [state.menuItems])

  const subtotal  = cart.reduce((s, i) => s + i.price * i.quantity, 0)
  const service   = Math.round(subtotal * 0.2)
  const total     = subtotal + service
  const itemCount = cart.reduce((s, i) => s + i.quantity, 0)

  function handleSend() {
    if (cart.length === 0) return
    dispatch({ type: 'SEND_TO_KITCHEN' })
    onClose?.()
  }

  return (
    <div className="flex flex-col h-full w-full">

      {/* ── Header ── */}
      <div className="px-4 pt-4 pb-3 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="font-black text-gray-900 text-base leading-tight">{tableName}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {itemCount > 0 ? `${itemCount} item${itemCount > 1 ? 's' : ''}` : 'No items yet'}
            </p>
          </div>
          {onClose && (
            <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-gray-100 transition-colors flex-shrink-0">
              <X size={16} className="text-gray-400" />
            </button>
          )}
        </div>

        {/* Order type selector */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
          {ORDER_TYPES.map(ot => (
            <button
              key={ot.key}
              onClick={() => onOrderTypeChange?.(ot.key)}
              className={`flex-1 py-1.5 text-[11px] font-bold rounded-lg transition-all ${
                orderType === ot.key
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {ot.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Cart items ── */}
      <div className="flex-1 overflow-y-auto min-h-0 px-4 py-2">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-300">
            <ShoppingCart size={38} strokeWidth={1.5} className="mb-2 opacity-50" />
            <p className="text-xs font-medium text-gray-400">
              {t(lang, 'emptyCart') || 'Cart is empty'}
            </p>
            <p className="text-[11px] text-gray-300 mt-0.5">Add items from the menu</p>
          </div>
        ) : (
          <div>
            {cart.map(item => (
              <CartItemRow
                key={item.menu_item_id}
                item={item}
                lang={lang}
                dispatch={dispatch}
                menuItemMap={menuItemMap}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Summary + action ── */}
      <div className="flex-shrink-0 border-t border-gray-100 px-4 pt-3 pb-4">
        {cart.length > 0 ? (
          <>
            <div className="space-y-1.5 mb-3">
              <div className="flex justify-between text-[12px] text-gray-500">
                <span>{t(lang, 'orderAmount') || 'Subtotal'}</span>
                <span className="font-medium">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between text-[12px] text-gray-500">
                <span>{t(lang, 'service') || 'Service (20%)'}</span>
                <span className="font-medium">{formatCurrency(service)}</span>
              </div>
              <div className="flex justify-between items-baseline pt-2 border-t border-gray-100">
                <span className="font-black text-sm text-gray-900">
                  {t(lang, 'totalToPay') || 'Total'}
                </span>
                <span className="font-black text-xl text-[#ff5a00]">{formatCurrency(total)}</span>
              </div>
            </div>
            <button
              onClick={handleSend}
              className="w-full bg-[#ff5a00] text-white rounded-xl py-3.5 font-black text-[13px] hover:bg-[#cc4800] active:scale-[0.98] transition-all shadow-lg shadow-orange-200 flex items-center justify-center gap-2"
            >
              <UtensilsCrossed size={15} />
              {t(lang, 'sendToKitchen') || 'Send to Kitchen'}
            </button>
          </>
        ) : (
          <button
            disabled
            className="w-full bg-gray-100 text-gray-400 rounded-xl py-3.5 font-black text-[13px] cursor-not-allowed flex items-center justify-center gap-2"
          >
            <UtensilsCrossed size={15} />
            {t(lang, 'sendToKitchen') || 'Send to Kitchen'}
          </button>
        )}
      </div>
    </div>
  )
}
