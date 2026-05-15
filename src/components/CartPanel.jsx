import React from 'react'
import { X, Plus, Minus, Trash2, ShoppingCart, UtensilsCrossed } from 'lucide-react'
import { useApp } from '../store/AppContext'
import { t } from '../lib/i18n'
import { formatCurrency } from '../lib/formatCurrency'

export default function CartPanel({ tableName, open, onClose }) {
  const { state, dispatch } = useApp()
  const lang     = state.lang
  const cart     = state.cart
  const subtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0)
  const service  = Math.round(subtotal * 0.2)
  const total    = subtotal + service
  const itemCount = cart.reduce((s, i) => s + i.quantity, 0)

  function handleSend() {
    if (cart.length === 0) return
    dispatch({ type: 'SEND_TO_KITCHEN' })
    onClose?.()
  }

  const content = (
    <div className="flex flex-col h-full bg-white">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-black text-gray-900 text-base">
              {t(lang, 'cart') || 'Order'}
            </h2>
            {itemCount > 0 && (
              <span className="bg-[#ff5a00] text-white text-[10px] font-black rounded-full px-2 py-0.5 leading-none">
                {itemCount}
              </span>
            )}
          </div>
          {tableName && (
            <p className="text-xs text-gray-400 mt-0.5 font-medium">{tableName}</p>
          )}
        </div>
        {onClose && (
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-gray-100 transition-colors">
            <X size={17} className="text-gray-400" />
          </button>
        )}
      </div>

      {/* ── Items list ──────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto min-h-0 px-4 py-3 space-y-2">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-300">
            <ShoppingCart size={40} className="mb-3 opacity-40" strokeWidth={1.5} />
            <p className="text-sm font-medium text-gray-400">{t(lang, 'emptyCart') || 'Cart is empty'}</p>
            <p className="text-xs text-gray-300 mt-1">Add items from the menu</p>
          </div>
        ) : (
          cart.map(item => (
            <div key={item.menu_item_id} className="bg-gray-50 rounded-xl border border-gray-100 p-3">

              {/* Item name + remove */}
              <div className="flex items-start justify-between mb-2.5">
                <p className="font-semibold text-[13px] text-gray-800 flex-1 pr-2 leading-snug">{item.name}</p>
                <button
                  onClick={() => dispatch({ type: 'REMOVE_FROM_CART', payload: item.menu_item_id })}
                  className="p-1 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-400 transition-colors flex-shrink-0 -mt-0.5"
                >
                  <Trash2 size={13} />
                </button>
              </div>

              {/* Qty controls + line total */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-xl px-1.5 py-1">
                  <button
                    onClick={() => {
                      const qty = item.quantity - 1
                      if (qty <= 0) dispatch({ type: 'REMOVE_FROM_CART', payload: item.menu_item_id })
                      else dispatch({ type: 'UPDATE_CART_QTY', payload: { menu_item_id: item.menu_item_id, qty } })
                    }}
                    className="w-6 h-6 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 active:scale-90 transition-all"
                  >
                    <Minus size={12} />
                  </button>
                  <span className="font-black text-sm w-6 text-center text-gray-900">{item.quantity}</span>
                  <button
                    onClick={() => dispatch({ type: 'UPDATE_CART_QTY', payload: { menu_item_id: item.menu_item_id, qty: item.quantity + 1 } })}
                    className="w-6 h-6 rounded-lg bg-[#ff5a00] text-white flex items-center justify-center hover:bg-[#cc4800] active:scale-90 transition-all"
                  >
                    <Plus size={12} />
                  </button>
                </div>
                <span className="font-black text-sm text-[#ff5a00]">{formatCurrency(item.price * item.quantity)}</span>
              </div>

              {/* Notes */}
              <input
                type="text"
                placeholder={t(lang, 'notes') || 'Note for kitchen...'}
                value={item.notes || ''}
                onChange={e => dispatch({ type: 'UPDATE_CART_NOTES', payload: { menu_item_id: item.menu_item_id, notes: e.target.value } })}
                className="mt-2.5 w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#ff5a00]/30 focus:border-[#ff5a00] bg-white placeholder-gray-300 transition-all"
              />
            </div>
          ))
        )}
      </div>

      {/* ── Footer: totals + send button ────────────────────────────────────── */}
      <div className="flex-shrink-0 border-t border-gray-100 bg-white">
        {cart.length > 0 ? (
          <div className="px-5 pt-4 pb-5 space-y-2.5">
            <div className="flex justify-between text-xs text-gray-500">
              <span>{t(lang, 'orderAmount') || 'Subtotal'}</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between text-xs text-gray-500">
              <span>{t(lang, 'service') || 'Service (20%)'}</span>
              <span>{formatCurrency(service)}</span>
            </div>
            <div className="flex justify-between items-center pt-2.5 border-t border-gray-100">
              <span className="font-black text-sm text-gray-900">{t(lang, 'totalToPay') || 'Total'}</span>
              <span className="font-black text-xl text-[#ff5a00]">{formatCurrency(total)}</span>
            </div>
            <button
              onClick={handleSend}
              className="w-full bg-[#ff5a00] text-white rounded-xl py-3.5 font-black text-sm hover:bg-[#cc4800] active:scale-[0.98] transition-all shadow-lg shadow-orange-200 flex items-center justify-center gap-2 mt-1"
            >
              <UtensilsCrossed size={16} />
              {t(lang, 'sendToKitchen') || 'Send to Kitchen'}
            </button>
          </div>
        ) : (
          <div className="px-5 py-4">
            <button
              disabled
              className="w-full bg-gray-100 text-gray-400 rounded-xl py-3.5 font-black text-sm cursor-not-allowed flex items-center justify-center gap-2"
            >
              <UtensilsCrossed size={16} />
              {t(lang, 'sendToKitchen') || 'Send to Kitchen'}
            </button>
          </div>
        )}
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop/tablet sidebar — 400px wide, full height, left border */}
      <div className="hidden lg:flex flex-col w-[400px] flex-shrink-0 h-full overflow-hidden border-l border-gray-200 shadow-[-4px_0_16px_rgba(0,0,0,0.04)]">
        {content}
      </div>

      {/* Mobile bottom sheet */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
          <div className="relative bg-white rounded-t-3xl max-h-[88vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mt-3 mb-0 flex-shrink-0" />
            {content}
          </div>
        </div>
      )}
    </>
  )
}
