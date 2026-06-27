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
      detectSessionInUrl: true,
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

export async function getProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  if (error) return null
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

export async function deleteProfile(userId) {
  const { error } = await supabase
    .from('profiles')
    .delete()
    .eq('id', userId)
  return { error }
}

export async function getAllProfiles() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })
  return { data, error }
}
