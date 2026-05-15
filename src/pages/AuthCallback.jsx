import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Loader2 } from 'lucide-react'

export default function AuthCallback() {
  const navigate = useNavigate()

  useEffect(() => {
    // Supabase handles the OAuth token exchange from the URL hash automatically.
    // We just wait for the session to be set, then navigate.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        // App.jsx RoleRedirect will handle where to send the user
        navigate('/', { replace: true })
      } else {
        navigate('/login', { replace: true })
      }
    })
  }, [navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#faf9f7]">
      <div className="text-center">
        <Loader2 size={32} className="animate-spin text-[#ff5a00] mx-auto mb-3" />
        <p className="text-sm text-gray-500">Signing you in...</p>
      </div>
    </div>
  )
}
