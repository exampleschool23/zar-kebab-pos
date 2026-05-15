import React from 'react'
import { useApp } from '../store/AppContext'
import { t } from '../lib/i18n'
import LanguageSwitcher from '../components/LanguageSwitcher'
import { UtensilsCrossed, LogOut, Clock, ChefHat } from 'lucide-react'

function itemStatusStyle(s) {
  if (s === 'new')      return 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
  if (s === 'preparing') return 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
  if (s === 'ready')    return 'bg-green-500/20 text-green-300 border border-green-500/30'
  return 'bg-gray-500/20 text-gray-400'
}

export default function Kitchen() {
  const { state, dispatch } = useApp()
  const lang = state.lang

  const activeOrders = state.orders.filter(o =>
    ['sent_to_kitchen', 'preparing'].includes(o.status)
  )

  function markItem(orderId, menuItemId, status) {
    dispatch({ type: 'UPDATE_ORDER_ITEM_STATUS', payload: { orderId, menuItemId, status } })
  }

  return (
    <div className="min-h-screen bg-gray-900 w-full max-w-full overflow-x-hidden">
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 bg-brand rounded-xl flex items-center justify-center shadow-md shadow-orange-900">
            <ChefHat size={18} className="text-white" />
          </div>
          <div>
            <p className="font-black text-white leading-tight">Zar Kebab</p>
            <p className="text-xs text-gray-400">{t(lang, 'kitchen')}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <button onClick={() => dispatch({ type: 'LOGOUT' })} className="p-2 rounded-xl hover:bg-gray-700 transition-colors">
            <LogOut size={18} className="text-gray-400" />
          </button>
        </div>
      </header>

      <main className="p-4">
        {activeOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-600">
            <UtensilsCrossed size={48} className="mb-3 opacity-20" />
            <p className="text-lg font-medium">{t(lang, 'noOrders')}</p>
            <p className="text-sm opacity-50 mt-1">Waiting for new orders...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeOrders.map(order => (
              <div key={order.id} className="bg-gray-800 rounded-2xl border border-gray-700 overflow-hidden">
                {/* Order header */}
                <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
                  <div>
                    <h3 className="font-black text-white text-lg">{order.table_name}</h3>
                    <p className="text-gray-500 text-xs">{order.waiter_name}</p>
                  </div>
                  <div className="flex items-center gap-1 text-gray-500 text-xs bg-gray-700 px-2 py-1 rounded-lg">
                    <Clock size={11} />
                    {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>

                {/* Items */}
                <div className="p-3 space-y-2">
                  {order.items.map(item => (
                    <div key={item.menu_item_id} className="bg-gray-700/60 rounded-xl p-3">
                      <div className="flex items-start justify-between mb-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-white text-sm">
                            {item.name}
                            <span className="text-brand ml-2 font-black">×{item.quantity}</span>
                          </p>
                          {item.notes && (
                            <p className="text-xs text-yellow-400 mt-0.5 truncate">📝 {item.notes}</p>
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
                            className="flex-1 bg-orange-500 text-white rounded-lg py-2 text-xs font-bold hover:bg-orange-400 transition-colors active:scale-95"
                          >
                            {t(lang, 'markPreparing')}
                          </button>
                        )}
                        {item.status === 'preparing' && (
                          <button
                            onClick={() => markItem(order.id, item.menu_item_id, 'ready')}
                            className="flex-1 bg-green-500 text-white rounded-lg py-2 text-xs font-bold hover:bg-green-400 transition-colors active:scale-95"
                          >
                            {t(lang, 'markReady')} ✓
                          </button>
                        )}
                        {item.status === 'ready' && (
                          <p className="flex-1 text-center text-green-400 text-xs font-bold py-2">
                            ✓ {t(lang, 'ready')}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
