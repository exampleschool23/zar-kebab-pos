import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Clock, LogOut, RefreshCw, UtensilsCrossed } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useApp } from '../store/AppContext'
import { t } from '../lib/i18n'
import { defaultPath } from '../lib/permissions'

export default function PendingApproval() {
  const { profile, profileError, signOut, refreshProfile } = useAuth()
  const { state } = useApp()
  const navigate = useNavigate()
  const lang = state.lang || 'ru'
  const [checking, setChecking] = React.useState(false)

  function approvedTarget(nextProfile) {
    if (nextProfile?.status !== 'active') return ''
    const path = defaultPath(nextProfile)
    return path === '/menu' ? '' : path
  }

  React.useEffect(() => {
    const path = approvedTarget(profile)
    if (path) navigate(path, { replace: true })
  }, [profile, navigate])

  async function handleCheck() {
    setChecking(true)
    const nextProfile = await refreshProfile()
    const path = approvedTarget(nextProfile)
    if (path) {
      navigate(path, { replace: true })
      return
    }
    setTimeout(() => setChecking(false), 1000)
  }

  if (profileError) {
    return (
      <div className="min-h-screen bg-[#faf7f0] flex items-center justify-center p-4 w-full max-w-full overflow-x-hidden">
        <div className="w-full max-w-sm">
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="w-10 h-10 bg-[#ff5a00] rounded-xl flex items-center justify-center">
              <UtensilsCrossed size={20} className="text-white" />
            </div>
            <span className="text-xl font-black text-gray-900 tracking-tight">Zar Kebab</span>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
            <div className="w-16 h-16 bg-amber-50 border border-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <RefreshCw size={28} className="text-amber-500" />
            </div>
            <h1 className="text-xl font-black text-gray-900 mb-2">{t(lang, 'profileLoadFailed')}</h1>
            <p className="text-sm text-gray-500 leading-relaxed mb-6">{t(lang, 'profileLoadFailedMessage')}</p>
            <div className="flex flex-col gap-3">
              <button
                onClick={handleCheck}
                disabled={checking}
                className="w-full flex items-center justify-center gap-2 border-2 border-[#ff5a00] text-[#ff5a00] rounded-xl py-3 font-bold text-sm hover:bg-orange-50 transition-colors disabled:opacity-60"
              >
                <RefreshCw size={15} className={checking ? 'animate-spin' : ''} />
                {t(lang, 'checkStatus')}
              </button>
              <button
                onClick={signOut}
                className="w-full flex items-center justify-center gap-2 text-gray-400 text-sm font-medium hover:text-gray-600 transition-colors"
              >
                <LogOut size={14} />
                {t(lang, 'logout')}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#faf7f0] flex items-center justify-center p-4 w-full max-w-full overflow-x-hidden">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 bg-[#ff5a00] rounded-xl flex items-center justify-center">
            <UtensilsCrossed size={20} className="text-white" />
          </div>
          <span className="text-xl font-black text-gray-900 tracking-tight">Zar Kebab</span>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
          {/* Icon */}
          <div className="w-16 h-16 bg-amber-50 border border-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <Clock size={28} className="text-amber-500" />
          </div>

          <h1 className="text-xl font-black text-gray-900 mb-2">{t(lang, 'awaitingApproval')}</h1>
          <p className="text-sm text-gray-500 leading-relaxed mb-2">
            {t(lang, 'awaitingApprovalCreated')}
          </p>
          <p className="text-sm text-gray-500 leading-relaxed mb-6">
            {t(lang, 'awaitingApprovalMessage')}
          </p>

          {profile && (
            <div className="bg-gray-50 rounded-xl px-4 py-3 mb-6 text-left border border-gray-100">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold mb-1">{t(lang, 'signedInAs')}</p>
              <p className="text-sm font-semibold text-gray-900">{profile.full_name || '—'}</p>
              <p className="text-xs text-gray-400">{profile.email}</p>
            </div>
          )}

          <div className="flex flex-col gap-3">
            <button
              onClick={handleCheck}
              disabled={checking}
              className="w-full flex items-center justify-center gap-2 border-2 border-[#ff5a00] text-[#ff5a00] rounded-xl py-3 font-bold text-sm hover:bg-orange-50 transition-colors disabled:opacity-60"
            >
              <RefreshCw size={15} className={checking ? 'animate-spin' : ''} />
              {t(lang, 'checkStatus')}
            </button>
            <button
              onClick={signOut}
              className="w-full flex items-center justify-center gap-2 text-gray-400 text-sm font-medium hover:text-gray-600 transition-colors"
            >
              <LogOut size={14} />
              {t(lang, 'logout')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
