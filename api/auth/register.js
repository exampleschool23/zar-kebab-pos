import { createClient } from '@supabase/supabase-js'
import { json, methodNotAllowed, readJson } from '../telegram/_lib/http.js'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD_LENGTH = 6

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const missing = [
    !url && 'SUPABASE_URL or VITE_SUPABASE_URL',
    !key && 'SUPABASE_SERVICE_ROLE_KEY',
  ].filter(Boolean)

  if (missing.length) {
    throw Object.assign(new Error(`Server misconfigured: missing ${missing.join(', ')}`), { status: 500 })
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

function normalizeName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ')
}

function validateRegistration(body) {
  const email = normalizeEmail(body.email)
  const password = String(body.password || '')
  const fullName = normalizeName(body.fullName || body.name)

  if (!EMAIL_PATTERN.test(email)) {
    throw Object.assign(new Error('Enter a valid email address.'), { status: 400 })
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw Object.assign(new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`), { status: 400 })
  }
  if (!fullName) {
    throw Object.assign(new Error('Full name is required.'), { status: 400 })
  }

  return { email, password, fullName }
}

function registrationError(error) {
  const message = String(error?.message || '')
  const lower = message.toLowerCase()
  if (lower.includes('already') || lower.includes('registered') || lower.includes('exists')) {
    return Object.assign(new Error('An account with this email already exists. Sign in with email and password.'), { status: 409 })
  }
  return Object.assign(new Error(message || 'Could not create account.'), { status: error?.status || 400 })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res)

  try {
    const body = await readJson(req)
    const { email, password, fullName } = validateRegistration(body)
    const supabase = getSupabaseAdmin()

    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role: 'guest',
      },
    })

    if (createError) throw registrationError(createError)
    const user = created?.user
    if (!user?.id) {
      throw Object.assign(new Error('Could not create account.'), { status: 500 })
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        email,
        full_name: fullName,
        role: 'guest',
        status: 'active',
      }, { onConflict: 'id' })
      .select('id,email,full_name,role,status')
      .single()

    if (profileError) {
      await supabase.auth.admin.deleteUser(user.id)
      throw Object.assign(new Error(profileError.message || 'Could not create profile.'), { status: 500 })
    }

    return json(res, 200, {
      user: {
        id: user.id,
        email: user.email,
      },
      profile,
    })
  } catch (error) {
    return json(res, error.status || 400, { error: error.message || 'Could not create account.' })
  }
}
