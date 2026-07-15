import { createClient } from '@supabase/supabase-js'
import { getBearerToken, json, methodNotAllowed, readJson } from '../telegram/_lib/http.js'

const PRIMARY_OWNER_EMAIL = 'dangerhoggish@gmail.com'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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

function normalizedEmail(profile) {
  return String(profile?.email || '').trim().toLowerCase()
}

function hasTeamAccess(profile) {
  if (normalizedEmail(profile) === PRIMARY_OWNER_EMAIL) return true
  if (profile?.feature_access == null) return true
  return Array.isArray(profile.feature_access) && profile.feature_access.includes('team')
}

export function authorizeTeamMemberDeletion(requester, target, targetId, expectedStatus = '') {
  if (!requester || requester.status !== 'active' || requester.role !== 'owner' || !hasTeamAccess(requester)) {
    throw Object.assign(new Error('Only an active owner with Team access can delete users.'), { status: 403 })
  }
  if (!target || target.id !== targetId) {
    throw Object.assign(new Error('User not found.'), { status: 404 })
  }
  if (requester.id === targetId) {
    throw Object.assign(new Error('You cannot delete your own account.'), { status: 400 })
  }
  if (target.role === 'owner' || normalizedEmail(target) === PRIMARY_OWNER_EMAIL) {
    throw Object.assign(new Error('Owner accounts cannot be deleted.'), { status: 403 })
  }
  if (expectedStatus && target.status !== expectedStatus) {
    throw Object.assign(new Error(`User is no longer ${expectedStatus}.`), { status: 409 })
  }
}

export default async function handler(req, res) {
  if (req.method !== 'DELETE') return methodNotAllowed(res, ['DELETE'])

  try {
    const token = getBearerToken(req)
    if (!token) throw Object.assign(new Error('Authentication required.'), { status: 401 })

    const body = await readJson(req)
    const targetId = String(body.userId || '').trim()
    const expectedStatus = String(body.expectedStatus || '').trim()
    if (!UUID_PATTERN.test(targetId)) {
      throw Object.assign(new Error('A valid user ID is required.'), { status: 400 })
    }
    if (expectedStatus && expectedStatus !== 'pending') {
      throw Object.assign(new Error('Invalid expected status.'), { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data: { user: requesterUser }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !requesterUser) {
      throw Object.assign(new Error('Invalid or expired session.'), { status: 401 })
    }

    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id,email,role,status,feature_access')
      .in('id', [requesterUser.id, targetId])

    if (profileError) throw Object.assign(new Error(profileError.message), { status: 500 })

    const requester = profiles?.find(profile => profile.id === requesterUser.id)
    const target = profiles?.find(profile => profile.id === targetId)
    authorizeTeamMemberDeletion(requester, target, targetId, expectedStatus)

    const { error: deleteError } = await supabase.auth.admin.deleteUser(targetId)
    if (deleteError) throw Object.assign(new Error(deleteError.message), { status: deleteError.status || 500 })

    return json(res, 200, { ok: true })
  } catch (error) {
    return json(res, error.status || 400, { error: error.message || 'Could not delete user.' })
  }
}
