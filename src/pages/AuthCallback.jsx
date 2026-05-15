import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Loader2 } from 'lucide-react'

export default function AuthCallback() {
  const navigate = useNavigate()
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    const url = new URL(window.location.href)
    const oauthError = url.searchParams.get('error')
    const oauthErrorDesc = url.searchParams.get('error_description')
    const code = url.searchParams.get('code')

    if (oauthError) {
      setErrorMsg(oauthErrorDesc || oauthError)
      setTimeout(() => navigate('/login', { replace: true }), 4000)
      return
    }

    if (code) {
      // PKCE flow: exchange the code Google sent back for a real session
      supabase.auth.exchangeCodeForSession(window.location.href).then(({ data, error }) => {
        if (error || !data.session) {
          setErrorMsg(error?.message || 'Sign-in failed. Please try again.')
          setTimeout(() => navigate('/login', { replace: true }), 3000)
        } else {
          navigate('/', { replace: true })
        }
      })
    } else {
      // No code in URL — check if session already exists
      supabase.auth.getSession().then(({ data: { session } }) => {
        navigate(session ? '/' : '/login', { replace: true })
      })
    }
  }, [navigate])

  if (errorMsg) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#faf9f7] p-4">
        <div className="bg-white rounded-2xl border border-red-100 shadow-xl p-8 text-center max-w-sm w-full">
          <div className="text-3xl mb-3">⚠️</div>
          <h2 className="font-black text-[#141414] mb-2">Sign-in failed</h2>
          <p className="text-sm text-red-500 mb-1">{errorMsg}</p>
          <p className="text-xs text-gray-400">Redirecting to login...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#faf9f7]">
      <div className="text-center">
        <Loader2 size={32} className="animate-spin text-[#ff5a00] mx-auto mb-3" />
        <p className="text-sm text-gray-500">Signing you in...</p>
      </div>
    </div>
  )
}
