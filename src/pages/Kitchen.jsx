import React from 'react'
import { useApp } from '../store/AppContext'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { t } from '../lib/i18n'
import { UtensilsCrossed, Clock, ChefHat, CheckCircle2, ArrowLeft } from 'lucide-react'

function itemStatusStyle(s) {
  if (s === 'new')       return 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
  if (s === 'preparing') return 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
  if (s === 'ready')     return 'bg-green-500/20 text-green-300 border border-green-500/30'
  return 'bg-gray-500/20 text-gray-400'
}

function elapsedSince(isoString) {
  if (!isoString) return null
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 60000)
  if (diff < 1) return '< 1 min'
  if (diff < 60) return `${diff} min`
  return `${Math.floor(diff / 60)}h ${diff % 60}m`
}

export default function Kitchen() {
  const { state, dispatch } = useApp()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const lang = state.lang
  const isAdmin = profile?.role === 'admin' || profile?.role === 'owner'

  const activeOrders = state.orders.filter(o =>
    ['sent_to_kitchen', 'preparing'].includes(o.status)
  )

  function markItem(orderId, menuItemId, status) {
    dispatch({ type: 'UPDATE_ORDER_ITEM_STATUS', payload: { orderId, menuItemId, status } })
  }

  return (
    <div className="min-h-screen bg-[#111827] w-full max-w-full overflow-x-hidden">
      {/* Dark kitchen header */}
      <header className="bg-[#1f2937] border-b border-gray-700 px-5 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          {isAdmin && (
            <button
              onClick={() => navigate('/admin')}
              className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
            >
              <ArrowLeft size={17} className="text-white" />
            </button>
          )}
          <div className="w-9 h-9 bg-[#ff5a00] rounded-xl flex items-center justify-center shadow-md">
            <ChefHat size={18} className="text-white" />
          </div>
          <div>
            <p className="font-black text-white text-sm leading-tight">Kitchen Display</p>
            <p className="text-xs text-gray-400">Zar Kebab · {activeOrders.length} active</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {['uz', 'ru', 'en'].map(l => (
            <button
              key={l}
              onClick={() => dispatch({ type: 'SET_LANG', payload: l })}
              className={`px-2 py-1 rounded-lg text-xs font-bold uppercase transition-colors ${
                state.lang === l
                  ? 'bg-[#ff5a00] text-white'
                  : 'bg-white/10 text-gray-400 hover:bg-white/20'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </header>

      <main className="p-5">
        {activeOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-gray-600">
            <UtensilsCrossed size={56} className="mb-4 opacity-20" />
            <p className="text-lg font-semibold text-gray-500">{t(lang, 'noOrders')}</p>
            <p className="text-sm text-gray-600 mt-1">Waiting for new orders...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeOrders.map(order => {
              const elapsed = elapsedSince(order.created_at)
              const allReady = order.items.every(i => i.status === 'ready')
              return (
                <div
                  key={order.id}
                  className={`bg-[#1f2937] rounded-2xl border overflow-hidden ${
                    allReady ? 'border-green-500/40' : 'border-gray-700'
                  }`}
                >
                  {/* Order header */}
                  <div className={`px-4 py-3 border-b border-gray-700 flex items-center justify-between ${
                    allReady ? 'bg-green-500/10' : ''
                  }`}>
                    <div>
                      <h3 className="font-black text-white text-lg leading-tight">{order.table_name}</h3>
                      <p className="text-gray-500 text-xs mt-0.5">{order.waiter_name}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {elapsed && (
                        <div className="flex items-center gap-1 text-gray-500 text-xs bg-gray-700 px-2 py-1 rounded-lg">
                          <Clock size={11} />
                          {elapsed}
                        </div>
                      )}
                      {allReady && (
                        <div className="flex items-center gap-1 text-green-400 text-xs font-bold">
                          <CheckCircle2 size={11} />
                          Ready
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Items */}
                  <div className="p-3 space-y-2">
                    {order.items.map(item => (
                      <div key={item.menu_item_id} className="bg-gray-700/50 rounded-xl p-3">
                        <div className="flex items-start justify-between mb-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-white text-sm">
                              {item.name}
                              <span className="text-[#ff5a00] ml-2 font-black">×{item.quantity}</span>
                            </p>
                            {item.notes && (
                              <p className="text-xs text-yellow-400 mt-0.5 truncate">Note: {item.notes}</p>
                            )}
                          </div>
                          <span className={`ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0 ${itemStatusStyle(item.status)}`}>
                            {t(lang, item.status)}
                          </span>
                        </div>

                        <div className="flex gap-2">
                          {item.status === 'new' && (
                            <button
                              onClick={() => markItem(order.id, item.menu_item_id, 'preparing')}
                              className="flex-1 bg-[#ff5a00] text-white rounded-lg py-2 text-xs font-bold hover:bg-[#cc4800] transition-colors active:scale-95"
                            >
                              {t(lang, 'markPreparing')}
                            </button>
                          )}
                          {item.status === 'preparing' && (
                            <button
                              onClick={() => markItem(order.id, item.menu_item_id, 'ready')}
                              className="flex-1 bg-green-500 text-white rounded-lg py-2 text-xs font-bold hover:bg-green-400 transition-colors active:scale-95"
                            >
                              {t(lang, 'markReady')}
                            </button>
                          )}
                          {item.status === 'ready' && (
                            <div className="flex-1 flex items-center justify-center gap-1 text-green-400 text-xs font-bold py-2">
                              <CheckCircle2 size={13} />
                              {t(lang, 'ready')}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
