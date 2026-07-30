import { json, methodNotAllowed, readJson, getBearerToken } from './_lib/http.js'
import { getSupabaseAdmin } from './_lib/supabaseAdmin.js'
import { buildEmployeeFineMessage } from './_lib/fineMessages.js'
import {
  buildEmployeePaymentMessage,
  buildEmployeeSalaryEventMessage,
  buildSalaryGroupEventMessage,
  buildSalaryPaymentGroupMessage,
  getEmployeePaymentConfirmationCopy,
} from './_lib/paymentMessages.js'
import { getDailySalaryNotificationSummary, getTashkentDate } from './_lib/salaryMessages.js'
import { loadSalaryProfiles } from './_lib/salaryProfileData.js'
import { sendTelegramMessage } from './_lib/telegram.js'
import {
  getSalaryEventRetryTargets,
  getSalaryPaymentRetryTargets,
} from './_lib/deliveryRetry.js'

const EDITOR_ROLES = new Set(['owner', 'admin'])
const FEATURE_ACCESS_MANAGER_EMAILS = new Set(['dangerhoggish@gmail.com'])
const PENDING_DELIVERY_RETRY_MS = 2 * 60 * 1000
const GROUP_EVENT_CONFIG = {
  bonus: {
    table: 'employee_salary_bonuses',
    select: 'id, salary_profile_id, bonus_date, amount, payment_method, note, created_by, created_by_name, salary_profile:employee_salary_profiles(employee_name)',
  },
  fine: {
    table: 'employee_salary_fines',
    select: 'id, salary_profile_id, fine_date, amount, reason, created_by, created_by_name, salary_profile:employee_salary_profiles(employee_name)',
  },
  absence: {
    table: 'employee_salary_absences',
    select: 'id, salary_profile_id, absence_date, note, created_by, created_by_name, salary_profile:employee_salary_profiles(employee_name)',
  },
}

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

async function loadSalaryGroupTarget(supabase) {
  const fallback = {
    chatId: String(process.env.TELEGRAM_SALARY_PAYMENTS_CHAT_ID || '').trim(),
    language: String(process.env.TELEGRAM_SALARY_PAYMENTS_LANGUAGE || 'ru').trim(),
  }
  const { data, error } = await supabase
    .from('telegram_notification_targets')
    .select('chat_id, language, is_enabled')
    .eq('target_key', 'salary_events')
    .maybeSingle()
  if (error) {
    const missingMigration = ['42P01', 'PGRST205'].includes(error.code)
      || (
        /telegram_notification_targets/i.test(error.message || '')
        && /does not exist|schema cache/i.test(error.message || '')
      )
    if (!missingMigration) throw error
    return fallback
  }
  if (!data?.is_enabled) return { chatId: '', language: data?.language || fallback.language }
  return {
    chatId: String(data.chat_id || fallback.chatId).trim(),
    language: String(data.language || fallback.language || 'ru').trim(),
  }
}

async function loadOwnedSalaryEvent(supabase, user, type, eventId) {
  const config = GROUP_EVENT_CONFIG[type]
  if (!config) throw Object.assign(new Error('Unsupported salary event type'), { status: 400 })
  const { data, error } = await supabase
    .from(config.table)
    .select(config.select)
    .eq('id', eventId)
    .maybeSingle()
  if (error) throw error
  if (!data || data.created_by !== user.id) {
    throw Object.assign(new Error('Salary event not found'), { status: 404 })
  }
  return {
    ...data,
    employee_name: data.salary_profile?.employee_name || '',
  }
}

function getTelegramMessageId(response) {
  const messageId = String(response?.result?.message_id || '').trim()
  if (!messageId) throw new Error('Telegram did not return a message id')
  return messageId
}

function savedGroupDeliveryResult(delivery, duplicate = true) {
  return {
    status: delivery?.status || 'pending',
    duplicate,
    telegramMessageId: delivery?.telegram_message_id || null,
    sentAt: delivery?.sent_at || null,
    errorMessage: delivery?.error_message || '',
  }
}

