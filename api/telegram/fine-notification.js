import { json, methodNotAllowed, readJson, getBearerToken } from './_lib/http.js'
import { getSupabaseAdmin } from './_lib/supabaseAdmin.js'
import { buildEmployeeFineMessage, getEmployeeFineChatIds } from './_lib/fineMessages.js'
import { sendTelegramMessage } from './_lib/telegram.js'

const EDITOR_ROLES = new Set(['owner', 'admin'])
const FEATURE_ACCESS_MANAGER_EMAILS = new Set(['dangerhoggish@gmail.com'])

function normalizeRole(role) {
  const value = String(role || '').toLowerCase()
  return ['waiter', 'cashier', 'kitchen'].includes(value) ? 'admin' : value
}

async function requireExpensesWriteAccess(req) {
  const token = getBearerToken(req)
  if (!token) throw Object.assign(new Error('Authentication required'), { status: 401 })

  const supabase = getSupabaseAdmin()
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) throw Object.assign(new Error('Invalid or expired session'), { status: 401 })

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, status, email, feature_access')
    .eq('id', user.id)
    .maybeSingle()
  if (profileError) throw profileError

  const role = normalizeRole(profile?.role)
  const access = Array.isArray(profile?.feature_access) ? profile.feature_access : null
  const isPrimaryOwner = role === 'owner'
    && FEATURE_ACCESS_MANAGER_EMAILS.has(String(profile?.email || '').trim().toLowerCase())
  const hasImplicitOwnerAccess = role === 'owner' && access === null
  const hasExplicitExpensesWrite = EDITOR_ROLES.has(role) && access?.includes('expenses')
  if (profile?.status !== 'active' || (!isPrimaryOwner && !hasImplicitOwnerAccess && !hasExplicitExpensesWrite)) {
    throw Object.assign(new Error('Forbidden'), { status: 403 })
  }

  return { supabase, user }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res)

  try {
    const { fineId } = await readJson(req)
    if (!fineId) return json(res, 400, { error: 'fineId is required' })

    const { supabase, user } = await requireExpensesWriteAccess(req)
    const { data: fine, error } = await supabase
      .from('employee_salary_fines')
      .select('id, fine_date, amount, reason, created_by, created_by_name, salary_profile:employee_salary_profiles(employee_name)')
      .eq('id', fineId)
      .maybeSingle()
    if (error) throw error
    if (!fine || fine.created_by !== user.id) {
      return json(res, 404, { error: 'Fine not found' })
    }

    const chatIds = getEmployeeFineChatIds()
    if (chatIds.length === 0) return json(res, 200, { skipped: true })

    const text = buildEmployeeFineMessage({
      ...fine,
      employee_name: fine.salary_profile?.employee_name || '',
    })
    const results = await Promise.allSettled(chatIds.map(chatId => sendTelegramMessage(chatId, text)))
    const failedCount = results.filter(result => result.status === 'rejected').length
    if (failedCount > 0) {
      for (const result of results) {
        if (result.status === 'rejected') console.error('[telegram/fine-notification] send failed:', result.reason)
      }
      return json(res, 502, { error: 'Could not notify every Telegram chat', failedCount })
    }

    return json(res, 200, { ok: true, sentCount: results.length })
  } catch (error) {
    console.error('[telegram/fine-notification]', error)
    return json(res, error?.status || 400, { error: error.message || 'Could not notify Telegram' })
  }
}
