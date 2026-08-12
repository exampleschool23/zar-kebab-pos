import React, { Suspense, lazy, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Loader2, LockKeyhole } from 'lucide-react'

import { AuthProvider, useAuth } from './contexts/AuthContext'
import { AppProvider, useApp } from './store/AppContext'
import { canViewPage, defaultPath as roleDefaultPath } from './lib/permissions'
import { t } from './lib/i18n'
import {
  clearGuestModeSession,
  getGuestModeLockState,
  getGuestModePinLength,
  guestModePinLockSeconds,
  isGuestModeOwnedByCurrentTab,
  readGuestModeSession,
  registerGuestModePinFailure,
  verifyGuestModePin,
  writeGuestModeSession,
} from './lib/guestMode'
import { useGuestModeSession } from './hooks/useGuestModeSession'
import { GuestPinDialog, guestModeCopy } from './components/GuestModeUI'

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
const DailyBazaar = lazy(() => import('./pages/DailyBazaar'))
const AccountingHistory = lazy(() => import('./pages/AccountingHistory'))
const Salaries = lazy(() => import('./pages/Salaries'))
const MonthlyEstimate = lazy(() => import('./pages/MonthlyEstimate'))
const Employees = lazy(() => import('./pages/Employees'))
const EmployeeSalaryHistory = lazy(() => import('./pages/EmployeeSalaryHistory'))
const Reports = lazy(() => import('./pages/Reports'))
const AdminAudit = lazy(() => import('./pages/AdminAudit'))
const AdminSettings = lazy(() => import('./pages/AdminSettings'))

function defaultPath(role) {
  return roleDefaultPath(role)
}