function savedEmployeeEventDeliveryResult(delivery, duplicate = true) {
  return {
    status: delivery?.employee_status || 'pending',
    duplicate,
    telegramMessageId: delivery?.employee_telegram_message_id || null,
    sentAt: delivery?.employee_sent_at || null,
    errorMessage: delivery?.employee_error_message || '',
  }
}

async function deliverSalaryGroupEvent(supabase, type, event, remainingDue) {
  const { data: existing, error: existingError } = await supabase
    .from('employee_salary_group_notification_deliveries')
    .select('*')
    .eq('event_type', type)
    .eq('event_id', event.id)
    .maybeSingle()
  if (existingError) throw existingError
  if (!getSalaryEventRetryTargets(existing, {
    pendingRetryMs: PENDING_DELIVERY_RETRY_MS,
  }).group) {
    return savedGroupDeliveryResult(existing)
  }

  const target = await loadSalaryGroupTarget(supabase)
  const now = new Date().toISOString()
  const pendingFields = {
    event_type: type,
    event_id: event.id,
    salary_profile_id: event.salary_profile_id,
    status: target.chatId ? 'pending' : 'skipped',
    telegram_chat_id: target.chatId || null,
    telegram_message_id: null,
    error_message: target.chatId ? '' : 'Salary events Telegram group is not configured',
    attempted_at: now,
    sent_at: null,
    updated_at: now,
  }
  let delivery
  if (!existing) {
    const created = await supabase
      .from('employee_salary_group_notification_deliveries')
      .insert(pendingFields)
      .select('id')
      .single()
    if (created.error?.code === '23505') {
      const { data: concurrent, error: concurrentError } = await supabase
        .from('employee_salary_group_notification_deliveries')
        .select('*')
        .eq('event_type', type)
        .eq('event_id', event.id)
        .single()
      if (concurrentError) throw concurrentError
      return savedGroupDeliveryResult(concurrent)
    }
    if (created.error) throw created.error
    delivery = created.data
  } else {
    const claimed = await supabase
      .from('employee_salary_group_notification_deliveries')
      .update(pendingFields)
      .eq('id', existing.id)
      .eq('updated_at', existing.updated_at)
      .select('id')
      .maybeSingle()
    if (claimed.error) throw claimed.error
    if (!claimed.data) {
      const { data: concurrent, error: concurrentError } = await supabase
        .from('employee_salary_group_notification_deliveries')
        .select('*')
        .eq('id', existing.id)
        .single()
      if (concurrentError) throw concurrentError
      return savedGroupDeliveryResult(concurrent)
    }
    delivery = claimed.data
  }

  if (!target.chatId) {
    return {
      status: 'skipped',
      telegramMessageId: null,
      sentAt: null,
      errorMessage: 'Salary events Telegram group is not configured',
    }
  }

  try {
    const text = buildSalaryGroupEventMessage(type, event, remainingDue, target.language)
    const response = await sendTelegramMessage(target.chatId, text)
    const sentAt = new Date().toISOString()
    const telegramMessageId = getTelegramMessageId(response)
    const { error: updateError } = await supabase
      .from('employee_salary_group_notification_deliveries')
      .update({
        status: 'sent',
        telegram_message_id: telegramMessageId,
        error_message: '',
        sent_at: sentAt,
        updated_at: sentAt,
      })
      .eq('id', delivery.id)
    if (updateError) throw updateError
    return { status: 'sent', telegramMessageId, sentAt, errorMessage: '' }
  } catch (error) {
    const errorMessage = String(error?.message || error).slice(0, 1000)
    await supabase
      .from('employee_salary_group_notification_deliveries')
      .update({
        status: 'failed',
        error_message: errorMessage,
        updated_at: new Date().toISOString(),
      })
      .eq('id', delivery.id)
    return {
      status: 'failed',
      telegramMessageId: null,
      sentAt: null,
      errorMessage,
    }
  }
}

