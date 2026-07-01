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

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [profileError, setProfileError] = useState(null)
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

  useEffect(() => {
    // Hard timeout — if Supabase hangs refreshing a stale token, unblock routing
    const hardTimeout = setTimeout(() => {
      setLoading(false)
    }, 4000)

    // onAuthStateChange fires INITIAL_SESSION immediately from localStorage —
    // this is the fastest path and handles 99% of cases
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      clearTimeout(hardTimeout)
      setSession(session)
      setLoading(false)
      if (session?.user) {
        loadProfile(session.user)
      } else {
        setProfile(null)
        setProfileError(null)
      }
    })

    // getSession as a backup (also triggers token refresh if needed)
    supabase.auth.getSession().then(({ data: { session } }) => {
      clearTimeout(hardTimeout)
      setSession(session)
      setLoading(false)
      if (session?.user) {
        loadProfile(session.user)
      } else {
        setProfile(null)
        setProfileError(null)
      }
    })

    return () => {
      clearTimeout(hardTimeout)
      subscription.unsubscribe()
    }
  }, [])

  async function signInWithEmail(email, password) {
    return supabase.auth.signInWithPassword({ email, password })
  }

  async function signUpWithEmail(email, password, fullName) {
    return supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, role: 'guest' } },
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
  }

  async function refreshProfile() {
    if (session?.user) return loadProfile(session.user)
  }

  return (
    <AuthContext.Provider value={{
      session, profile, profileError, loading,
      signInWithEmail, signUpWithEmail, signInWithGoogle,
      resetPassword, signOut, refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
