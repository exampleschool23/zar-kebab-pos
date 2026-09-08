import { createClient } from '@supabase/supabase-js'
import { createReportReadFetch } from './reportReadFetch.js'

export function getSupabaseAdmin({ retryReportReads = false } = {}) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }

  return createClient(url, key, {
    ...(retryReportReads ? { global: { fetch: createReportReadFetch() } } : {}),
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}
