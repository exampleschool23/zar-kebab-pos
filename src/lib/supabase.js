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

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key'
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

export async function getAllProfiles() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })
  return { data, error }
}
