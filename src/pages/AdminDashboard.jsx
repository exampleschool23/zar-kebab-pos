import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../store/AppContext'
import { t } from '../lib/i18n'
import { formatCurrency } from '../lib/formatCurrency'
import LanguageSwitcher from '../components/LanguageSwitcher'
import { UtensilsCrossed, LogOut, BookOpen, Table2, BarChart2, ChefHat } from 'lucide-react'

export default function AdminDashboard() {
  const { state, dispatch } = useApp()
  const navigate = useNavigate()
  const lang = state.lang

  const activeOrders = state.orders.filter(o => !['paid', 'cancelled'].includes(o.status)).length
  const todayRevenue = state.orders
    .filter(o => o.payment_status === 'paid')
    .reduce((s, o) => s + o.total, 0) || 1456000

  const stats = [
    { label: t(lang, 'totalTables'),  value: state.tables.length,    icon: '🪑', from: 'from-blue-400',   to: 'to-blue-500',   shadow: 'shadow-blue-200'   },
    { label: t(lang, 'activeOrders'), value: activeOrders,            icon: '📋', from: 'from-brand',      to: 'to-orange-500', shadow: 'shadow-orange-200' },
    { label: t(lang, 'todayRevenue'), value: formatCurrency(todayRevenue), icon: '💰', from: 'from-green-400', to: 'to-green-500', shadow: 'shadow-green-200' },
    { label: t(lang, 'menuItems'),    value: state.menuItems.length,  icon: '🍖', from: 'from-purple-400', to: 'to-purple-500', shadow: 'shadow-purple-200' },
  ]

  const nav = [
    { label: t(lang, 'menu'),    icon: BookOpen,  path: '/admin/menu'    },
    { label: t(lang, 'tables'),  icon: Table2,    path: '/admin/tables'  },
    { label: t(lang, 'reports'), icon: BarChart2, path: '/admin/reports' },
    { label: t(lang, 'kitchen'), icon: ChefHat,   path: '/kitchen'       },
  ]

  return (
    <div className="min-h-screen bg-orange-50 w-full max-w-full overflow-x-hidden">
      <header className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 bg-brand rounded-xl flex items-center justify-center shadow-md shadow-orange-200">
            <UtensilsCrossed size={18} className="text-white" />
          </div>
          <div>
            <p className="font-black text-gray-900 leading-tight">Zar Kebab</p>
            <p className="text-xs text-gray-400">{t(lang, 'admin')}</p>
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
        <h2 className="text-xl font-black text-gray-900 mb-4">{t(lang, 'dashboard')}</h2>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          {stats.map((s, i) => (
            <div
              key={i}
              className={`bg-gradient-to-br ${s.from} ${s.to} rounded-2xl p-4 text-white shadow-lg ${s.shadow}`}
            >
              <p className="text-2xl mb-1">{s.icon}</p>
              <p className="text-xl font-black leading-tight">{s.value}</p>
              <p className="text-xs opacity-80 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Navigation */}
        <div className="grid grid-cols-2 gap-3">
          {nav.map((item, i) => (
            <button
              key={i}
              onClick={() => navigate(item.path)}
              className="bg-white rounded-2xl border border-gray-100 p-5 flex flex-col items-center gap-2.5 hover:shadow-md hover:border-orange-200 transition-all active:scale-95"
            >
              <item.icon size={28} className="text-brand" />
              <span className="font-bold text-sm text-gray-700">{item.label}</span>
            </button>
          ))}
        </div>
      </main>
    </div>
  )
}
