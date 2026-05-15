import React from 'react'
import { X, Plus, Minus, Trash2, ShoppingCart } from 'lucide-react'
import { useApp } from '../store/AppContext'
import { t } from '../lib/i18n'
import { formatCurrency } from '../lib/formatCurrency'

export default function CartPanel({ open, onClose }) {
  const { state, dispatch } = useApp()
  const lang = state.lang
  const cart = state.cart
  const subtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0)
  const service = Math.round(subtotal * 0.2)
  const total = subtotal + service

  function handleSend() {
    if (cart.length === 0) return
    dispatch({ type: 'SEND_TO_KITCHEN' })
    onClose && onClose()
  }

  const content = (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
        <h2 className="font-bold text-base text-gray-800 flex items-center gap-2">
          <ShoppingCart size={18} className="text-brand" />
          {t(lang, 'cart')}
          {cart.length > 0 && (
            <span className="bg-brand text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
              {cart.reduce((s, i) => s + i.quantity, 0)}
            </span>
          )}
        </h2>
        {onClose && (
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 transition-colors">
            <X size={18} className="text-gray-400" />
          </button>
        )}
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-400">
            <ShoppingCart size={32} className="mb-2 opacity-30" />
            <p className="text-sm">{t(lang, 'emptyCart')}</p>
          </div>
        ) : (
          cart.map(item => (
            <div key={item.menu_item_id} className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm">
              <div className="flex items-start justify-between mb-2">
                <p className="font-semibold text-sm text-gray-800 flex-1 pr-2 leading-tight">{item.name}</p>
                <button
                  onClick={() => dispatch({ type: 'REMOVE_FROM_CART', payload: item.menu_item_id })}
                  className="p-1 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-400 transition-colors flex-shrink-0"
                >
                  <Trash2 size={13} />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => dispatch({ type: 'UPDATE_CART_QTY', payload: { menu_item_id: item.menu_item_id, qty: item.quantity - 1 } })}
                    className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors"
                  >
                    <Minus size={11} />
                  </button>
                  <span className="font-bold text-sm w-5 text-center">{item.quantity}</span>
                  <button
                    onClick={() => dispatch({ type: 'UPDATE_CART_QTY', payload: { menu_item_id: item.menu_item_id, qty: item.quantity + 1 } })}
                    className="w-7 h-7 rounded-full bg-brand text-white flex items-center justify-center hover:bg-brand-dark transition-colors"
                  >
                    <Plus size={11} />
                  </button>
                </div>
                <span className="text-brand font-bold text-sm">{formatCurrency(item.price * item.quantity)}</span>
              </div>
              <input
                type="text"
                placeholder={t(lang, 'notes')}
                value={item.notes}
                onChange={e => dispatch({ type: 'UPDATE_CART_NOTES', payload: { menu_item_id: item.menu_item_id, notes: e.target.value } })}
                className="mt-2 w-full text-xs border border-gray-100 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand/30 bg-gray-50 placeholder-gray-300"
              />
            </div>
          ))
        )}
      </div>

      {/* Footer totals + send */}
      {cart.length > 0 && (
        <div className="p-4 border-t border-gray-100 space-y-2 flex-shrink-0 bg-white">
          <div className="flex justify-between text-xs text-gray-500">
            <span>{t(lang, 'orderAmount')}</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
          <div className="flex justify-between text-xs text-gray-500">
            <span>{t(lang, 'service')}</span>
            <span>{formatCurrency(service)}</span>
          </div>
          <div className="flex justify-between font-black text-sm text-gray-900 pt-1 border-t border-gray-100">
            <span>{t(lang, 'totalToPay')}</span>
            <span className="text-brand">{formatCurrency(total)}</span>
          </div>
          <button
            onClick={handleSend}
            className="w-full bg-brand text-white rounded-xl py-3 font-bold text-sm hover:bg-brand-dark active:scale-[0.98] transition-all shadow-lg shadow-orange-200 mt-1"
          >
            {t(lang, 'sendToKitchen')}
          </button>
        </div>
      )}
    </div>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden lg:flex flex-col w-80 bg-gray-50 border-l border-gray-200 flex-shrink-0 h-full overflow-hidden">
        {content}
      </div>

      {/* Mobile/tablet bottom sheet */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
          <div className="relative bg-white rounded-t-2xl max-h-[85vh] flex flex-col shadow-2xl">
            <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mt-3 mb-1 flex-shrink-0" />
            {content}
          </div>
        </div>
      )}
    </>
  )
}
