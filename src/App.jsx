import React, { useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'

import { AuthProvider, useAuth } from './contexts/AuthContext'
import { AppProvider, useApp } from './store/AppContext'

import Login          from './pages/Login'
import AuthCallback   from './pages/AuthCallback'
import PendingApproval from './pages/PendingApproval'
import WaiterTables   from './pages/WaiterTables'
import WaiterOrder    from './pages/WaiterOrder'
import Kitchen        from './pages/Kitchen'
import CashierTables  from './pages/CashierTables'
import CashierBill    from './pages/CashierBill'
import Receipt        from './pages/Receipt'
import AdminDashboard from './pages/AdminDashboard'
import AdminMenu      from './pages/AdminMenu'
import AdminTables    from './pages/AdminTables'
import AdminUsers     from './pages/AdminUsers'
import Reports        from './pages/Reports'

function defaultPath(role) {
  if (role === 'owner' || role === 'admin') return '/admin'
  if (role === 'waiter')  return '/waiter/tables'
  if (role === 'cashier') return '/cashier/tables'
  if (role === 'kitchen') return '/kitchen'
  return '/pending-approval'
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

  useEffect(() => {
    if (loading) return
    if (!session) { navigate('/login', { replace: true }); return }
    if (!profile) return  // still loading profile in background

    if (profile.status === 'disabled') return
    if (profile.status === 'pending')  { navigate('/pending-approval', { replace: true }); return }

    navigate(defaultPath(profile.role), { replace: true })
  }, [session, profile, loading, navigate])

  if (loading) return <Spinner />
  if (!session) return <Navigate to="/login" replace />
  if (profile?.status === 'disabled') return <DisabledAccount signOut={signOut} />

  // Session exists, waiting for profile to load from Supabase
  return <Spinner />
}

function AppRoutes() {
  return (
    <>
      <ProfileSync />
      <Routes>
        {/* Public */}
        <Route path="/login"         element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/pending-approval" element={<PendingApproval />} />

        {/* Waiter */}
        <Route path="/waiter/tables" element={
          <ProtectedRoute roles={['waiter', 'admin', 'owner']}><WaiterTables /></ProtectedRoute>
        } />
        <Route path="/waiter/order/:tableId" element={
          <ProtectedRoute roles={['waiter', 'admin', 'owner']}><WaiterOrder /></ProtectedRoute>
        } />

        {/* Kitchen */}
        <Route path="/kitchen" element={
          <ProtectedRoute roles={['kitchen', 'admin', 'owner']}><Kitchen /></ProtectedRoute>
        } />

        {/* Cashier */}
        <Route path="/cashier/tables" element={
          <ProtectedRoute roles={['cashier', 'admin', 'owner']}><CashierTables /></ProtectedRoute>
        } />
        <Route path="/cashier/bill/:tableId" element={
          <ProtectedRoute roles={['cashier', 'admin', 'owner']}><CashierBill /></ProtectedRoute>
        } />
        <Route path="/receipt/:orderId" element={
          <ProtectedRoute roles={['cashier', 'admin', 'owner']}><Receipt /></ProtectedRoute>
        } />

        {/* Admin */}
        <Route path="/admin" element={
          <ProtectedRoute roles={['admin', 'owner']}><AdminDashboard /></ProtectedRoute>
        } />
        <Route path="/admin/menu" element={
          <ProtectedRoute roles={['admin', 'owner']}><AdminMenu /></ProtectedRoute>
        } />
        <Route path="/admin/tables" element={
          <ProtectedRoute roles={['admin', 'owner']}><AdminTables /></ProtectedRoute>
        } />
        <Route path="/admin/users" element={
          <ProtectedRoute roles={['admin', 'owner']}><AdminUsers /></ProtectedRoute>
        } />
        <Route path="/admin/reports" element={
          <ProtectedRoute roles={['admin', 'owner']}><Reports /></ProtectedRoute>
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
