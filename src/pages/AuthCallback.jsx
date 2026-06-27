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
    let cancelled = false
    const url = new URL(window.location.href)
    const hashParams   = new URLSearchParams(url.hash.replace(/^#/, ''))
    const oauthError   = url.searchParams.get('error')
      || hashParams.get('error')
    const oauthErrDesc = url.searchParams.get('error_description')
      || hashParams.get('error_description')
    const code         = url.searchParams.get('code')
    const accessToken  = hashParams.get('access_token')
    const refreshToken = hashParams.get('refresh_token')
    const returnTo     = sanitizeReturnTo(url.searchParams.get('returnTo'))

    log(`URL params — code: ${!!code}, token: ${!!accessToken}, error: ${oauthError || 'none'}`)

    if (oauthError) {
      const msg = oauthErrDesc || oauthError
      log(`OAuth error: ${msg}`)
      setErrorMsg(msg)
      setTimeout(() => navigate('/login', { replace: true }), 5000)
      return
    }

    function finish(path) {
      if (cancelled) return
      clearTimeout(giveUp)
      navigate(path, { replace: true })
    }

    function fail(error) {
      if (cancelled) return
      const msg = error?.message || String(error || 'Sign in could not be completed')
      log(`Auth callback error: ${msg}`)
      clearTimeout(giveUp)
      setErrorMsg(msg)
      setTimeout(() => navigate('/login', { replace: true }), 5000)
    }

    function withTimeout(promise, label, ms = 10000) {
      let timeoutId
      const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`${label} timed out`)), ms)
      })
      return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId))
    }

    const giveUp = setTimeout(() => {
      log('Timeout — redirecting to login')
      fail(new Error('OAuth callback timed out'))
    }, 15000)

    async function completeCodeSignIn() {
      if (!code) return false
      log('Exchanging OAuth code')
      const { data, error } = await withTimeout(
        supabase.auth.exchangeCodeForSession(code),
        'OAuth code exchange'
      )
      if (error) {
        log(`Code exchange error: ${error.message}`)
        const { data: { session } } = await withTimeout(
          supabase.auth.getSession(),
          'Session lookup',
          5000
        )
        if (session) {
          finish(returnTo || '/')
          return true
        }
        throw error
      }
      if (data?.session) {
        log('Code exchange complete')
        finish(returnTo || '/')
        return true
      }
      return false
    }

    async function completeHashSignIn() {
      if (!accessToken || !refreshToken) return false
      log('Setting OAuth hash session')
      const { data, error } = await withTimeout(
        supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        }),
        'OAuth hash session'
      )
      if (error) {
        log(`Hash session error: ${error.message}`)
        throw error
      }
      if (data?.session) {
        log('Hash session complete')
        finish(returnTo || '/')
        return true
      }
      return false
    }

    async function completeSignIn() {
      try {
        if (await completeCodeSignIn()) return
        if (await completeHashSignIn()) return
        const { data: { session }, error } = await withTimeout(
          supabase.auth.getSession(),
          'Session lookup',
          5000
        )
        log(`getSession: session=${!!session}, error=${error?.message || 'none'}`)
        if (session) {
          finish(returnTo || '/')
          return
        }
        throw error || new Error('No session was returned by Supabase')
      } catch (error) {
        fail(error)
      }
    }

    completeSignIn()

    return () => {
      cancelled = true
      clearTimeout(giveUp)
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
