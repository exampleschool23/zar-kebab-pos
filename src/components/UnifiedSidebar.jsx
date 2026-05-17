import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  UtensilsCrossed, LayoutDashboard, Table2, BookOpen,
  ChefHat, Receipt, Users, BarChart2, Settings, LogOut,
} from 'lucide-react'
import { useApp } from '../store/AppContext'
import { useAuth } from '../contexts/AuthContext'
import { PAGE_ACCESS } from '../lib/permissions'

// ── Nav definition — roles come from PAGE_ACCESS to stay in sync ───────────────
const NAV = [
  {
    key: 'dashboard',
    icon: LayoutDashboard,
    labels: { uz: 'Dashboard', ru: 'Dashboard', en: 'Dashboard' },
    path: '/admin',
    roles: PAGE_ACCESS.dashboard,
  },
  {
    key: 'tables',
    icon: Table2,
    labels: { uz: 'Stollar', ru: 'Столы', en: 'Tables' },
    path: '/waiter/tables',
    roles: PAGE_ACCESS.tables,
  },
  {
    key: 'menu',
    icon: BookOpen,
    labels: { uz: 'Menyu', ru: 'Меню', en: 'Menu' },
    path: '/admin/menu',
    roles: PAGE_ACCESS.menu,
  },
  {
    key: 'kitchen',
    icon: ChefHat,
    labels: { uz: 'Oshxona', ru: 'Кухня', en: 'Kitchen' },
    path: '/kitchen',
    roles: PAGE_ACCESS.kitchen,
  },
  {
    key: 'cashier',
    icon: Receipt,
    labels: { uz: 'Kassir', ru: 'Кассир', en: 'Cashier' },
    path: '/cashier/tables',
    roles: PAGE_ACCESS.cashier,
  },
  {
    key: 'team',
    icon: Users,
    labels: { uz: 'Jamoa', ru: 'Команда', en: 'Team' },
    path: '/admin/users',
    roles: PAGE_ACCESS.team,
  },
  {
    key: 'reports',
    icon: BarChart2,
    labels: { uz: 'Hisobotlar', ru: 'Отчёты', en: 'Reports' },
    path: '/admin/reports',
    roles: PAGE_ACCESS.reports,
  },
  {
    key: 'settings',
    icon: Settings,
    labels: { uz: 'Sozlamalar', ru: 'Настройки', en: 'Settings' },
    path: '/admin/settings',
    roles: PAGE_ACCESS.settings,
  },
]

const ROLE_LABELS = {
  owner:       { uz: 'Egasi',       ru: 'Владелец',      en: 'Owner'        },
  admin:       { uz: 'Admin',       ru: 'Администратор', en: 'Admin'        },
  waiter:      { uz: 'Ofitsiant',   ru: 'Официант',      en: 'Waiter'       },
  cashier:     { uz: 'Kassir',      ru: 'Кассир',        en: 'Cashier'      },
  kitchen:     { uz: 'Oshxona',     ru: 'Кухня',         en: 'Kitchen'      },
  stakeholder: { uz: 'Stakeholder', ru: 'Стейкхолдер',   en: 'Stakeholder'  },
  guest:       { uz: 'Mehmon',      ru: 'Гость',         en: 'Guest'        },
}

