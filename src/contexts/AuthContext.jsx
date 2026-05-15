import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase, getProfile } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession]   = useState(null)
  const [profile, setProfile]   = useState(null)
  const [loading, setLoading]   = useState(true)  // true only until session is known

  async function loadProfile(userId) {
    console.log('[Auth] loadProfile', userId)
    try {
      const data = await getProfile(userId)
      console.log('[Auth] profile', data)
      setProfile(data)
      return data
    } catch (e) {
      console.error('[Auth] loadProfile error', e)
      setProfile(null)
    }
  }

  useEffect(() => {
    // Step 1: get the current session — sets loading=false as soon as we know
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      console.log('[Auth] getSession', { userId: session?.user?.id, error: error?.message })
      setSession(session)
      setLoading(false)  // unblock routing immediately
      if (session?.user) loadProfile(session.user.id)  // load profile in background
    })

    // Step 2: keep in sync when auth state changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[Auth] stateChange', event, session?.user?.id)
      setSession(session)
      setLoading(false)
      if (session?.user) {
        loadProfile(session.user.id)
      } else {
        setProfile(null)
      }
    })

    return () => subscription.unsubscribe()
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
