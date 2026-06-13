import React, { Suspense, lazy, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'

import { AuthProvider, useAuth } from './contexts/AuthContext'
import { AppProvider, useApp } from './store/AppContext'
import { defaultPath as roleDefaultPath, isPublicOnlyRole, PAGE_ACCESS } from './lib/permissions'
import { t } from './lib/i18n'

import Login          from './pages/Login'
import AuthCallback   from './pages/AuthCallback'
import ResetPassword  from './pages/ResetPassword'
import PublicMenu     from './pages/PublicMenu'
import TelegramMiniApp from './pages/TelegramMiniApp'
import PendingApproval from './pages/PendingApproval'
import CateringPage from './pages/CateringPage'

const WaiterTables = lazy(() => import('./pages/WaiterTables'))
const WaiterOrder = lazy(() => import('./pages/WaiterOrder'))
const CashierTables = lazy(() => import('./pages/CashierTables'))
const CashierBill = lazy(() => import('./pages/CashierBill'))
const Receipt = lazy(() => import('./pages/Receipt'))
const TableReceipt = lazy(() => import('./pages/Receipt').then(module => ({ default: module.TableReceipt })))
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'))
const AdminMenu = lazy(() => import('./pages/AdminMenu'))
const AdminTables = lazy(() => import('./pages/AdminTables'))
const AdminUsers = lazy(() => import('./pages/AdminUsers'))
const AdminLoyalty = lazy(() => import('./pages/AdminLoyalty'))
const Reports = lazy(() => import('./pages/Reports'))
const AdminAudit = lazy(() => import('./pages/AdminAudit'))
const AdminSettings = lazy(() => import('./pages/AdminSettings'))

function defaultPath(role) {
  return roleDefaultPath(role)
}

function sanitizeReturnTo(value) {
  const raw = String(value || '').trim()
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return ''
  if (raw.startsWith('/login') || raw.startsWith('/auth/callback')) return ''
  return raw
}

// Syncs the Supabase profile into AppContext so POS pages keep working
function ProfileSync() {
  const { profile } = useAuth()
  const { dispatch } = useApp()
  useEffect(() => {
    if (profile) {
      dispatch({
        type: 'LOGIN',
        payload: { role: profile.role || 'guest', name: profile.full_name || profile.email },
      })
    } else {
      dispatch({ type: 'LOGIN', payload: { role: 'guest', name: 'Guest' } })
    }
  }, [profile?.id, profile?.role, profile?.full_name, profile?.email, dispatch])
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
  const { state } = useApp()
  const lang = state.lang || 'ru'

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#faf9f7] p-4">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xl p-10 text-center max-w-sm w-full">
        <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
          <span className="text-2xl">🚫</span>
        </div>
        <h2 className="font-black text-[#141414] text-lg mb-2">{t(lang, 'accountDisabled')}</h2>
        <p className="text-sm text-gray-500 mb-6">
          {t(lang, 'accountDisabledMessage')}
        </p>
        <button
          onClick={signOut}
          className="w-full bg-[#141414] text-white rounded-xl py-3 font-bold text-sm hover:bg-black transition-colors"
        >
          {t(lang, 'logout')}
        </button>
      </div>
    </div>
  )
}

// Route guard: requires authentication + optional role check
function ProtectedRoute({ children, roles }) {
  const { session, profile, loading } = useAuth()
  const location = useLocation()
  const returnTo = `${location.pathname}${location.search}${location.hash}`

  if (loading) return <Spinner />
  if (!session) return <Navigate to={`/login?returnTo=${encodeURIComponent(returnTo)}`} replace />
  if (!profile) return <Spinner />

  const role = (profile?.role || 'guest').toLowerCase()

  if (profile?.status === 'disabled') return null // handled by RoleRedirect
  if (profile?.status === 'pending')  return <Navigate to="/pending-approval" replace />

  if (roles && !roles.includes(role)) {
    return <Navigate to={defaultPath(role)} replace />
  }

  return children
}

function PublicMenuRoute({ children }) {
  const { session, profile, loading } = useAuth()

  if (loading) return <Spinner />
  if (!session) return children
  if (!profile) return <Spinner />

  const role = (profile?.role || 'guest').toLowerCase()
  if (profile?.status === 'disabled' || profile?.status === 'pending') {
    return <RoleRedirect />
  }
  if (!isPublicOnlyRole(role)) {
    return <Navigate to={defaultPath(role)} replace />
  }

  return children
}

function SignedOutRoute({ children }) {
  const { session, profile, loading } = useAuth()
  const [searchParams] = useSearchParams()
  const returnTo = sanitizeReturnTo(searchParams.get('returnTo'))

  if (loading) return <Spinner />
  if (!session) return children
  if (!profile) return <Spinner />
  return <Navigate to={returnTo || defaultPath(profile?.role || 'guest')} replace />
}

function LazyProtectedRoute({ roles, children }) {
  return (
    <ProtectedRoute roles={roles}>
      <Suspense fallback={<Spinner />}>
        {children}
      </Suspense>
    </ProtectedRoute>
  )
}

