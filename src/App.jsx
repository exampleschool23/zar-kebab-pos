import React, { Suspense, lazy, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'

import { AuthProvider, useAuth } from './contexts/AuthContext'
import { AppProvider, useApp } from './store/AppContext'
import { canViewPage, defaultPath as roleDefaultPath } from './lib/permissions'
import { t } from './lib/i18n'

import Login          from './pages/Login'
import AuthCallback   from './pages/AuthCallback'
import ResetPassword  from './pages/ResetPassword'
import PublicMenu     from './pages/PublicMenu'
import TelegramMiniApp from './pages/TelegramMiniApp'
import PendingApproval from './pages/PendingApproval'
import CateringPage from './pages/CateringPage'

const ADMIN_HOSTNAME = 'admin.zarkebab.uz'
const PUBLIC_HOSTNAMES = new Set(['zarkebab.uz', 'www.zarkebab.uz'])

const WaiterTables = lazy(() => import('./pages/WaiterTables'))
const WaiterOrder = lazy(() => import('./pages/WaiterOrder'))
const KitchenCheckReceipt = lazy(() => import('./pages/KitchenCheckReceipt'))
const CashierTables = lazy(() => import('./pages/CashierTables'))
const CashierBill = lazy(() => import('./pages/CashierBill'))
const Receipt = lazy(() => import('./pages/Receipt'))
const TableReceipt = lazy(() => import('./pages/Receipt').then(module => ({ default: module.TableReceipt })))
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'))
const AdminMenu = lazy(() => import('./pages/AdminMenu'))
const AdminTables = lazy(() => import('./pages/AdminTables'))
const AdminUsers = lazy(() => import('./pages/AdminUsers'))
const AdminLoyalty = lazy(() => import('./pages/AdminLoyalty'))
const Expenses = lazy(() => import('./pages/Expenses'))
const Salaries = lazy(() => import('./pages/Salaries'))
const Employees = lazy(() => import('./pages/Employees'))
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

function currentHostname() {
  return String(globalThis.location?.hostname || '').toLowerCase()
}

function isPublicCustomerHost(hostname = currentHostname()) {
  return PUBLIC_HOSTNAMES.has(String(hostname || '').toLowerCase())
}

function isAdminHost(hostname = currentHostname()) {
  return String(hostname || '').toLowerCase() === ADMIN_HOSTNAME
}

function adminUrlForLocation(location = globalThis.location) {
  return `https://${ADMIN_HOSTNAME}${location?.pathname || '/'}${location?.search || ''}${location?.hash || ''}`
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
function ProtectedRoute({ children, page }) {
  const { session, profile, loading } = useAuth()
  const location = useLocation()
  const returnTo = `${location.pathname}${location.search}${location.hash}`

  if (loading) return <Spinner />
  if (!session) return <Navigate to={`/login?returnTo=${encodeURIComponent(returnTo)}`} replace />
  if (!profile) return <Spinner />

  if (profile?.status === 'disabled') return null // handled by RoleRedirect
  if (profile?.status === 'pending')  return <Navigate to="/pending-approval" replace />

  if (page && !canViewPage(profile, page)) {
    return <Navigate to={defaultPath(profile)} replace />
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
  return <Navigate to={returnTo || defaultPath(profile || 'guest')} replace />
}

function LazyProtectedRoute({ page, children }) {
  return (
    <ProtectedRoute page={page}>
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
    if (profile?.status === 'disabled') return
    if (profile?.status === 'pending') { navigate('/pending-approval', { replace: true }); return }
    navigate(defaultPath(profile), { replace: true })
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

function PublicHostAdminRedirect() {
  useEffect(() => {
    globalThis.location?.replace?.(adminUrlForLocation(globalThis.location))
  }, [])
  return <Spinner />
}

function PublicCustomerRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/menu" replace />} />
      <Route path="/menu" element={<PublicMenu />} />
      <Route path="/menu/item/:itemId" element={<PublicMenu />} />
      <Route path="/premium-menu" element={<PublicMenu premium />} />
      <Route path="/premium-menu/item/:itemId" element={<PublicMenu premium />} />
      <Route path="/catering" element={<CateringPage />} />
      <Route path="/telegram" element={<TelegramMiniApp />} />
      <Route path="/admin" element={<PublicHostAdminRedirect />} />
      <Route path="/admin/*" element={<PublicHostAdminRedirect />} />
      <Route path="*" element={<Navigate to="/menu" replace />} />
    </Routes>
  )
}

function InternalAppRoutes() {
  return (
    <Routes>
        {/* Public */}
        <Route path="/"              element={<RoleRedirect />} />
        <Route path="/menu"          element={<PublicMenu />} />
        <Route path="/menu/item/:itemId" element={<PublicMenu />} />
        <Route path="/premium-menu"          element={<PublicMenu premium />} />
        <Route path="/premium-menu/item/:itemId" element={<PublicMenu premium />} />
        <Route path="/catering"      element={<CateringPage />} />
        <Route path="/telegram"      element={<TelegramMiniApp />} />
        <Route path="/login"         element={<SignedOutRoute><Login /></SignedOutRoute>} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/pending-approval" element={<PendingApproval />} />

        {/* Waiter — tables & order flow only; no cashier */}
        <Route path="/waiter/tables" element={
          <LazyProtectedRoute page="tables"><WaiterTables /></LazyProtectedRoute>
        } />
        <Route path="/waiter/order/:tableId" element={
          <LazyProtectedRoute page="tables"><WaiterOrder /></LazyProtectedRoute>
        } />
        <Route path="/waiter/take-away" element={
          <LazyProtectedRoute page="tables"><WaiterOrder /></LazyProtectedRoute>
        } />
        <Route path="/kitchen-check/:orderId" element={
          <LazyProtectedRoute page="tables"><KitchenCheckReceipt /></LazyProtectedRoute>
        } />

        <Route path="/kitchen" element={<Navigate to="/admin" replace />} />

        {/* Cashier — cashier + admin/owner; waiters are redirected */}
        <Route path="/cashier/tables" element={
          <LazyProtectedRoute page="cashier"><CashierTables /></LazyProtectedRoute>
        } />
        <Route path="/cashier/bill/:tableId" element={
          <LazyProtectedRoute page="cashier"><CashierBill /></LazyProtectedRoute>
        } />
        <Route path="/cashier/bill/order/:orderId" element={
          <LazyProtectedRoute page="cashier"><CashierBill /></LazyProtectedRoute>
        } />
        <Route path="/receipt/:orderId" element={
          <LazyProtectedRoute page="cashier"><Receipt /></LazyProtectedRoute>
        } />
        <Route path="/receipt/table/:tableId" element={
          <LazyProtectedRoute page="cashier"><TableReceipt /></LazyProtectedRoute>
        } />

        {/* Dashboard — admin, owner, cashier, stakeholder */}
        <Route path="/admin" element={
          <LazyProtectedRoute page="dashboard"><AdminDashboard /></LazyProtectedRoute>
        } />
        <Route path="/admin/menu" element={
          <LazyProtectedRoute page="menu"><AdminMenu /></LazyProtectedRoute>
        } />
        <Route path="/admin/tables" element={
          <LazyProtectedRoute page="settings"><AdminTables /></LazyProtectedRoute>
        } />
        <Route path="/admin/users" element={
          <LazyProtectedRoute page="team"><AdminUsers /></LazyProtectedRoute>
        } />
        <Route path="/admin/loyalty" element={
          <LazyProtectedRoute page="loyalty"><AdminLoyalty /></LazyProtectedRoute>
        } />
        <Route path="/admin/accounting" element={
          <LazyProtectedRoute page="expenses"><Expenses /></LazyProtectedRoute>
        } />
        <Route path="/admin/accounting/salaries" element={
          <LazyProtectedRoute page="expenses"><Salaries /></LazyProtectedRoute>
        } />
        <Route path="/admin/accounting/employees" element={
          <LazyProtectedRoute page="expenses"><Employees /></LazyProtectedRoute>
        } />
        <Route path="/admin/expenses" element={<Navigate to="/admin/accounting" replace />} />
        <Route path="/admin/expenses/salaries" element={<Navigate to="/admin/accounting/salaries" replace />} />
        <Route path="/admin/expenses/employees" element={<Navigate to="/admin/accounting/employees" replace />} />
        <Route path="/admin/discount-cards" element={<Navigate to="/admin/loyalty" replace />} />
        <Route path="/admin/reports" element={
          <LazyProtectedRoute page="reports"><Reports /></LazyProtectedRoute>
        } />
        <Route path="/admin/audit" element={
          <LazyProtectedRoute page="audit"><AdminAudit /></LazyProtectedRoute>
        } />
        <Route path="/admin/settings" element={
          <LazyProtectedRoute page="settings"><AdminSettings /></LazyProtectedRoute>
        } />

        {/* Catch-all: redirect based on role */}
        <Route path="*" element={<RoleRedirect />} />
      </Routes>
  )
}

function AppRoutes() {
  const hostname = currentHostname()
  const publicOnlyHost = isPublicCustomerHost(hostname) && !isAdminHost(hostname)

  return (
    <>
      <ProfileSync />
      {publicOnlyHost ? <PublicCustomerRoutes /> : <InternalAppRoutes />}
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
