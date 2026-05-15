import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../store/AppContext'
import { t } from '../lib/i18n'
import LanguageSwitcher from '../components/LanguageSwitcher'
import { UtensilsCrossed, LogOut } from 'lucide-react'

function statusColors(status) {
  if (status === 'available') return 'bg-green-50 border-green-200 hover:border-green-400'
  if (status === 'occupied')  return 'bg-orange-50 border-orange-200 hover:border-orange-400'
  if (status === 'needs_bill') return 'bg-red-50 border-red-200 hover:border-red-400'
  return 'bg-gray-50 border-gray-200'
}

function statusDot(status) {
  if (status === 'available')  return 'bg-green-400'
  if (status === 'occupied')   return 'bg-orange-400'
  if (status === 'needs_bill') return 'bg-red-400 animate-pulse'
  return 'bg-gray-400'
}

function statusLabel(status, lang) {
  if (status === 'available')  return t(lang, 'available')
  if (status === 'occupied')   return t(lang, 'occupied')
  if (status === 'needs_bill') return t(lang, 'needsBill')
  return status
}

export default function WaiterTables() {
  const { state, dispatch } = useApp()
  const navigate = useNavigate()
  const lang = state.lang

  function handleTable(table) {
    dispatch({ type: 'SET_TABLE', payload: table.id })
    dispatch({ type: 'CLEAR_CART' })
    navigate(`/waiter/order/${table.id}`)
  }

  return (
    <div className="min-h-screen bg-orange-50 w-full max-w-full overflow-x-hidden">
      <header className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 bg-brand rounded-xl flex items-center justify-center shadow-md shadow-orange-200">
            <UtensilsCrossed size={18} className="text-white" />
          </div>
          <div>
            <p className="font-black text-gray-900 leading-tight">Zar Kebab</p>
            <p className="text-xs text-gray-400">{t(lang, 'waiter')}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <button
            onClick={() => dispatch({ type: 'LOGOUT' })}
            className="p-2 rounded-xl hover:bg-gray-100 transition-colors"
          >
            <LogOut size={18} className="text-gray-400" />
          </button>
        </div>
      </header>

      <main className="p-4 max-w-2xl mx-auto">
        <h2 className="text-xl font-black text-gray-900 mb-4">{t(lang, 'tables')}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {state.tables.map(table => (
            <button
              key={table.id}
              onClick={() => handleTable(table)}
              className={`${statusColors(table.status)} border-2 rounded-2xl p-4 text-left transition-all active:scale-95 hover:shadow-md`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${statusDot(table.status)}`} />
                <span className="font-bold text-base text-gray-900">{table.name}</span>
              </div>
              <p className="text-xs text-gray-500 pl-4">{statusLabel(table.status, lang)}</p>
            </button>
          ))}
        </div>
      </main>
    </div>
  )
}
