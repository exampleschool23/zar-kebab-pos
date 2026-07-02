import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase, getProfile } from '../lib/supabase'

const AuthContext = createContext(null)

function fallbackProfileFromUser(user, status = 'pending') {
  return {
    id: user.id,
    email: user.email,
    full_name: user.user_metadata?.full_name || user.user_metadata?.name || '',
    role: 'guest',
    status,
  }
}

function authError(message, status) {
  return Object.assign(new Error(message), { status })
}

async function readApiResponse(response) {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return { error: text }
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [profileError, setProfileError] = useState(null)
  const [authError, setAuthError] = useState(null)
  const [loading, setLoading] = useState(true)

  async function loadProfile(user) {
    try {
      setProfileError(null)
      const data = await getProfile(user.id)
      const next = data || fallbackProfileFromUser(user)
      setProfile(next)
      return next
    } catch (error) {
      setProfile(null)
      setProfileError(error)
      return null
    }
  }

  function applyAuthSession(nextSession) {
    setSession(nextSession)
    setAuthError(null)
    setLoading(false)
    if (nextSession?.user) {
      return loadProfile(nextSession.user)
    }
    setProfile(null)
    setProfileError(null)
    return null
  }

  function failAuthSession(error) {
    setSession(null)
    setProfile(null)
    setProfileError(null)
    setAuthError(error)
    setLoading(false)
    return null
  }

  useEffect(() => {
    let cancelled = false
    const applySession = nextSession => {
      if (!cancelled) applyAuthSession(nextSession || null)
    }
    const failSessionLoad = error => {
      if (!cancelled) failAuthSession(error)
    }

    const sessionTimeout = setTimeout(() => {
      failSessionLoad(new Error('Session lookup timed out. Check the connection and try again.'))
    }, 12000)

    // onAuthStateChange fires INITIAL_SESSION immediately from localStorage —
    // this is the fastest path and handles 99% of cases
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'INITIAL_SESSION' && !nextSession) return
      clearTimeout(sessionTimeout)
      applySession(nextSession)
    })

    // getSession as a backup (also triggers token refresh if needed)
    supabase.auth.getSession()
      .then(({ data, error }) => {
        clearTimeout(sessionTimeout)
        if (error) throw error
        applySession(data?.session || null)
      })
      .catch(error => {
        clearTimeout(sessionTimeout)
        failSessionLoad(error)
      })

    return () => {
      cancelled = true
      clearTimeout(sessionTimeout)
      subscription.unsubscribe()
    }
  }, [])

  async function signInWithEmail(email, password) {
    return supabase.auth.signInWithPassword({
      email: String(email || '').trim().toLowerCase(),
      password,
    })
  }

  async function signUpWithEmail(email, password, fullName) {
    const normalizedEmail = String(email || '').trim().toLowerCase()
    const normalizedName = String(fullName || '').trim()

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: normalizedEmail,
          password,
          fullName: normalizedName,
        }),
      })
      const body = await readApiResponse(response)
      const endpointMissing = response.status === 404 || String(response.headers.get('content-type') || '').includes('text/html')
      if (!endpointMissing) {
        if (!response.ok) {
          throw authError(body?.error || 'Could not create account.', response.status)
        }
        const signInResult = await signInWithEmail(normalizedEmail, password)
        if (signInResult.error) return signInResult
        if (signInResult.data?.session) await applyAuthSession(signInResult.data.session)
        return {
          ...signInResult,
          data: {
            ...(signInResult.data || {}),
            profile: body?.profile || null,
            createdWithPassword: true,
          },
        }
      }
    } catch (error) {
      if (error?.status) return { data: null, error }
    }

    return supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: { full_name: normalizedName, role: 'guest' },
        emailRedirectTo: `${globalThis.location?.origin || ''}/auth/callback`,
      },
    })
  }

  async function signInWithGoogle(returnTo = '') {
    const redirectUrl = new URL('/auth/callback', window.location.origin)
    if (returnTo) redirectUrl.searchParams.set('returnTo', returnTo)
    return supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirectUrl.toString() },
    })
  }

  async function resetPassword(email) {
    return supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
  }

  async function signOut() {
    await supabase.auth.signOut()
    setSession(null)
    setProfile(null)
    setProfileError(null)
    setAuthError(null)
  }

  async function refreshProfile() {
    if (session?.user) return loadProfile(session.user)
  }

  async function refreshAuth() {
    try {
      const { data, error } = await supabase.auth.getSession()
      if (error) throw error
      return applyAuthSession(data?.session || null)
    } catch (error) {
      return failAuthSession(error)
    }
  }

  return (
    <AuthContext.Provider value={{
      session, profile, profileError, authError, loading,
      signInWithEmail, signUpWithEmail, signInWithGoogle,
      resetPassword, signOut, refreshProfile, refreshAuth,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
