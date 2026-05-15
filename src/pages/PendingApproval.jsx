import React from 'react'
import { Clock, LogOut, RefreshCw } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

export default function PendingApproval() {
  const { profile, signOut, refreshProfile } = useAuth()
  const [checking, setChecking] = React.useState(false)

  async function handleCheck() {
    setChecking(true)
    await refreshProfile()
    setTimeout(() => setChecking(false), 1000)
  }

  return (
    <div className="min-h-screen bg-[#faf9f7] flex items-center justify-center p-4 w-full max-w-full overflow-x-hidden">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-xl shadow-gray-100 p-10 text-center">

          <div className="w-16 h-16 bg-amber-50 border border-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Clock size={28} className="text-amber-500" />
          </div>

          <h1 className="text-xl font-black text-[#141414] mb-2">
            Waiting for approval
          </h1>
          <p className="text-sm text-gray-500 leading-relaxed mb-2">
            Your account has been created successfully.
          </p>
          <p className="text-sm text-gray-500 leading-relaxed mb-8">
            Please contact the restaurant owner or admin to activate your account and assign your role.
          </p>

          {profile && (
            <div className="bg-gray-50 rounded-xl px-4 py-3 mb-8 text-left border border-gray-100">
              <p className="text-xs text-gray-400 mb-1">Signed in as</p>
              <p className="text-sm font-semibold text-gray-800">{profile.full_name || '—'}</p>
              <p className="text-xs text-gray-400">{profile.email}</p>
            </div>
          )}

          <div className="flex flex-col gap-3">
            <button
              onClick={handleCheck}
              disabled={checking}
              className="w-full flex items-center justify-center gap-2 bg-[#ff5a00] text-white rounded-xl py-3 font-bold text-sm hover:bg-[#cc4800] transition-colors disabled:opacity-60"
            >
              <RefreshCw size={15} className={checking ? 'animate-spin' : ''} />
              Check approval status
            </button>
            <button
              onClick={signOut}
              className="w-full flex items-center justify-center gap-2 border border-gray-200 text-gray-600 rounded-xl py-3 font-semibold text-sm hover:bg-gray-50 transition-colors"
            >
              <LogOut size={15} />
              Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
