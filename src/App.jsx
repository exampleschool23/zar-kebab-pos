import React, { useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'

import { AuthProvider, useAuth } from './contexts/AuthContext'
import { AppProvider, useApp } from './store/AppContext'
import { defaultPath as roleDefaultPath, PAGE_ACCESS } from './lib/permissions'

import Login          from './pages/Login'
import AuthCallback   from './pages/AuthCallback'
import ResetPassword  from './pages/ResetPassword'
import PendingApproval from './pages/PendingApproval'
import WaiterTables   from './pages/WaiterTables'
import WaiterOrder    from './pages/WaiterOrder'
import Kitchen        from './pages/Kitchen'
import CashierTables  from './pages/CashierTables'
import CashierBill    from './pages/CashierBill'
import Receipt, { TableReceipt } from './pages/Receipt'
import AdminDashboard from './pages/AdminDashboard'
import AdminMenu      from './pages/AdminMenu'
import AdminTables    from './pages/AdminTables'
import AdminUsers     from './pages/AdminUsers'
import Reports        from './pages/Reports'
import AdminSettings  from './pages/AdminSettings'

function defaultPath(role) {
  return roleDefaultPath(role)
}

// Syncs the Supabase profile into AppContext so POS pages keep working
function ProfileSync() {
  const { profile } = useAuth()
  const { dispatch } = useApp()
  useEffect(() => {
    if (profile) {
      dispatch({
        type: 'LOGIN',
        payload: { role: profile.role, name: profile.full_name || profile.email },
      })
    } else {
      dispatch({ type: 'LOGOUT' })
    }
  }, [profile, dispatch])
  return null
}

// Full-screen loader
function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#faf9f7]">
      <Loader2 size={32} className="animate-spin text-[#ff5a00]" />
    </div>
  )
}

// Disabled account screen
function DisabledAccount({ signOut }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#faf9f7] p-4">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xl p-10 text-center max-w-sm w-full">
        <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
          <span className="text-2xl">🚫</span>
        </div>
        <h2 className="font-black text-[#141414] text-lg mb-2">Account disabled</h2>
        <p className="text-sm text-gray-500 mb-6">
          Your account has been disabled. Please contact the restaurant owner.
        </p>
        <button
          onClick={signOut}
          className="w-full bg-[#141414] text-white rounded-xl py-3 font-bold text-sm hover:bg-black transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}

// Route guard: requires authentication + optional role check
function ProtectedRoute({ children, roles }) {
  const { session, profile, loading } = useAuth()

  if (loading) return <Spinner />
  if (!session) return <Navigate to="/login" replace />
  if (!profile) return <Spinner />

  if (profile.status === 'disabled') return null // handled by RoleRedirect
  if (profile.status === 'pending')  return <Navigate to="/pending-approval" replace />

  if (roles && !roles.includes(profile.role)) {
    return <Navigate to={defaultPath(profile.role)} replace />
  }

  return children
}

// Decides where to send user after login
function RoleRedirect() {
  const { session, profile, loading, signOut } = useAuth()
  const navigate = useNavigate()
  const [profileTimeout, setProfileTimeout] = React.useState(false)

  useEffect(() => {
    if (loading) return
    if (!session) { navigate('/login', { replace: true }); return }
    if (!profile) return
    if (profile.status === 'disabled') return
    if (profile.status === 'pending') { navigate('/pending-approval', { replace: true }); return }
    navigate(defaultPath(profile.role), { replace: true })
  }, [session, profile, loading, navigate])

  // If session exists but profile never loads, show a retry option
  useEffect(() => {
    if (!session || profile || loading) return
    const t = setTimeout(() => setProfileTimeout(true), 6000)
    return () => clearTimeout(t)
  }, [session, profile, loading])

  if (loading) return <Spinner />
  if (!session) return <Navigate to="/login" replace />
  if (profile?.status === 'disabled') return <DisabledAccount signOut={signOut} />

  if (profileTimeout) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#faf9f7] p-4">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-xl p-8 text-center max-w-sm w-full">
          <div className="text-3xl mb-4">⚠️</div>
          <h2 className="font-black text-[#141414] mb-2">Could not load your profile</h2>
          <p className="text-sm text-gray-500 mb-6">There was a problem connecting to the database.</p>
          <button onClick={signOut}
            className="w-full bg-[#141414] text-white rounded-xl py-3 font-bold text-sm hover:bg-black transition-colors">
            Sign out and try again
          </button>
        </div>
      </div>
    )
  }

  return <Spinner />
}

function AppRoutes() {
  return (
    <>
      <ProfileSync />
      <Routes>
        {/* Public */}
        <Route path="/"              element={<RoleRedirect />} />
        <Route path="/login"         element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/pending-approval" element={<PendingApproval />} />

        {/* Waiter — tables & order flow only; no kitchen or cashier */}
        <Route path="/waiter/tables" element={
          <ProtectedRoute roles={PAGE_ACCESS.tables}><WaiterTables /></ProtectedRoute>
        } />
        <Route path="/waiter/order/:tableId" element={
          <ProtectedRoute roles={PAGE_ACCESS.tables}><WaiterOrder /></ProtectedRoute>
        } />

        {/* Kitchen — kitchen role + admin/owner only */}
        <Route path="/kitchen" element={
          <ProtectedRoute roles={PAGE_ACCESS.kitchen}><Kitchen /></ProtectedRoute>
        } />

        {/* Cashier — cashier + admin/owner; waiters and kitchen are redirected */}
        <Route path="/cashier/tables" element={
          <ProtectedRoute roles={PAGE_ACCESS.cashier}><CashierTables /></ProtectedRoute>
        } />
        <Route path="/cashier/bill/:tableId" element={
          <ProtectedRoute roles={PAGE_ACCESS.cashier}><CashierBill /></ProtectedRoute>
        } />
        <Route path="/receipt/:orderId" element={
          <ProtectedRoute roles={PAGE_ACCESS.cashier}><Receipt /></ProtectedRoute>
        } />
        <Route path="/receipt/table/:tableId" element={
          <ProtectedRoute roles={PAGE_ACCESS.cashier}><TableReceipt /></ProtectedRoute>
        } />

        {/* Dashboard — admin, owner, cashier, stakeholder */}
        <Route path="/admin" element={
          <ProtectedRoute roles={PAGE_ACCESS.dashboard}><AdminDashboard /></ProtectedRoute>
        } />
        <Route path="/admin/menu" element={
          <ProtectedRoute roles={PAGE_ACCESS.menu}><AdminMenu /></ProtectedRoute>
        } />
        <Route path="/admin/tables" element={
          <ProtectedRoute roles={PAGE_ACCESS.menu}><AdminTables /></ProtectedRoute>
        } />
        <Route path="/admin/users" element={
          <ProtectedRoute roles={PAGE_ACCESS.team}><AdminUsers /></ProtectedRoute>
        } />
        <Route path="/admin/reports" element={
          <ProtectedRoute roles={PAGE_ACCESS.reports}><Reports /></ProtectedRoute>
        } />
        <Route path="/admin/settings" element={
          <ProtectedRoute roles={PAGE_ACCESS.settings}><AdminSettings /></ProtectedRoute>
        } />

        {/* Catch-all: redirect based on role */}
        <Route path="*" element={<RoleRedirect />} />
      </Routes>
    </>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <AppRoutes />
      </AppProvider>
    </AuthProvider>
  )
}
