import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Loader2 } from 'lucide-react'

export default function AuthCallback() {
  const navigate = useNavigate()
  const [errorMsg, setErrorMsg] = useState('')
  const [debugLog, setDebugLog] = useState([])

  function log(msg) {
    console.log('[AuthCallback]', msg)
    setDebugLog(prev => [...prev, msg])
  }

  useEffect(() => {
    const url = new URL(window.location.href)
    const oauthError   = url.searchParams.get('error')
    const oauthErrDesc = url.searchParams.get('error_description')
    const code         = url.searchParams.get('code')

    log(`URL params — code: ${!!code}, error: ${oauthError || 'none'}`)

    if (oauthError) {
      const msg = oauthErrDesc || oauthError
      log(`OAuth error: ${msg}`)
      setErrorMsg(msg)
      setTimeout(() => navigate('/login', { replace: true }), 5000)
      return
    }

    // Give up after 15 seconds and redirect to login
    const giveUp = setTimeout(() => {
      log('Timeout — redirecting to login')
      navigate('/login', { replace: true })
    }, 15000)

    // Supabase automatically exchanges the code via detectSessionInUrl.
    // We just listen for the resulting SIGNED_IN event.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      log(`onAuthStateChange: ${event}, session: ${!!session}`)
      if (session) {
        clearTimeout(giveUp)
        subscription.unsubscribe()
        if (event === 'PASSWORD_RECOVERY') {
          navigate('/reset-password', { replace: true })
          return
        }
        navigate('/', { replace: true })
      }
    })

    // Also check immediately in case session is already set
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      log(`getSession: session=${!!session}, error=${error?.message || 'none'}`)
      if (session) {
        clearTimeout(giveUp)
        subscription.unsubscribe()
        navigate('/', { replace: true })
      }
    })

    return () => {
      clearTimeout(giveUp)
      subscription.unsubscribe()
    }
  }, [navigate])

  if (errorMsg) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#faf9f7] p-4">
        <div className="bg-white rounded-2xl border border-red-100 shadow-xl p-8 text-center max-w-sm w-full">
          <div className="text-3xl mb-3">⚠️</div>
          <h2 className="font-black text-[#141414] mb-2">Sign-in failed</h2>
          <p className="text-sm text-red-500 mb-2">{errorMsg}</p>
          <p className="text-xs text-gray-400">Redirecting to login...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#faf9f7]">
      <div className="text-center max-w-sm w-full px-4">
        <Loader2 size={32} className="animate-spin text-[#ff5a00] mx-auto mb-3" />
        <p className="text-sm text-gray-500 mb-4">Signing you in...</p>

        {/* Debug log — visible on screen so you can report what's happening */}
        {debugLog.length > 0 && (
          <div className="text-left bg-gray-900 rounded-xl p-3 text-xs font-mono text-green-400 space-y-0.5 mt-4">
            {debugLog.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
