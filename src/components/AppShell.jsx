import React, { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useApp } from '../store/AppContext'
import { Menu as MenuIcon } from 'lucide-react'
import UnifiedSidebar from './UnifiedSidebar'

export default function AppShell({ children, title }) {
  const { profile } = useAuth()
  const { state } = useApp()
  const [mobileOpen, setMobileOpen] = useState(false)

  const displayName = profile?.full_name || state.user?.name || profile?.email || ''

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#faf7f0]">

      {/* Desktop sidebar */}
      <div className="hidden lg:block flex-shrink-0 h-full">
        <UnifiedSidebar />
      </div>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <div className="relative z-10 h-full">
            <UnifiedSidebar onClose={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

        {/* Top header — shows page title + mobile hamburger */}
        <header className="flex-shrink-0 bg-white border-b border-[#E5E7EB] px-4 py-3 flex items-center gap-3 shadow-sm">
          <button
            onClick={() => setMobileOpen(true)}
            className="lg:hidden p-2 -ml-1 rounded-xl hover:bg-gray-100 transition-colors flex-shrink-0"
          >
            <MenuIcon size={20} className="text-[#6B7280]" />
          </button>
          <h1 className="font-black text-[#1F2937] text-[15px] leading-tight truncate flex-1">
            {title}
          </h1>
        </header>

        {/* Page content */}
        <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  )
}