// Derive active nav key from current pathname
function activeKey(pathname) {
  if (pathname.startsWith('/waiter/order'))   return 'tables'
  if (pathname.startsWith('/waiter/tables'))  return 'tables'
  if (pathname.startsWith('/kitchen'))        return 'kitchen'
  if (pathname.startsWith('/cashier'))        return 'cashier'
  if (pathname.startsWith('/admin/menu'))     return 'menu'
  if (pathname.startsWith('/admin/users'))    return 'team'
  if (pathname.startsWith('/admin/reports'))   return 'reports'
  if (pathname.startsWith('/admin/tables'))    return 'tables'
  if (pathname.startsWith('/admin/settings'))  return 'settings'
  if (pathname === '/admin' || pathname === '/admin/') return 'dashboard'
  return ''
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function UnifiedSidebar({ onClose }) {
  const navigate   = useNavigate()
  const { pathname } = useLocation()
  const { state, dispatch } = useApp()
  const { profile, signOut } = useAuth()

  const lang    = state.lang
  const role    = (profile?.role || state.user?.role || 'guest').toLowerCase()
  const current = activeKey(pathname)

  const displayName = profile?.full_name || state.user?.name || profile?.email || ''
  const initial     = (displayName || '?')[0].toUpperCase()

  const visibleNav = NAV.filter(item => item.roles.includes(role))

  function handleNav(item) {
    navigate(item.path)
    onClose?.()
  }

  function handleSignOut() {
    dispatch({ type: 'LOGOUT' })
    signOut?.()
  }

  return (
    <aside className="w-[220px] h-full bg-white border-r border-[#E5E7EB] flex flex-col flex-shrink-0 overflow-hidden">

      {/* Brand */}
      <div className="px-4 py-4 border-b border-[#E5E7EB] flex items-center gap-3 flex-shrink-0">
        <div className="w-10 h-10 bg-[#ff5a00] rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm shadow-orange-200">
          <UtensilsCrossed size={18} className="text-white" />
        </div>
        <div className="min-w-0">
          <p className="font-black text-[#1F2937] text-[13px] leading-tight">Zar Kebab</p>
          <p className="text-[10px] text-[#ff5a00] font-semibold capitalize">
            {(ROLE_LABELS[role]?.[lang] || ROLE_LABELS[role]?.en) ?? role}
          </p>
        </div>
        {role === 'stakeholder' && (
          <span className="ml-auto flex-shrink-0 text-[9px] font-black bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-md px-1.5 py-0.5 leading-none uppercase tracking-wide">
            Viewer
          </span>
        )}
      </div>

      {/* Nav — flex-1 so it grows, overflow-y-auto so it scrolls internally if needed */}
      <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto min-h-0">
        {visibleNav.map(item => {
          const Icon   = item.icon
          const active = item.key === current
          return (
            <button
              key={item.key}
              onClick={() => handleNav(item)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] font-semibold transition-all text-left ${
                active
                  ? 'bg-[#fff1e8] text-[#ff5a00]'
                  : 'text-[#6B7280] hover:text-[#1F2937] hover:bg-gray-50'
              }`}
            >
              <Icon size={17} strokeWidth={active ? 2.5 : 2} className="flex-shrink-0" />
              {item.labels[lang] || item.labels.en}
            </button>
          )
        })}
      </nav>

      {/* Language switcher */}
      <div className="px-4 pb-2 flex-shrink-0">
        <p className="text-[10px] text-[#9CA3AF] uppercase tracking-wider mb-1.5 font-semibold">
          {lang === 'uz' ? 'Til' : lang === 'ru' ? 'Язык' : 'Language'}
        </p>
        <div className="flex gap-1">
          {['uz', 'ru', 'en'].map(l => (
            <button
              key={l}
              onClick={() => dispatch({ type: 'SET_LANG', payload: l })}
              className={`flex-1 py-1 rounded-lg text-[10px] font-bold uppercase transition-colors ${
                lang === l
                  ? 'bg-[#ff5a00] text-white'
                  : 'bg-gray-100 text-[#6B7280] hover:bg-gray-200'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* User + logout */}
      <div className="px-4 py-3 border-t border-[#E5E7EB] flex-shrink-0">
        <div className="flex items-center gap-2.5 mb-2 px-1">
          <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
            <span className="text-[#6B7280] text-xs font-black">{initial}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[#1F2937] text-xs font-semibold truncate">{displayName || 'User'}</p>
            <p className="text-[#9CA3AF] text-[10px] truncate">{profile?.email || ''}</p>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] font-semibold text-[#6B7280] hover:text-red-500 hover:bg-red-50 transition-colors text-left"
        >
          <LogOut size={15} className="flex-shrink-0" />
          {lang === 'uz' ? 'Chiqish' : lang === 'ru' ? 'Выйти' : 'Logout'}
        </button>
      </div>
    </aside>
  )
}
