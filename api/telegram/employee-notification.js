import { json, methodNotAllowed, readJson, getBearerToken } from './_lib/http.js'
import { getSupabaseAdmin } from './_lib/supabaseAdmin.js'
import { buildEmployeeFineMessage } from './_lib/fineMessages.js'
import {
  buildEmployeePaymentMessage,
  getEmployeePaymentConfirmationCopy,
} from './_lib/paymentMessages.js'
import { getDailySalaryNotificationSummary, getTashkentDate } from './_lib/salaryMessages.js'
import { loadSalaryProfiles } from './_lib/salaryProfileData.js'
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

async function notifyFine(supabase, user, fineId) {
  const { data: fine, error } = await supabase
    .from('employee_salary_fines')
    .select('id, salary_profile_id, fine_date, amount, reason, created_by, created_by_name, salary_profile:employee_salary_profiles(employee_name)')
    .eq('id', fineId)
    .maybeSingle()
  if (error) throw error
  if (!fine || fine.created_by !== user.id) {
    throw Object.assign(new Error('Fine not found'), { status: 404 })
  }

  const { data: employeeLink, error: linkError } = await supabase
    .from('employee_salary_telegram_links')
    .select('chat_id, notifications_enabled')
    .eq('salary_profile_id', fine.salary_profile_id)
    .maybeSingle()
  if (linkError) throw linkError
  if (!employeeLink?.chat_id || employeeLink.notifications_enabled === false) {
    return { skipped: true, reason: 'employee_not_linked' }
  }

  const text = buildEmployeeFineMessage({
    ...fine,
    employee_name: fine.salary_profile?.employee_name || '',
  })
  await sendTelegramMessage(employeeLink.chat_id, text)
  return { ok: true, sentCount: 1 }
}

async function notifyPayment(supabase, user, paymentId) {
  let deliveryId = null
  try {
    const { data: payment, error } = await supabase
      .from('employee_salary_payments')
      .select('id, salary_profile_id, paid_date, amount, payment_method, note, created_by, created_by_name, salary_profile:employee_salary_profiles(employee_name)')
      .eq('id', paymentId)
      .maybeSingle()
    if (error) throw error
    if (!payment || payment.created_by !== user.id) {
      throw Object.assign(new Error('Payment not found'), { status: 404 })
    }

    const { data: existingDelivery, error: existingError } = await supabase
      .from('employee_salary_payment_notification_deliveries')
      .select('id, status, telegram_message_id')
      .eq('payment_id', payment.id)
      .maybeSingle()
    if (existingError) throw existingError
    if (existingDelivery && ['sent', 'confirmed'].includes(existingDelivery.status)) {
      return {
        ok: true,
        duplicate: true,
        status: existingDelivery.status,
        telegramMessageId: existingDelivery.telegram_message_id,
      }
    }

    const now = new Date().toISOString()
    const { data: delivery, error: deliveryError } = await supabase
      .from('employee_salary_payment_notification_deliveries')
      .upsert({
        payment_id: payment.id,
        salary_profile_id: payment.salary_profile_id,
        status: 'pending',
        telegram_message_id: null,
        error_message: '',
        attempted_at: now,
        sent_at: null,
        confirmed_at: null,
        confirmed_by_telegram_user_id: null,
        updated_at: now,
      }, { onConflict: 'payment_id' })
      .select('id')
      .single()
    if (deliveryError) throw deliveryError
    deliveryId = delivery.id

    const { data: employeeLink, error: linkError } = await supabase
      .from('employee_salary_telegram_links')
      .select('chat_id, notifications_enabled, preferred_language')
      .eq('salary_profile_id', payment.salary_profile_id)
      .maybeSingle()
    if (linkError) throw linkError
    if (!employeeLink?.chat_id || employeeLink.notifications_enabled === false) {
      await supabase.from('employee_salary_payment_notification_deliveries').update({
        status: 'skipped',
        error_message: 'Employee Telegram is not linked or notifications are disabled',
        updated_at: new Date().toISOString(),
      }).eq('id', deliveryId)
      return { skipped: true, reason: 'employee_not_linked', deliveryId }
    }

    const salaryProfiles = await loadSalaryProfiles(supabase, [payment.salary_profile_id])
    const salaryProfile = salaryProfiles.get(payment.salary_profile_id)
    const remainingDue = salaryProfile
      ? getDailySalaryNotificationSummary(salaryProfile, getTashkentDate()).due
      : 0
    const text = buildEmployeePaymentMessage({
      ...payment,
      employee_name: payment.salary_profile?.employee_name || '',
    }, remainingDue, employeeLink.preferred_language)
    const confirmation = getEmployeePaymentConfirmationCopy(employeeLink.preferred_language)
    const response = await sendTelegramMessage(employeeLink.chat_id, text, {
      reply_markup: {
        inline_keyboard: [[{
          text: confirmation.button,
          callback_data: `salary_payment_confirm:${deliveryId}`,
        }]],
      },
    })
    const telegramMessageId = String(response?.result?.message_id || '')
    const sentAt = new Date().toISOString()
    const { error: sentUpdateError } = await supabase
      .from('employee_salary_payment_notification_deliveries')
      .update({
        status: 'sent',
        telegram_message_id: telegramMessageId,
        sent_at: sentAt,
        error_message: '',
        updated_at: sentAt,
      })
      .eq('id', deliveryId)
    if (sentUpdateError) throw sentUpdateError

    return {
      ok: true,
      sentCount: 1,
      deliveryId,
      telegramMessageId,
    }
  } catch (error) {
    if (deliveryId) {
      await supabase.from('employee_salary_payment_notification_deliveries').update({
        status: 'failed',
        error_message: String(error?.message || error).slice(0, 1000),
        updated_at: new Date().toISOString(),
      }).eq('id', deliveryId)
    }
    throw error
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res)

  try {
    const { type, fineId, paymentId } = await readJson(req)
    const notificationType = type || (paymentId ? 'payment' : fineId ? 'fine' : '')
    if (!['fine', 'payment'].includes(notificationType)) {
      return json(res, 400, { error: 'type must be fine or payment' })
    }
    if (notificationType === 'fine' && !fineId) return json(res, 400, { error: 'fineId is required' })
    if (notificationType === 'payment' && !paymentId) return json(res, 400, { error: 'paymentId is required' })

    const { supabase, user } = await requireExpensesWriteAccess(req)
    const result = notificationType === 'fine'
      ? await notifyFine(supabase, user, fineId)
      : await notifyPayment(supabase, user, paymentId)
    return json(res, 200, result)
  } catch (error) {
    console.error('[telegram/employee-notification]', error)
    return json(res, error?.status || 400, { error: error.message || 'Could not notify Telegram' })
  }
}