// Decides where to send user after login
function RoleRedirect() {
  const { session, profile, loading, signOut } = useAuth()
  const navigate = useNavigate()
  const [profileTimeout, setProfileTimeout] = React.useState(false)
  const { state } = useApp()
  const lang = state.lang || 'ru'

  useEffect(() => {
    if (loading) return
    if (!session) { navigate('/menu', { replace: true }); return }
    if (!profile) return
    const role = (profile?.role || 'guest').toLowerCase()
    if (profile?.status === 'disabled') return
    if (profile?.status === 'pending') { navigate('/pending-approval', { replace: true }); return }
    navigate(defaultPath(role), { replace: true })
  }, [session, profile, loading, navigate])

  // If session exists but profile never loads, show a retry option
  useEffect(() => {
    if (!session || profile || loading) return
    const t = setTimeout(() => setProfileTimeout(true), 6000)
    return () => clearTimeout(t)
  }, [session, profile, loading])

  if (loading) return <Spinner />
  if (!session) return <Navigate to="/menu" replace />
  if (profile?.status === 'disabled') return <DisabledAccount signOut={signOut} />

  if (profileTimeout) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#faf9f7] p-4">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-xl p-8 text-center max-w-sm w-full">
          <div className="text-3xl mb-4">⚠️</div>
          <h2 className="font-black text-[#141414] mb-2">{t(lang, 'profileLoadFailed')}</h2>
          <p className="text-sm text-gray-500 mb-6">{t(lang, 'profileLoadFailedMessage')}</p>
          <button onClick={signOut}
            className="w-full bg-[#141414] text-white rounded-xl py-3 font-bold text-sm hover:bg-black transition-colors">
            {t(lang, 'signOutAndTryAgain')}
          </button>
        </div>
      </div>
    )
  }

  if (!profile) return <Spinner />

  return <Spinner />
}

function AppRoutes() {
  return (
    <>
      <ProfileSync />
      <Routes>
        {/* Public */}
        <Route path="/"              element={<RoleRedirect />} />
        <Route path="/menu"          element={<PublicMenuRoute><PublicMenu /></PublicMenuRoute>} />
        <Route path="/menu/item/:itemId" element={<PublicMenu />} />
        <Route path="/catering"      element={<CateringPage />} />
        <Route path="/telegram"      element={<TelegramMiniApp />} />
        <Route path="/login"         element={<SignedOutRoute><Login /></SignedOutRoute>} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/pending-approval" element={<PendingApproval />} />

        {/* Waiter — tables & order flow only; no cashier */}
        <Route path="/waiter/tables" element={
          <LazyProtectedRoute roles={PAGE_ACCESS.tables}><WaiterTables /></LazyProtectedRoute>
        } />
        <Route path="/waiter/order/:tableId" element={
          <LazyProtectedRoute roles={PAGE_ACCESS.tables}><WaiterOrder /></LazyProtectedRoute>
        } />
        <Route path="/waiter/take-away" element={
          <LazyProtectedRoute roles={PAGE_ACCESS.tables}><WaiterOrder /></LazyProtectedRoute>
        } />

        <Route path="/kitchen" element={<Navigate to="/admin" replace />} />

        {/* Cashier — cashier + admin/owner; waiters are redirected */}
        <Route path="/cashier/tables" element={
          <LazyProtectedRoute roles={PAGE_ACCESS.cashier}><CashierTables /></LazyProtectedRoute>
        } />
        <Route path="/cashier/bill/:tableId" element={
          <LazyProtectedRoute roles={PAGE_ACCESS.cashier}><CashierBill /></LazyProtectedRoute>
        } />
        <Route path="/cashier/bill/order/:orderId" element={
          <LazyProtectedRoute roles={PAGE_ACCESS.cashier}><CashierBill /></LazyProtectedRoute>
        } />
        <Route path="/receipt/:orderId" element={
          <LazyProtectedRoute roles={PAGE_ACCESS.cashier}><Receipt /></LazyProtectedRoute>
        } />
        <Route path="/receipt/table/:tableId" element={
          <LazyProtectedRoute roles={PAGE_ACCESS.cashier}><TableReceipt /></LazyProtectedRoute>
        } />

        {/* Dashboard — admin, owner, cashier, stakeholder */}
        <Route path="/admin" element={
          <LazyProtectedRoute roles={PAGE_ACCESS.dashboard}><AdminDashboard /></LazyProtectedRoute>
        } />
        <Route path="/admin/menu" element={
          <LazyProtectedRoute roles={PAGE_ACCESS.menu}><AdminMenu /></LazyProtectedRoute>
        } />
        <Route path="/admin/tables" element={
          <LazyProtectedRoute roles={PAGE_ACCESS.menu}><AdminTables /></LazyProtectedRoute>
        } />
        <Route path="/admin/users" element={
          <LazyProtectedRoute roles={PAGE_ACCESS.team}><AdminUsers /></LazyProtectedRoute>
        } />
        <Route path="/admin/loyalty" element={
          <LazyProtectedRoute roles={PAGE_ACCESS.loyalty}><AdminLoyalty /></LazyProtectedRoute>
        } />
        <Route path="/admin/discount-cards" element={<Navigate to="/admin/loyalty" replace />} />
        <Route path="/admin/reports" element={
          <LazyProtectedRoute roles={PAGE_ACCESS.reports}><Reports /></LazyProtectedRoute>
        } />
        <Route path="/admin/audit" element={
          <LazyProtectedRoute roles={PAGE_ACCESS.audit}><AdminAudit /></LazyProtectedRoute>
        } />
        <Route path="/admin/settings" element={
          <LazyProtectedRoute roles={PAGE_ACCESS.settings}><AdminSettings /></LazyProtectedRoute>
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