async function deliverEmployeeSalaryEvent(supabase, type, event, remainingDue) {
  const { data: existing, error: existingError } = await supabase
    .from('employee_salary_group_notification_deliveries')
    .select('*')
    .eq('event_type', type)
    .eq('event_id', event.id)
    .single()
  if (existingError) throw existingError
  if (!getSalaryEventRetryTargets(existing, {
    pendingRetryMs: PENDING_DELIVERY_RETRY_MS,
  }).employee) {
    return savedEmployeeEventDeliveryResult(existing)
  }

  const { data: employeeLink, error: linkError } = await supabase
    .from('employee_salary_telegram_links')
    .select('chat_id, notifications_enabled, preferred_language')
    .eq('salary_profile_id', event.salary_profile_id)
    .maybeSingle()
  if (linkError) throw linkError

  const employeeChatId = employeeLink?.notifications_enabled === false
    ? ''
    : String(employeeLink?.chat_id || '').trim()
  const now = new Date().toISOString()
  const pendingFields = {
    employee_status: employeeChatId ? 'pending' : 'skipped',
    employee_chat_id: employeeChatId || null,
    employee_telegram_message_id: null,
    employee_error_message: employeeChatId
      ? ''
      : 'Employee Telegram is not linked or notifications are disabled',
    employee_attempted_at: now,
    employee_sent_at: null,
    updated_at: now,
  }
  let claimQuery = supabase
    .from('employee_salary_group_notification_deliveries')
    .update(pendingFields)
    .eq('id', existing.id)
    .eq('employee_status', existing.employee_status)
  if (existing.employee_attempted_at) {
    claimQuery = claimQuery.eq('employee_attempted_at', existing.employee_attempted_at)
  }
  const claimed = await claimQuery.select('*').maybeSingle()
  if (claimed.error) throw claimed.error
  if (!claimed.data) {
    const { data: concurrent, error: concurrentError } = await supabase
      .from('employee_salary_group_notification_deliveries')
      .select('*')
      .eq('id', existing.id)
      .single()
    if (concurrentError) throw concurrentError
    return savedEmployeeEventDeliveryResult(concurrent)
  }
  if (!employeeChatId) {
    return savedEmployeeEventDeliveryResult(claimed.data, false)
  }

  try {
    const text = type === 'fine'
      ? buildEmployeeFineMessage(event)
      : buildEmployeeSalaryEventMessage(
          type,
          event,
          remainingDue,
          employeeLink.preferred_language
        )
    const response = await sendTelegramMessage(employeeChatId, text)
    const sentAt = new Date().toISOString()
    const telegramMessageId = getTelegramMessageId(response)
    const { error: updateError } = await supabase
      .from('employee_salary_group_notification_deliveries')
      .update({
        employee_status: 'sent',
        employee_telegram_message_id: telegramMessageId,
        employee_error_message: '',
        employee_sent_at: sentAt,
        updated_at: sentAt,
      })
      .eq('id', existing.id)
    if (updateError) throw updateError
    return { status: 'sent', telegramMessageId, sentAt, errorMessage: '' }
  } catch (error) {
    const errorMessage = String(error?.message || error).slice(0, 1000)
    await supabase
      .from('employee_salary_group_notification_deliveries')
      .update({
        employee_status: 'failed',
        employee_error_message: errorMessage,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
    return {
      status: 'failed',
      telegramMessageId: null,
      sentAt: null,
      errorMessage,
    }
  }
}

function normalizeDeliverySettlement(settled) {
  return settled.status === 'fulfilled'
    ? settled.value
    : {
        status: 'failed',
        telegramMessageId: null,
        sentAt: null,
        errorMessage: String(settled.reason?.message || settled.reason).slice(0, 1000),
      }
}

async function notifySalaryEvent(supabase, user, type, eventId) {
  const event = await loadOwnedSalaryEvent(supabase, user, type, eventId)
  const salaryProfiles = await loadSalaryProfiles(supabase, [event.salary_profile_id])
  const salaryProfile = salaryProfiles.get(event.salary_profile_id)
  const remainingDue = salaryProfile
    ? getDailySalaryNotificationSummary(salaryProfile, getTashkentDate()).due
    : 0
  const [groupSettled] = await Promise.allSettled([
    deliverSalaryGroupEvent(supabase, type, event, remainingDue),
  ])
  const [employeeSettled] = await Promise.allSettled([
    deliverEmployeeSalaryEvent(supabase, type, event, remainingDue),
  ])
  const employee = normalizeDeliverySettlement(employeeSettled)
  const group = normalizeDeliverySettlement(groupSettled)
  const employeeSent = employee.status === 'sent'
  const groupSent = group.status === 'sent'
  return {
    ok: employeeSent || groupSent,
    allSent: employeeSent && groupSent,
    employee,
    group,
  }
}

async function notifyPayment(supabase, user, paymentId) {
  let deliveryId = null
  let employeeShouldSend = false
  let groupShouldSend = false
  let employeeAlreadyDelivered = false
  let groupAlreadyDelivered = false
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
      .select('*')
      .eq('payment_id', payment.id)
      .maybeSingle()
    if (existingError) throw existingError
    const retryTargets = getSalaryPaymentRetryTargets(existingDelivery, {
      pendingRetryMs: PENDING_DELIVERY_RETRY_MS,
    })
    employeeShouldSend = retryTargets.employee
    groupShouldSend = retryTargets.group
    employeeAlreadyDelivered = ['sent', 'confirmed'].includes(existingDelivery?.status)
    groupAlreadyDelivered = existingDelivery?.group_status === 'sent'
    if (!employeeShouldSend && !groupShouldSend) {
      return {
        ok: employeeAlreadyDelivered || groupAlreadyDelivered,
        allSent: employeeAlreadyDelivered && groupAlreadyDelivered,
        duplicate: true,
        deliveryId: existingDelivery.id,
        employee: {
          status: existingDelivery.status,
          telegramMessageId: existingDelivery.telegram_message_id,
          sentAt: existingDelivery.sent_at,
          errorMessage: existingDelivery.error_message || '',
        },
        group: {
          status: existingDelivery.group_status,
          telegramMessageId: existingDelivery.group_telegram_message_id,
          sentAt: existingDelivery.group_sent_at,
          errorMessage: existingDelivery.group_error_message || '',
        },
      }
    }

    const now = new Date().toISOString()
    const groupTarget = groupShouldSend
      ? await loadSalaryGroupTarget(supabase)
      : {
          chatId: String(existingDelivery?.group_chat_id || '').trim(),
          language: 'ru',
        }
    const groupChatId = groupTarget.chatId
    const groupLanguage = groupTarget.language
    let delivery = existingDelivery
    if (!delivery) {
      const { data: createdDelivery, error: deliveryError } = await supabase
        .from('employee_salary_payment_notification_deliveries')
        .insert({
          payment_id: payment.id,
          salary_profile_id: payment.salary_profile_id,
          status: 'pending',
          telegram_message_id: null,
          error_message: '',
          attempted_at: now,
          group_status: groupChatId ? 'pending' : 'skipped',
          group_chat_id: groupChatId || null,
          group_telegram_message_id: null,
          group_error_message: groupChatId
            ? ''
            : 'Salary payment Telegram group is not configured',
          group_attempted_at: now,
          group_sent_at: null,
          updated_at: now,
        })
        .select('*')
        .single()
      if (deliveryError?.code === '23505') {
        const { data: concurrent, error: concurrentError } = await supabase
          .from('employee_salary_payment_notification_deliveries')
          .select('*')
          .eq('payment_id', payment.id)
          .single()
        if (concurrentError) throw concurrentError
        return {
          ok: ['sent', 'confirmed'].includes(concurrent.status)
            || concurrent.group_status === 'sent',
          allSent: ['sent', 'confirmed'].includes(concurrent.status)
            && concurrent.group_status === 'sent',
          duplicate: true,
          deliveryId: concurrent.id,
          employee: {
            status: concurrent.status,
            telegramMessageId: concurrent.telegram_message_id,
            sentAt: concurrent.sent_at,
            errorMessage: concurrent.error_message || '',
          },
          group: {
            status: concurrent.group_status,
            telegramMessageId: concurrent.group_telegram_message_id,
            sentAt: concurrent.group_sent_at,
            errorMessage: concurrent.group_error_message || '',
          },
        }
      }
      if (deliveryError) throw deliveryError
      delivery = createdDelivery
    } else {
      const retryFields = { updated_at: now }
      if (employeeShouldSend) {
        Object.assign(retryFields, {
          status: 'pending',
          telegram_message_id: null,
          error_message: '',
          attempted_at: now,
          sent_at: null,
        })
      }
      if (groupShouldSend) {
        Object.assign(retryFields, {
          group_status: groupChatId ? 'pending' : 'skipped',
          group_chat_id: groupChatId || null,
          group_telegram_message_id: null,
          group_error_message: groupChatId
            ? ''
            : 'Salary payment Telegram group is not configured',
          group_attempted_at: now,
          group_sent_at: null,
        })
      }
      const claim = await supabase
        .from('employee_salary_payment_notification_deliveries')
        .update(retryFields)
        .eq('id', delivery.id)
        .eq('updated_at', delivery.updated_at)
        .select('*')
        .maybeSingle()
      if (claim.error) throw claim.error
      if (!claim.data) {
        const { data: concurrent, error: concurrentError } = await supabase
          .from('employee_salary_payment_notification_deliveries')
          .select('*')
          .eq('id', delivery.id)
          .single()
        if (concurrentError) throw concurrentError
        return {
          ok: ['sent', 'confirmed'].includes(concurrent.status)
            || concurrent.group_status === 'sent',
          allSent: ['sent', 'confirmed'].includes(concurrent.status)
            && concurrent.group_status === 'sent',
          duplicate: true,
          deliveryId: concurrent.id,
          employee: {
            status: concurrent.status,
            telegramMessageId: concurrent.telegram_message_id,
            sentAt: concurrent.sent_at,
            errorMessage: concurrent.error_message || '',
          },
          group: {
            status: concurrent.group_status,
            telegramMessageId: concurrent.group_telegram_message_id,
            sentAt: concurrent.group_sent_at,
            errorMessage: concurrent.group_error_message || '',
          },
        }
      }
      delivery = claim.data
    }
    deliveryId = delivery.id

    const salaryProfiles = await loadSalaryProfiles(supabase, [payment.salary_profile_id])
    const salaryProfile = salaryProfiles.get(payment.salary_profile_id)
    const remainingDue = salaryProfile
      ? getDailySalaryNotificationSummary(salaryProfile, getTashkentDate()).due
      : 0
    const paymentWithEmployee = {
      ...payment,
      employee_name: payment.salary_profile?.employee_name || '',
    }

    const employeeDelivery = !employeeShouldSend
      ? Promise.resolve({
          status: delivery.status,
          telegramMessageId: delivery.telegram_message_id,
          sentAt: delivery.sent_at,
          errorMessage: delivery.error_message || '',
        })
      : (async () => {
          const { data: employeeLink, error: linkError } = await supabase
            .from('employee_salary_telegram_links')
            .select('chat_id, notifications_enabled, preferred_language')
            .eq('salary_profile_id', payment.salary_profile_id)
            .maybeSingle()
          if (linkError) throw linkError
          if (!employeeLink?.chat_id || employeeLink.notifications_enabled === false) {
            return {
              status: 'skipped',
              telegramMessageId: null,
              sentAt: null,
              errorMessage: 'Employee Telegram is not linked or notifications are disabled',
            }
          }
          const text = buildEmployeePaymentMessage(
            paymentWithEmployee,
            remainingDue,
            employeeLink.preferred_language
          )
          const confirmation = getEmployeePaymentConfirmationCopy(employeeLink.preferred_language)
          const response = await sendTelegramMessage(employeeLink.chat_id, text, {
            reply_markup: {
              inline_keyboard: [[{
                text: confirmation.button,
                callback_data: `salary_payment_confirm:${deliveryId}`,
              }]],
            },
          })
          return {
            status: 'sent',
            telegramMessageId: getTelegramMessageId(response),
            sentAt: new Date().toISOString(),
            errorMessage: '',
          }
        })()

    const groupDelivery = !groupShouldSend
      ? Promise.resolve({
          status: delivery.group_status,
          telegramMessageId: delivery.group_telegram_message_id,
          sentAt: delivery.group_sent_at,
          errorMessage: delivery.group_error_message || '',
        })
      : (async () => {
          if (!groupChatId) {
            return {
              status: 'skipped',
              telegramMessageId: null,
              sentAt: null,
              errorMessage: 'Salary payment Telegram group is not configured',
            }
          }
          const text = buildSalaryPaymentGroupMessage(
            paymentWithEmployee,
            remainingDue,
            groupLanguage
          )
          const response = await sendTelegramMessage(groupChatId, text)
          return {
            status: 'sent',
            telegramMessageId: getTelegramMessageId(response),
            sentAt: new Date().toISOString(),
            errorMessage: '',
          }
        })()

    const [employeeSettled, groupSettled] = await Promise.allSettled([
      employeeDelivery,
      groupDelivery,
    ])
    const normalizeDelivery = settled => (
      settled.status === 'fulfilled'
        ? settled.value
        : {
            status: 'failed',
            telegramMessageId: null,
            sentAt: null,
            errorMessage: String(settled.reason?.message || settled.reason).slice(0, 1000),
          }
    )
    const employeeResult = normalizeDelivery(employeeSettled)
    const groupResult = normalizeDelivery(groupSettled)
    const updatedAt = new Date().toISOString()
    const deliveredFields = { updated_at: updatedAt }
    if (employeeShouldSend) {
      Object.assign(deliveredFields, {
        status: employeeResult.status,
        telegram_message_id: employeeResult.telegramMessageId,
        error_message: employeeResult.errorMessage,
        sent_at: employeeResult.sentAt,
      })
    }
    if (groupShouldSend) {
      Object.assign(deliveredFields, {
        group_status: groupResult.status,
        group_chat_id: groupChatId || delivery.group_chat_id || null,
        group_telegram_message_id: groupResult.telegramMessageId,
        group_error_message: groupResult.errorMessage,
        group_sent_at: groupResult.sentAt,
      })
    }
    const { error: sentUpdateError } = await supabase
      .from('employee_salary_payment_notification_deliveries')
      .update(deliveredFields)
      .eq('id', deliveryId)
    if (sentUpdateError) throw sentUpdateError

    const employeeSent = ['sent', 'confirmed'].includes(employeeResult.status)
    const groupSent = groupResult.status === 'sent'
    return {
      ok: employeeSent || groupSent,
      allSent: employeeSent && groupSent,
      deliveryId,
      employee: employeeResult,
      group: groupResult,
    }
  } catch (error) {
    if (deliveryId) {
      const errorMessage = String(error?.message || error).slice(0, 1000)
      const failureFields = { updated_at: new Date().toISOString() }
      if (employeeShouldSend) {
        failureFields.status = 'failed'
        failureFields.error_message = errorMessage
      }
      if (groupShouldSend) {
        failureFields.group_status = 'failed'
        failureFields.group_error_message = errorMessage
      }
      await supabase
        .from('employee_salary_payment_notification_deliveries')
        .update(failureFields)
        .eq('id', deliveryId)
    }
    throw error
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res)

  try {
    const { type, fineId, paymentId, bonusId, absenceId } = await readJson(req)
    const notificationType = type
      || (paymentId ? 'payment' : fineId ? 'fine' : bonusId ? 'bonus' : absenceId ? 'absence' : '')
    const eventIds = {
      payment: paymentId,
      fine: fineId,
      bonus: bonusId,
      absence: absenceId,
    }
    if (!['fine', 'payment', 'bonus', 'absence'].includes(notificationType)) {
      return json(res, 400, { error: 'type must be payment, fine, bonus, or absence' })
    }
    if (!eventIds[notificationType]) {
      return json(res, 400, { error: `${notificationType}Id is required` })
    }

    const { supabase, user } = await requireExpensesWriteAccess(req)
    let result
    if (notificationType === 'payment') {
      result = await notifyPayment(supabase, user, paymentId)
    } else {
      result = await notifySalaryEvent(
        supabase,
        user,
        notificationType,
        eventIds[notificationType]
      )
    }
    return json(res, 200, result)
  } catch (error) {
    console.error('[telegram/employee-notification]', error)
    return json(res, error?.status || 400, { error: error.message || 'Could not notify Telegram' })
  }
}
