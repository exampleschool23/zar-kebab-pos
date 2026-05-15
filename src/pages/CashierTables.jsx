import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../store/AppContext'
import { t } from '../lib/i18n'
import LanguageSwitcher from '../components/LanguageSwitcher'
import { LogOut, Receipt } from 'lucide-react'

function statusColors(s) {
  if (s === 'occupied')   return 'bg-orange-50 border-orange-200 hover:border-orange-400'
  if (s === 'needs_bill') return 'bg-red-50 border-red-200 hover:border-red-400'
  return 'bg-gray-50 border-gray-200'
}

function statusDot(s) {
  if (s === 'occupied')   return 'bg-orange-400'
  if (s === 'needs_bill') return 'bg-red-400 animate-pulse'
  return 'bg-gray-300'
}

export default function CashierTables() {
  const { state, dispatch } = useApp()
  const navigate = useNavigate()
  const lang = state.lang

  const activeTables = state.tables.filter(t => ['occupied', 'needs_bill'].includes(t.status))

  return (
    <div className="min-h-screen bg-orange-50 w-full max-w-full overflow-x-hidden">
      <header className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 bg-brand rounded-xl flex items-center justify-center shadow-md shadow-orange-200">
            <Receipt size={18} className="text-white" />
          </div>
          <div>
            <p className="font-black text-gray-900 leading-tight">Zar Kebab</p>
            <p className="text-xs text-gray-400">{t(lang, 'cashier')}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <button onClick={() => dispatch({ type: 'LOGOUT' })} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
            <LogOut size={18} className="text-gray-400" />
          </button>
        </div>
      </header>

      <main className="p-4 max-w-2xl mx-auto">
        <h2 className="text-xl font-black text-gray-900 mb-4">{t(lang, 'tables')}</h2>

        {activeTables.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <p className="text-5xl mb-3">💳</p>
            <p className="font-medium">{t(lang, 'noOrders')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {activeTables.map(table => (
              <button
                key={table.id}
                onClick={() => navigate(`/cashier/bill/${table.id}`)}
                className={`${statusColors(table.status)} border-2 rounded-2xl p-4 text-left transition-all active:scale-95 hover:shadow-md`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${statusDot(table.status)}`} />
                  <span className="font-bold text-base text-gray-900">{table.name}</span>
                </div>
                <p className="text-xs text-gray-500 pl-4">
                  {table.status === 'needs_bill' ? t(lang, 'needsBill') : t(lang, 'occupied')}
                </p>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
