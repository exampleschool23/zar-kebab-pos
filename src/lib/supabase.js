import { createClient } from '@supabase/supabase-js'

const env = import.meta.env || {}
const supabaseUrl = env.VITE_SUPABASE_URL
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY
const isBrowser = typeof window !== 'undefined'
const missingConfig = !supabaseUrl || !supabaseAnonKey

if (missingConfig && isBrowser) {
  console.error('[supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Check deployment environment variables.')
}

export const isSupabaseConfigured = !missingConfig

function withNoCacheHeaders(headers) {
  const next = new Headers(headers || {})
  next.set('Cache-Control', 'no-cache')
  next.set('Pragma', 'no-cache')
  return next
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      flowType: 'pkce',
      detectSessionInUrl: false,
      persistSession: true,
      autoRefreshToken: true,
    },
    global: {
      fetch: (input, init = {}) => fetch(input, {
        ...init,
        cache: 'no-store',
        headers: withNoCacheHeaders(init.headers),
      }),
    },
  }
)

export async function getProfile(userId, { signal } = {}) {
  let query = supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  if (signal) query = query.abortSignal(signal)
  const { data, error } = await query
  if (error) throw error
  return data
}

export async function updateProfile(userId, updates) {
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select()
    .single()
  return { data, error }
}

export async function deleteProfile(userId, { expectedStatus = '' } = {}) {
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    if (sessionError) return { error: sessionError }
    if (!session?.access_token) return { error: new Error('Authentication required.') }

    const response = await fetch('/api/auth/delete-user', {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId, ...(expectedStatus ? { expectedStatus } : {}) }),
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) return { error: new Error(body.error || 'Could not delete user.') }
    return { error: null }
  } catch (error) {
    return { error }
  }
}

export async function getAllProfiles() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })
  return { data, error }
}
