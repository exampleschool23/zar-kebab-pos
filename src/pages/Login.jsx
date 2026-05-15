import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Utensils, Eye, EyeOff, Loader2, ShieldCheck, LayoutDashboard, Users } from 'lucide-react'

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
      <path d="M3.964 10.707C3.784 10.167 3.682 9.59 3.682 9c0-.59.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.548 0 9c0 1.452.348 2.825.957 4.039l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 6.293C4.672 4.166 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  )
}

const FEATURES = [
  { icon: LayoutDashboard, text: 'Real-time order management' },
  { icon: Users,           text: 'Multi-role team access'     },
  { icon: ShieldCheck,     text: 'Secure role-based access'   },
]

export default function Login() {
  const { signInWithEmail, signUpWithEmail, signInWithGoogle, resetPassword } = useAuth()
  const navigate = useNavigate()

  const [mode, setMode]           = useState('signin') // 'signin' | 'signup' | 'forgot'
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [fullName, setFullName]   = useState('')
  const [showPass, setShowPass]   = useState(false)
  const [loading, setLoading]     = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError]         = useState('')
  const [info, setInfo]           = useState('')

  function clearMessages() { setError(''); setInfo('') }

  async function handleSubmit(e) {
    e.preventDefault()
    clearMessages()
    setLoading(true)

    if (mode === 'forgot') {
      const { error } = await resetPassword(email)
      setLoading(false)
      if (error) return setError(error.message)
      setInfo('Password reset link sent. Check your email.')
      return
    }

    if (mode === 'signup') {
      if (!fullName.trim()) { setLoading(false); return setError('Full name is required.') }
      const { error } = await signUpWithEmail(email, password, fullName)
      setLoading(false)
      if (error) return setError(error.message)
      setInfo('Account created. Please check your email to confirm, then sign in.')
      setMode('signin')
      return
    }

    // signin
    const { error } = await signInWithEmail(email, password)
    setLoading(false)
    if (error) return setError('Invalid email or password.')
    // AuthContext handles profile load → App.jsx redirects
  }

  async function handleGoogle() {
    clearMessages()
    setGoogleLoading(true)
    const { error } = await signInWithGoogle()
    if (error) { setGoogleLoading(false); setError(error.message) }
    // Browser redirects to Google; no further action needed here
  }

  const titles = {
    signin: { heading: 'Sign in to your workspace', sub: 'Access your restaurant dashboard' },
    signup: { heading: 'Create your account',       sub: 'Join your restaurant team'        },
    forgot: { heading: 'Reset your password',       sub: 'We\'ll send a link to your email' },
  }

  return (
    <div className="min-h-screen flex w-full max-w-full overflow-x-hidden bg-[#faf9f7]">

      {/* ── Left panel (desktop only) ── */}
      <div className="hidden lg:flex flex-col justify-between w-[420px] flex-shrink-0 bg-[#141414] px-12 py-14 text-white">
        {/* Brand */}
        <div>
          <div className="flex items-center gap-3 mb-14">
            <div className="w-10 h-10 bg-[#ff5a00] rounded-xl flex items-center justify-center">
              <Utensils size={20} className="text-white" />
            </div>
            <span className="text-xl font-black tracking-tight">Zar Kebab</span>
          </div>

          <h1 className="text-3xl font-black leading-snug mb-3">
            Restaurant POS &<br />Order Management
          </h1>
          <p className="text-[#888] text-sm leading-relaxed mb-12">
            A complete point-of-sale system for your restaurant team — from waiters to kitchen to cashier.
          </p>

          <div className="space-y-5">
            {FEATURES.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#ff5a00]/10 flex items-center justify-center flex-shrink-0">
                  <Icon size={15} className="text-[#ff5a00]" />
                </div>
                <span className="text-sm text-[#ccc]">{text}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-[#444] text-xs">© {new Date().getFullYear()} Zar Kebab. All rights reserved.</p>
      </div>

      {/* ── Right panel ── */}
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-[420px]">

          {/* Mobile brand */}
          <div className="flex lg:hidden items-center gap-3 justify-center mb-8">
            <div className="w-10 h-10 bg-[#ff5a00] rounded-xl flex items-center justify-center">
              <Utensils size={20} className="text-white" />
            </div>
            <span className="text-xl font-black text-[#141414] tracking-tight">Zar Kebab</span>
          </div>

          {/* Card */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xl shadow-gray-100 p-8">

            <div className="mb-7">
              <h2 className="text-xl font-black text-[#141414]">{titles[mode].heading}</h2>
              <p className="text-sm text-gray-400 mt-1">{titles[mode].sub}</p>
            </div>

            {/* Error / Info */}
            {error && (
              <div className="mb-4 px-4 py-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600">
                {error}
              </div>
            )}
            {info && (
              <div className="mb-4 px-4 py-3 bg-green-50 border border-green-100 rounded-xl text-sm text-green-700">
                {info}
              </div>
            )}

            {/* Google button (not on forgot) */}
            {mode !== 'forgot' && (
              <>
                <button
                  onClick={handleGoogle}
                  disabled={googleLoading}
                  className="w-full flex items-center justify-center gap-3 bg-white border border-gray-200 rounded-xl py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-60 shadow-sm"
                >
                  {googleLoading
                    ? <Loader2 size={16} className="animate-spin" />
                    : <GoogleIcon />
                  }
                  Continue with Google
                </button>

                <div className="flex items-center gap-3 my-5">
                  <div className="flex-1 h-px bg-gray-100" />
                  <span className="text-xs text-gray-400 uppercase tracking-wider">or</span>
                  <div className="flex-1 h-px bg-gray-100" />
                </div>
              </>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'signup' && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">Full name</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={e => { setFullName(e.target.value); clearMessages() }}
                    placeholder="Your full name"
                    required
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#ff5a00]/20 focus:border-[#ff5a00] transition-all"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Email address</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); clearMessages() }}
                  placeholder="you@example.com"
                  required
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#ff5a00]/20 focus:border-[#ff5a00] transition-all"
                />
              </div>

              {mode !== 'forgot' && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">Password</label>
                  <div className="relative">
                    <input
                      type={showPass ? 'text' : 'password'}
                      value={password}
                      onChange={e => { setPassword(e.target.value); clearMessages() }}
                      placeholder="••••••••"
                      required
                      minLength={6}
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 pr-11 text-sm focus:outline-none focus:ring-2 focus:ring-[#ff5a00]/20 focus:border-[#ff5a00] transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(s => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              )}

              {mode === 'signin' && (
                <div className="text-right">
                  <button
                    type="button"
                    onClick={() => { setMode('forgot'); clearMessages() }}
                    className="text-xs text-[#ff5a00] hover:underline font-medium"
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#ff5a00] text-white rounded-xl py-3 font-bold text-sm hover:bg-[#cc4800] transition-colors disabled:opacity-60 shadow-lg shadow-orange-100 flex items-center justify-center gap-2 mt-1"
              >
                {loading && <Loader2 size={15} className="animate-spin" />}
                {mode === 'signin' && 'Sign in'}
                {mode === 'signup' && 'Create account'}
                {mode === 'forgot' && 'Send reset link'}
              </button>
            </form>

            {/* Mode switcher */}
            <div className="mt-6 text-center text-sm text-gray-400">
              {mode === 'signin' && (
                <>
                  Don't have an account?{' '}
                  <button onClick={() => { setMode('signup'); clearMessages() }} className="text-[#ff5a00] font-semibold hover:underline">
                    Create one
                  </button>
                </>
              )}
              {mode === 'signup' && (
                <>
                  Already have an account?{' '}
                  <button onClick={() => { setMode('signin'); clearMessages() }} className="text-[#ff5a00] font-semibold hover:underline">
                    Sign in
                  </button>
                </>
              )}
              {mode === 'forgot' && (
                <button onClick={() => { setMode('signin'); clearMessages() }} className="text-[#ff5a00] font-semibold hover:underline">
                  ← Back to sign in
                </button>
              )}
            </div>
          </div>

          <p className="text-center text-xs text-gray-300 mt-6">
            Secure access for restaurant teams
          </p>
        </div>
      </div>
    </div>
  )
}
