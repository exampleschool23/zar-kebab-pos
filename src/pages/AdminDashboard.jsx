import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../store/AppContext'
import { useAuth } from '../contexts/AuthContext'
import { t } from '../lib/i18n'
import { formatCurrency } from '../lib/formatCurrency'
import AppShell from '../components/AppShell'
import {
  BookOpen,
  Table2,
  BarChart2,
  ChefHat,
  Users,
  DollarSign,
  ShoppingBag,
  LayoutGrid,
  UtensilsCrossed,
} from 'lucide-react'

export default function AdminDashboard() {
  const { state } = useApp()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const lang = state.lang

  const activeOrders = state.orders.filter(o => !['paid', 'cancelled'].includes(o.status)).length
  const todayRevenue = state.orders
    .filter(o => o.payment_status === 'paid')
    .reduce((s, o) => s + o.total, 0) || 1456000

  const stats = [
    {
      label: t(lang, 'todayRevenue'),
      value: formatCurrency(todayRevenue),
      icon: DollarSign,
      bg: 'bg-green-50',
      iconColor: 'text-green-600',
      valuColor: 'text-green-700',
    },
    {
      label: t(lang, 'activeOrders'),
      value: activeOrders,
      icon: ShoppingBag,
      bg: 'bg-orange-50',
      iconColor: 'text-[#ff5a00]',
      valuColor: 'text-[#ff5a00]',
    },
    {
      label: t(lang, 'totalTables'),
      value: state.tables.length,
      icon: Table2,
      bg: 'bg-blue-50',
      iconColor: 'text-blue-600',
      valuColor: 'text-blue-700',
    },
    {
      label: t(lang, 'menuItems'),
      value: state.menuItems.length,
      icon: UtensilsCrossed,
      bg: 'bg-purple-50',
      iconColor: 'text-purple-600',
      valuColor: 'text-purple-700',
    },
  ]

  const quickNav = [
    { label: t(lang, 'menu'),    icon: BookOpen,     path: '/admin/menu'    },
    { label: t(lang, 'tables'),  icon: Table2,       path: '/admin/tables'  },
    { label: t(lang, 'kitchen'), icon: ChefHat,      path: '/kitchen'       },
    { label: 'Team',             icon: Users,        path: '/admin/users'   },
    { label: t(lang, 'reports'), icon: BarChart2,    path: '/admin/reports' },
    { label: 'Cashier',          icon: LayoutGrid,   path: '/cashier/tables' },
  ]

  const displayName = profile?.full_name || state.user?.name || 'Admin'

  return (
    <AppShell title={t(lang, 'dashboard')}>
      <div className="p-5 max-w-5xl mx-auto">
        {/* Greeting */}
        <div className="mb-7">
          <h2 className="text-2xl font-black text-gray-900">Good day, {displayName}</h2>
          <p className="text-sm text-gray-400 mt-0.5">Here's what's happening at Zar Kebab</p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {stats.map((s, i) => (
            <div key={i} className={`${s.bg} rounded-2xl p-5 border border-transparent`}>
              <div className={`w-10 h-10 rounded-xl bg-white flex items-center justify-center mb-3 shadow-sm`}>
                <s.icon size={20} className={s.iconColor} />
              </div>
              <p className={`text-2xl font-black ${s.valuColor} leading-tight`}>{s.value}</p>
              <p className="text-xs text-gray-500 mt-1 font-medium">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Quick navigation */}
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Quick Access</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {quickNav.map((item, i) => (
              <button
                key={i}
                onClick={() => navigate(item.path)}
                className="bg-white rounded-2xl border border-gray-100 p-5 flex flex-col items-center gap-3 hover:shadow-md hover:border-orange-200 transition-all active:scale-95 shadow-sm"
              >
                <item.icon size={24} className="text-[#ff5a00]" />
                <span className="font-semibold text-sm text-gray-700 text-center leading-tight">{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  )
}