function defaultPathForHost(profile, adminHost = isAdminHost()) {
  const path = defaultPath(profile)
  return adminHost && path === '/menu' ? '/pending-approval' : path
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
        payload: {
          id: profile.id,
          role: profile.role || 'guest',
          name: profile.full_name || profile.email,
          email: profile.email,
        },
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

function ProfileLoadError() {
  const { state } = useApp()
  const { authError, session, refreshAuth, refreshProfile, signOut } = useAuth()
  const lang = state.lang || 'ru'
  const [retrying, setRetrying] = React.useState(false)

  async function handleRetry() {
    setRetrying(true)
    try {
      if (authError || !session) {
        await refreshAuth()
      } else {
        await refreshProfile()
      }
    } finally {
      setRetrying(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#faf9f7] p-4">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xl p-8 text-center max-w-sm w-full">
        <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
          <Loader2 size={26} className="text-amber-500" />
        </div>
        <h2 className="font-black text-[#141414] mb-2">{t(lang, 'profileLoadFailed')}</h2>
        <p className="text-sm text-gray-500 mb-6">{t(lang, 'profileLoadFailedMessage')}</p>
        <div className="flex flex-col gap-3">
          <button
            onClick={handleRetry}
            disabled={retrying}
            className="w-full border-2 border-[#ff5a00] text-[#ff5a00] rounded-xl py-3 font-bold text-sm hover:bg-orange-50 transition-colors disabled:opacity-60"
          >
            {retrying ? t(lang, 'waiting') : t(lang, 'checkStatus')}
          </button>
          <button
            onClick={signOut}
            className="w-full text-gray-400 text-sm font-medium hover:text-gray-600 transition-colors"
          >
            {t(lang, 'signOutAndTryAgain')}
          </button>
        </div>
      </div>
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
  const { session, profile, profileError, authError, loading } = useAuth()
  const location = useLocation()
  const returnTo = `${location.pathname}${location.search}${location.hash}`

  if (loading) return <Spinner />
  if (authError) return <ProfileLoadError />
  if (profileError) return <ProfileLoadError />
  if (!session) return <Navigate to={`/login?returnTo=${encodeURIComponent(returnTo)}`} replace />
  if (!profile) return <Spinner />

  if (profile?.status === 'disabled') return null // handled by RoleRedirect
  if (profile?.status === 'pending')  return <Navigate to="/pending-approval" replace />

  if (page && !canViewPage(profile, page)) {
    return <Navigate to={defaultPathForHost(profile)} replace />
  }

  return children
}

function SignedOutRoute({ children }) {
  const { session, profile, profileError, authError, loading } = useAuth()
  const [searchParams] = useSearchParams()
  const returnTo = sanitizeReturnTo(searchParams.get('returnTo'))

  if (loading) return <Spinner />
  if (authError) return <ProfileLoadError />
  if (profileError) return <ProfileLoadError />
  if (!session) return children
  if (!profile) return <Spinner />
  return <Navigate to={returnTo || defaultPathForHost(profile || 'guest')} replace />
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

function GuestModeRecoveryLock({ guestModeSession }) {
  const { state } = useApp()
  const lang = state.lang || 'en'
  const copy = guestModeCopy(lang)
  const recoveryBody = lang === 'uz'
    ? 'Bu favqulodda qulfni ochish mehmon tanlovini bekor qiladi. Tanlovni saqlash uchun planshet berilgan asl oynaga qayting.'
    : lang === 'ru'
      ? 'Аварийная разблокировка отменит выбор гостя. Чтобы сохранить его, вернитесь в исходную вкладку планшета.'
      : 'Emergency unlock discards the guest selection. Return to the original tablet tab to keep it.'
  const [dialogOpen, setDialogOpen] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const [clock, setClock] = React.useState(() => Date.now())

  useEffect(() => {
    if (!dialogOpen) return undefined
    setClock(Date.now())
    const timer = window.setInterval(() => setClock(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [dialogOpen])

  async function unlock(pin) {
    const latestSession = readGuestModeSession()
    if (!latestSession || guestModePinLockSeconds(latestSession) > 0) return
    setBusy(true)
    setError('')
    try {
      const verified = await verifyGuestModePin(latestSession, pin)
      if (!verified) {
        writeGuestModeSession(registerGuestModePinFailure(latestSession))
        setClock(Date.now())
        setError(copy.wrongPin)
        return
      }
      clearGuestModeSession()
    } catch {
      setError(lang === 'uz'
        ? 'PIN-ni tekshirib bo‘lmadi. Planshet qulflangan holda qoladi.'
        : lang === 'ru'
          ? 'Не удалось проверить PIN. Планшет останется заблокированным.'
          : 'The PIN could not be verified. The tablet will remain locked.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FAF7F0] p-5">
      <div className="w-full max-w-sm rounded-[28px] border border-[#E5E7EB] bg-white p-7 text-center shadow-xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50 text-[#ff5a00]">
          <LockKeyhole size={25} />
        </div>
        <h1 className="mt-5 text-2xl font-black text-[#1F2937]">{copy.unlockTitle}</h1>
        <p className="mt-2 text-sm leading-6 text-[#6B7280]">{recoveryBody}</p>
        <button
          type="button"
          onClick={() => { setError(''); setDialogOpen(true) }}
          className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#1F2937] text-sm font-black text-white hover:bg-black"
        >
          <LockKeyhole size={16} /> {copy.unlockTitle}
        </button>
      </div>
      {dialogOpen && (
        <GuestPinDialog
          mode="unlock"
          lang={lang}
          pinLength={getGuestModePinLength(guestModeSession)}
          busy={busy}
          error={error}
          lockSeconds={guestModePinLockSeconds(guestModeSession, clock)}
          onInput={() => setError('')}
          onCancel={() => { if (!busy) { setDialogOpen(false); setError('') } }}
          onSubmit={unlock}
        />
      )}
    </div>
  )
}

function GuestModeRouteLock({ children }) {
  const { session, profile, loading } = useAuth()
  const location = useLocation()
  const guestModeSession = useGuestModeSession()
  const lockState = getGuestModeLockState(guestModeSession, {
    authenticatedUserId: session?.user?.id,
    profileUserId: profile?.id,
    profileStatus: profile?.status,
    canViewTables: !!profile && canViewPage(profile, 'tables'),
    ownsGuestModeSession: isGuestModeOwnedByCurrentTab(guestModeSession),
  })

  if (!guestModeSession) return children
  if (loading) return <Spinner />
  if (lockState === 'recovery' || lockState === 'signed_out') {
    return <GuestModeRecoveryLock guestModeSession={guestModeSession} />
  }
  if (lockState === 'active' && location.pathname !== guestModeSession.routePath) {
    return <Navigate to={guestModeSession.routePath} replace />
  }

  return children
}

// Decides where to send user after login
function RoleRedirect({ signedOutPath = '/menu' }) {
  const { session, profile, profileError, authError, loading, signOut } = useAuth()
  const navigate = useNavigate()
  const [profileTimeout, setProfileTimeout] = React.useState(false)
  const { state } = useApp()
  const lang = state.lang || 'ru'

  useEffect(() => {
    if (loading) return
    if (authError) return
    if (profileError) return
    if (!session) { navigate(signedOutPath, { replace: true }); return }
    if (!profile) return
    if (profile?.status === 'disabled') return
    if (profile?.status === 'pending') { navigate('/pending-approval', { replace: true }); return }
    navigate(defaultPathForHost(profile), { replace: true })
  }, [session, profile, profileError, authError, loading, navigate])

  // If session exists but profile never loads, show a retry option
  useEffect(() => {
    if (!session || profile || profileError || loading) return
    const t = setTimeout(() => setProfileTimeout(true), 6000)
    return () => clearTimeout(t)
  }, [session, profile, profileError, loading])

  if (loading) return <Spinner />
  if (authError) return <ProfileLoadError />
  if (profileError) return <ProfileLoadError />
  if (!session) return <Navigate to={signedOutPath} replace />
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
      <Route path="/" element={<PublicMenu />} />
      <Route path="/menu" element={<PublicMenu />} />
      <Route path="/menu/item/:itemId" element={<PublicMenu />} />
      <Route path="/premium-menu" element={<PublicMenu premium />} />
      <Route path="/premium-menu/item/:itemId" element={<PublicMenu premium />} />
      <Route path="/catering" element={<CateringPage />} />
      <Route path="/telegram" element={<TelegramMiniApp />} />
      <Route path="/login" element={<PublicHostAdminRedirect />} />
      <Route path="/auth/callback" element={<PublicHostAdminRedirect />} />
      <Route path="/reset-password" element={<PublicHostAdminRedirect />} />
      <Route path="/pending-approval" element={<PublicHostAdminRedirect />} />
      <Route path="/admin" element={<PublicHostAdminRedirect />} />
      <Route path="/admin/*" element={<PublicHostAdminRedirect />} />
      <Route path="/waiter/*" element={<PublicHostAdminRedirect />} />
      <Route path="/cashier/*" element={<PublicHostAdminRedirect />} />
      <Route path="/receipt/*" element={<PublicHostAdminRedirect />} />
      <Route path="/kitchen" element={<PublicHostAdminRedirect />} />
      <Route path="/kitchen-check/*" element={<PublicHostAdminRedirect />} />
      <Route path="*" element={<Navigate to="/menu" replace />} />
    </Routes>
  )
}

function InternalAppRoutes({ adminHost = false }) {
  const signedOutPath = adminHost ? '/admin' : '/menu'

  return (
    <Routes>
        {/* Public */}
        <Route path="/"              element={adminHost ? <Navigate to="/admin" replace /> : <RoleRedirect signedOutPath={signedOutPath} />} />
        <Route path="/menu"          element={adminHost ? <Navigate to="/admin" replace /> : <PublicMenu />} />
        <Route path="/menu/item/:itemId" element={adminHost ? <Navigate to="/admin" replace /> : <PublicMenu />} />
        <Route path="/premium-menu"          element={adminHost ? <Navigate to="/admin" replace /> : <PublicMenu premium />} />
        <Route path="/premium-menu/item/:itemId" element={adminHost ? <Navigate to="/admin" replace /> : <PublicMenu premium />} />
        <Route path="/catering"      element={adminHost ? <Navigate to="/admin" replace /> : <CateringPage />} />
        <Route path="/telegram"      element={adminHost ? <Navigate to="/admin" replace /> : <TelegramMiniApp />} />
        <Route path="/login"         element={<SignedOutRoute><Login /></SignedOutRoute>} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/pending-approval" element={<PendingApproval />} />

        {/* Tables/order flow: visible to profiles with the tables feature. */}
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

        {/* Cashier flow: visible to profiles with the cashier feature. */}
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

        {/* Dashboard: visible to profiles with the dashboard feature. */}
        <Route path="/admin" element={
          <LazyProtectedRoute page="dashboard"><AdminDashboard /></LazyProtectedRoute>
        } />
        <Route path="/admin/menu" element={
          <LazyProtectedRoute page="menu"><AdminMenu /></LazyProtectedRoute>
        } />
        <Route path="/admin/menu/product/:productId" element={
          <LazyProtectedRoute page="menu"><AdminMenu /></LazyProtectedRoute>
        } />
        <Route path="/admin/menu/category/:categoryId" element={
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
        <Route path="/admin/bazaar" element={
          <LazyProtectedRoute page="bazaar"><DailyBazaar /></LazyProtectedRoute>
        } />
        <Route path="/admin/accounting/history" element={
          <LazyProtectedRoute page="expenses"><AccountingHistory /></LazyProtectedRoute>
        } />
        <Route path="/admin/accounting/salaries" element={
          <LazyProtectedRoute page="expenses"><Salaries /></LazyProtectedRoute>
        } />
        <Route path="/admin/accounting/estimate" element={
          <LazyProtectedRoute page="expenses"><MonthlyEstimate /></LazyProtectedRoute>
        } />
        <Route path="/admin/accounting/employees" element={
          <LazyProtectedRoute page="expenses"><Employees /></LazyProtectedRoute>
        } />
        <Route path="/admin/accounting/employees/:employeeId/history" element={
          <LazyProtectedRoute page="expenses"><EmployeeSalaryHistory /></LazyProtectedRoute>
        } />
        <Route path="/admin/expenses" element={<Navigate to="/admin/accounting" replace />} />
        <Route path="/admin/expenses/salaries" element={<Navigate to="/admin/accounting/salaries" replace />} />
        <Route path="/admin/expenses/estimate" element={<Navigate to="/admin/accounting/estimate" replace />} />
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
        <Route path="*" element={<RoleRedirect signedOutPath={signedOutPath} />} />
      </Routes>
  )
}

function AppRoutes() {
  const hostname = currentHostname()
  const publicOnlyHost = isPublicCustomerHost(hostname) && !isAdminHost(hostname)
  const adminHost = isAdminHost(hostname)

  return (
    <>
      <ProfileSync />
      {publicOnlyHost ? (
        <PublicCustomerRoutes />
      ) : (
        <GuestModeRouteLock>
          <InternalAppRoutes adminHost={adminHost} />
        </GuestModeRouteLock>
      )}
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
