import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase, getProfile } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  async function loadProfile(userId) {
    try {
      const data = await getProfile(userId)
      setProfile(data)
      return data
    } catch {
      setProfile(null)
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
        loadProfile(session.user.id)
      } else {
        setProfile(null)
      }
    })

    // getSession as a backup (also triggers token refresh if needed)
    supabase.auth.getSession().then(({ data: { session } }) => {
      clearTimeout(hardTimeout)
      setSession(session)
      setLoading(false)
      if (session?.user) loadProfile(session.user.id)
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
      options: { data: { full_name: fullName } },
    })
  }

  async function signInWithGoogle() {
    return supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }

  async function resetPassword(email) {
    return supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback`,
    })
  }

  async function signOut() {
    await supabase.auth.signOut()
    setSession(null)
    setProfile(null)
  }

  async function refreshProfile() {
    if (session?.user) return loadProfile(session.user.id)
  }

  return (
    <AuthContext.Provider value={{
      session, profile, loading,
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
