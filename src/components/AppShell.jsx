import React, { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useApp } from '../store/AppContext'
import {
  UtensilsCrossed,
  LayoutDashboard,
  Table2,
  BookOpen,
  ChefHat,
  Receipt,
  Users,
  BarChart2,
  LogOut,
  Menu,
  X,
  Globe,
} from 'lucide-react'

const NAV_ITEMS = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/admin',          roles: ['owner', 'admin'] },
  { label: 'Tables',    icon: Table2,          path: '/waiter/tables',  roles: ['owner', 'admin', 'waiter'] },
  { label: 'Menu',      icon: BookOpen,        path: '/admin/menu',     roles: ['owner', 'admin'] },
  { label: 'Kitchen',   icon: ChefHat,         path: '/kitchen',        roles: ['owner', 'admin', 'kitchen'] },
  { label: 'Cashier',   icon: Receipt,         path: '/cashier/tables', roles: ['owner', 'admin', 'cashier'] },
  { label: 'Team',      icon: Users,           path: '/admin/users',    roles: ['owner', 'admin'] },
  { label: 'Reports',   icon: BarChart2,       path: '/admin/reports',  roles: ['owner', 'admin'] },
]

function SidebarNav({ role, onLinkClick }) {
  const items = NAV_ITEMS.filter(item => item.roles.includes(role))

  return (
    <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
      {items.map(({ label, icon: Icon, path }) => (
        <NavLink
          key={path}
          to={path}
          onClick={onLinkClick}
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
              isActive
                ? 'bg-[#ff5a00]/10 text-[#ff5a00] border-l-2 border-[#ff5a00] pl-[10px]'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`
          }
        >
          <Icon size={18} />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}

function LanguageSwitcherInline() {
  const { state, dispatch } = useApp()
  return (
    <div className="flex gap-1">
      {['uz', 'ru', 'en'].map(l => (
        <button
          key={l}
          onClick={() => dispatch({ type: 'SET_LANG', payload: l })}
          className={`px-2 py-1 rounded-lg text-xs font-bold uppercase transition-colors ${
            state.lang === l
              ? 'bg-[#ff5a00] text-white'
              : 'bg-white/10 text-gray-400 hover:bg-white/20 hover:text-white'
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  )
}

/**
 * @param {{ children: React.ReactNode, title: string }} props
 */
export default function AppShell({ children, title }) {
  const { profile, signOut } = useAuth()
  const { state, dispatch } = useApp()
  const [mobileOpen, setMobileOpen] = useState(false)
  const navigate = useNavigate()

  const role = profile?.role || state.user?.role || 'waiter'
  const displayName = profile?.full_name || state.user?.name || profile?.email || ''

  function handleSignOut() {
    dispatch({ type: 'LOGOUT' })
    signOut()
  }

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10 flex-shrink-0">
        <div className="w-9 h-9 bg-[#ff5a00] rounded-xl flex items-center justify-center flex-shrink-0">
          <UtensilsCrossed size={18} className="text-white" />
        </div>
        <div>
          <p className="font-black text-white text-sm leading-tight">Zar Kebab</p>
          <p className="text-[10px] text-gray-500 capitalize">{role}</p>
        </div>
      </div>

      {/* Nav */}
      <SidebarNav role={role} onLinkClick={() => setMobileOpen(false)} />

      {/* Language */}
      <div className="px-5 pb-4 flex-shrink-0">
        <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-2 font-semibold">Language</p>
        <LanguageSwitcherInline />
      </div>

      {/* User + logout */}
      <div className="px-4 py-4 border-t border-white/10 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-black">
              {(displayName || '?')[0].toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-semibold truncate">{displayName || 'User'}</p>
            <p className="text-gray-500 text-[10px] truncate">{profile?.email || ''}</p>
          </div>
          <button
            onClick={handleSignOut}
            title="Sign out"
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors flex-shrink-0"
          >
            <LogOut size={15} className="text-gray-400" />
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex min-h-screen w-full max-w-full overflow-x-hidden bg-[#faf7f0]">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-60 flex-shrink-0 bg-[#1a1a1a] fixed top-0 left-0 bottom-0 z-30">
        {sidebarContent}
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-64 bg-[#1a1a1a] flex flex-col">
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-col flex-1 lg:ml-60 min-w-0">
        {/* Top header */}
        <header className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between sticky top-0 z-20 shadow-sm flex-shrink-0">
          <div className="flex items-center gap-3">
            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 rounded-xl hover:bg-gray-100 transition-colors"
            >
              <Menu size={20} className="text-gray-600" />
            </button>
            <h1 className="font-black text-gray-900 text-lg leading-tight">{title}</h1>
          </div>
          <div className="flex items-center gap-2">
            {/* Language switcher (header, light variant) */}
            <div className="hidden sm:flex gap-1">
              {['uz', 'ru', 'en'].map(l => (
                <button
                  key={l}
                  onClick={() => dispatch({ type: 'SET_LANG', payload: l })}
                  className={`px-2 py-1 rounded-lg text-xs font-bold uppercase transition-colors ${
                    state.lang === l
                      ? 'bg-[#ff5a00] text-white'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
            <button
              onClick={handleSignOut}
              className="p-2 rounded-xl hover:bg-gray-100 transition-colors"
              title="Sign out"
            >
              <LogOut size={18} className="text-gray-400" />
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 min-w-0 overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  )
}
