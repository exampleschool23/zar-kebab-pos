import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../store/AppContext'
import { t } from '../lib/i18n'
import LanguageSwitcher from '../components/LanguageSwitcher'
import { UtensilsCrossed } from 'lucide-react'

const roles = [
  { key: 'admin',   icon: '👑', color: 'from-purple-500 to-purple-600', shadow: 'shadow-purple-200' },
  { key: 'waiter',  icon: '🍽️', color: 'from-brand to-orange-500',     shadow: 'shadow-orange-200' },
  { key: 'cashier', icon: '💰', color: 'from-green-500 to-green-600',   shadow: 'shadow-green-200'  },
  { key: 'kitchen', icon: '👨‍🍳', color: 'from-blue-500 to-blue-600',    shadow: 'shadow-blue-200'   },
]

function defaultPath(role) {
  if (role === 'admin') return '/admin'
  if (role === 'waiter') return '/waiter/tables'
  if (role === 'cashier') return '/cashier/tables'
  return '/kitchen'
}

export default function Login() {
  const { state, dispatch } = useApp()
  const navigate = useNavigate()
  const lang = state.lang

  function handleRole(role) {
    dispatch({ type: 'LOGIN', payload: { role, name: t(lang, role) } })
    navigate(defaultPath(role))
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50 flex flex-col items-center justify-center p-4 w-full max-w-full overflow-x-hidden">
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>

      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-24 h-24 bg-brand rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-xl shadow-orange-200 rotate-3">
            <UtensilsCrossed size={40} className="text-white -rotate-3" />
          </div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Zar Kebab</h1>
          <p className="text-gray-400 mt-1 text-sm">Point of Sale System</p>
        </div>

        {/* Role cards */}
        <div className="bg-white rounded-3xl shadow-2xl shadow-orange-100 p-6 border border-orange-100">
          <p className="text-center text-sm text-gray-500 font-medium mb-5">{t(lang, 'selectRole')}</p>
          <div className="grid grid-cols-2 gap-3">
            {roles.map(r => (
              <button
                key={r.key}
                onClick={() => handleRole(r.key)}
                className={`bg-gradient-to-br ${r.color} text-white rounded-2xl p-4 flex flex-col items-center gap-2 font-bold hover:opacity-90 active:scale-95 transition-all shadow-lg ${r.shadow}`}
              >
                <span className="text-3xl">{r.icon}</span>
                <span className="text-sm">{t(lang, r.key)}</span>
              </button>
            ))}
          </div>
        </div>

        <p className="text-center text-xs text-gray-300 mt-6">Zar Kebab POS v1.0</p>
      </div>
    </div>
  )
}
