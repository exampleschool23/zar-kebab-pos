// Same-origin REST calls skip the CORS preflight a browser sends before each
// cross-origin Supabase request, which nearly doubled API gateway log volume.
// vercel.json and the Vite dev server forward /sb/rest/v1/* to this project.
// Auth, storage and realtime stay direct, so sessions and sockets are unchanged.
export const PROXIED_SUPABASE_ORIGIN = 'https://bcdbljpwhyawaasimjmk.supabase.co'
export const REST_PROXY_PATH = '/sb/rest/v1/'

export function proxiedRestUrl(input, supabaseUrl) {
  if (typeof input !== 'string') return input
  const origin = String(supabaseUrl || '').replace(/\/+$/, '')
  // Another project (a preview or local stack) has no matching rewrite.
  if (origin !== PROXIED_SUPABASE_ORIGIN) return input
  const prefix = `${origin}/rest/v1/`
  return input.startsWith(prefix) ? REST_PROXY_PATH + input.slice(prefix.length) : input
}
