import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Loader2 } from 'lucide-react'
import { useApp } from '../store/AppContext'
import { t } from '../lib/i18n'

export default function AuthCallback() {
  const navigate = useNavigate()
  const { state } = useApp()
  const lang = state.lang || 'ru'
  const [errorMsg, setErrorMsg] = useState('')
  const [debugLog, setDebugLog] = useState([])

  function log(msg) {
    setDebugLog(prev => [...prev, msg])
  }

  useEffect(() => {
    const url = new URL(window.location.href)
    const oauthError   = url.searchParams.get('error')
    const oauthErrDesc = url.searchParams.get('error_description')
    const code         = url.searchParams.get('code')
    const returnTo     = sanitizeReturnTo(url.searchParams.get('returnTo'))

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

    async function completeCodeSignIn() {
      if (!code) return false
      log('Exchanging OAuth code')
      const { data, error } = await supabase.auth.exchangeCodeForSession(code)
      if (error) {
        log(`Code exchange error: ${error.message}`)
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          clearTimeout(giveUp)
          subscription.unsubscribe()
          navigate(returnTo || '/', { replace: true })
          return true
        }
        setErrorMsg(error.message)
        clearTimeout(giveUp)
        setTimeout(() => navigate('/login', { replace: true }), 5000)
        return true
      }
      if (data?.session) {
        log('Code exchange complete')
        clearTimeout(giveUp)
        subscription.unsubscribe()
        navigate(returnTo || '/', { replace: true })
        return true
      }
      return false
    }

    // Keep listening for password recovery and already-established sessions.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      log(`onAuthStateChange: ${event}, session: ${!!session}`)
      if (session) {
        clearTimeout(giveUp)
        subscription.unsubscribe()
        if (event === 'PASSWORD_RECOVERY') {
          navigate('/reset-password', { replace: true })
          return
        }
        navigate(returnTo || '/', { replace: true })
      }
    })

    // Also check immediately in case session is already set
    completeCodeSignIn().then(exchanged => {
      if (exchanged) return
      return supabase.auth.getSession().then(({ data: { session }, error }) => {
        log(`getSession: session=${!!session}, error=${error?.message || 'none'}`)
        if (session) {
          clearTimeout(giveUp)
          subscription.unsubscribe()
          navigate(returnTo || '/', { replace: true })
        }
      })
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
          <h2 className="font-black text-[#141414] mb-2">{t(lang, 'signInFailed')}</h2>
          <p className="text-sm text-red-500 mb-2">{errorMsg}</p>
          <p className="text-xs text-gray-400">{t(lang, 'redirectingToLogin')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#faf9f7]">
      <div className="text-center max-w-sm w-full px-4">
        <Loader2 size={32} className="animate-spin text-[#ff5a00] mx-auto mb-3" />
        <p className="text-sm text-gray-500 mb-4">{t(lang, 'signingIn')}</p>

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

function sanitizeReturnTo(value) {
  const raw = String(value || '').trim()
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return ''
  if (raw.startsWith('/login') || raw.startsWith('/auth/callback')) return ''
  return raw
}
