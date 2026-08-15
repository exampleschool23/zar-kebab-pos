import { json, methodNotAllowed, readJson, getBearerToken } from './_lib/http.js'
import { getSupabaseAdmin } from './_lib/supabaseAdmin.js'
import { buildEmployeeFineMessage } from './_lib/fineMessages.js'
import {
  buildEmployeePaymentMessage,
  buildEmployeeSalaryRateMessage,
  buildEmployeeSalaryEventMessage,
  buildSalaryGroupEventMessage,
  buildSalaryPaymentGroupMessage,
  buildSalaryRateGroupMessage,
  buildSalaryTeamEventMessage,
  getEmployeePaymentConfirmationCopy,
} from './_lib/paymentMessages.js'
import { getDailySalaryNotificationSummary, getTashkentDate } from './_lib/salaryMessages.js'
import { loadSalaryProfiles } from './_lib/salaryProfileData.js'
import { sendTelegramMessage } from './_lib/telegram.js'
import { buildInvestorIncomeGroupMessage } from './_lib/investorIncomeMessages.js'
import { buildDailyBazaarGroupMessage } from './_lib/dailyBazaarMessages.js'
import {
  getSalaryEventRetryTargets,
  getSalaryPaymentRetryTargets,
} from './_lib/deliveryRetry.js'

const EDITOR_ROLES = new Set(['owner', 'admin'])
const FEATURE_ACCESS_MANAGER_EMAILS = new Set(['dangerhoggish@gmail.com'])
const PENDING_DELIVERY_RETRY_MS = 2 * 60 * 1000
const TEAM_EVENT_TYPES = new Set(['bonus', 'fine', 'absence'])
const COMBINED_DAILY_KPI_EMPLOYEE_REASON = 'Automatic KPI is included in the combined daily salary summary'
const GROUP_EVENT_CONFIG = {
  bonus: {
    table: 'employee_salary_bonuses',
    select: 'id, salary_profile_id, bonus_date, amount, payment_method, note, created_by, created_by_name, source_type, source_metadata, salary_profile:employee_salary_profiles(employee_name)',
    legacySelect: 'id, salary_profile_id, bonus_date, amount, payment_method, note, created_by, created_by_name, salary_profile:employee_salary_profiles(employee_name)',
  },
  fine: {
    table: 'employee_salary_fines',
    select: 'id, salary_profile_id, fine_date, amount, reason, created_by, created_by_name, salary_profile:employee_salary_profiles(employee_name)',
  },
  absence: {
    table: 'employee_salary_absences',
    select: 'id, salary_profile_id, absence_date, note, created_by, created_by_name, salary_profile:employee_salary_profiles(employee_name)',
  },
  rate: {
    table: 'employee_salary_rates',
    select: 'id, salary_profile_id, effective_from, amount, rate_unit, note, created_by, created_at, salary_profile:employee_salary_profiles(employee_name)',
  },
}

function isMissingKpiBonusSourceColumns(error) {
  const message = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return (message.includes('source_type') || message.includes('source_metadata')) && (
    message.includes('schema cache') ||
    message.includes('column') ||
    message.includes('42703') ||
    message.includes('pgrst204')
  )
}

function normalizeRole(role) {
  const value = String(role || '').toLowerCase()
  return ['waiter', 'cashier', 'kitchen'].includes(value) ? 'admin' : value
}

async function requireExpensesWriteAccess(req) {
  return requireFeatureWriteAccess(req, 'expenses')
}

async function requireBazaarWriteAccess(req) {
  return requireFeatureWriteAccess(req, 'bazaar')
}

async function requireFeatureWriteAccess(req, featureKey) {
  const token = getBearerToken(req)
  if (!token) throw Object.assign(new Error('Authentication required'), { status: 401 })

  const supabase = getSupabaseAdmin()
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) throw Object.assign(new Error('Invalid or expired session'), { status: 401 })

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, status, full_name, email, feature_access')
    .eq('id', user.id)
    .maybeSingle()
  if (profileError) throw profileError

  const role = normalizeRole(profile?.role)
  const access = Array.isArray(profile?.feature_access) ? profile.feature_access : null
  const isPrimaryOwner = role === 'owner'
    && FEATURE_ACCESS_MANAGER_EMAILS.has(String(profile?.email || '').trim().toLowerCase())
  const hasImplicitOwnerAccess = role === 'owner' && access === null
  const hasExplicitFeatureWrite = EDITOR_ROLES.has(role) && (
    featureKey === 'expenses'
      ? access?.includes('expenses')
      : featureKey === 'bazaar' && access?.includes('bazaar')
  )
  if (profile?.status !== 'active' || (!isPrimaryOwner && !hasImplicitOwnerAccess && !hasExplicitFeatureWrite)) {
    throw Object.assign(new Error('Forbidden'), { status: 403 })
  }

  return {
    supabase,
    user,
    actorName: profile?.full_name || profile?.email || user.email || '',
  }
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

async function loadSalaryTeamTarget(supabase) {
  const fallback = {
    chatId: String(process.env.TELEGRAM_TEAM_CHAT_ID || '').trim(),
    language: String(process.env.TELEGRAM_TEAM_LANGUAGE || 'ru').trim(),
  }
  const { data, error } = await supabase
    .from('telegram_notification_targets')
    .select('chat_id, language, is_enabled')
    .eq('target_key', 'team_events')
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
  if (!data) return fallback
  if (!data.is_enabled) return { chatId: '', language: data.language || fallback.language }
  return {
    chatId: String(data.chat_id || fallback.chatId).trim(),
    language: String(data.language || fallback.language || 'ru').trim(),
  }
}

async function loadOwnedSalaryEvent(supabase, user, type, eventId, actorName = '') {
  const config = GROUP_EVENT_CONFIG[type]
  if (!config) throw Object.assign(new Error('Unsupported salary event type'), { status: 400 })
  let { data, error } = await supabase
    .from(config.table)
    .select(config.select)
    .eq('id', eventId)
    .maybeSingle()
  if (error && config.legacySelect && isMissingKpiBonusSourceColumns(error)) {
    ;({ data, error } = await supabase
      .from(config.table)
      .select(config.legacySelect)
      .eq('id', eventId)
      .maybeSingle())
  }
  if (error) throw error
  const isAutomaticKpiBonus = type === 'bonus'
    && data?.created_by == null
    && data?.source_type === 'daily_kpi'
  if (!data || (data.created_by !== user.id && !isAutomaticKpiBonus)) {
    throw Object.assign(new Error('Salary event not found'), { status: 404 })
  }
  let previousRate = null
  if (type === 'rate') {
    const { data: previous, error: previousError } = await supabase
      .from('employee_salary_rates')
      .select('id, amount, rate_unit, effective_from, created_at')
      .eq('salary_profile_id', data.salary_profile_id)
      .neq('id', data.id)
      .lte('effective_from', data.effective_from)
      .lte('created_at', data.created_at)
      .order('effective_from', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (previousError) throw previousError
    previousRate = previous || null
  }
  return {
    ...data,
    employee_name: data.salary_profile?.employee_name || '',
    created_by_name: data.created_by_name || actorName,
    previous_rate: previousRate,
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

function savedTeamDeliveryResult(delivery, duplicate = true) {
  return {
    status: delivery?.team_status || 'pending',
    duplicate,
    telegramMessageId: delivery?.team_telegram_message_id || null,
    sentAt: delivery?.team_sent_at || null,
    errorMessage: delivery?.team_error_message || '',
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
    const eventLanguage = type === 'bonus' && event?.source_type === 'daily_kpi'
      ? 'ru'
      : target.language
    const text = type === 'rate'
      ? buildSalaryRateGroupMessage(event, remainingDue, target.language)
      : buildSalaryGroupEventMessage(type, event, remainingDue, eventLanguage)
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

async function deliverSalaryTeamEvent(supabase, type, event) {
  if (!TEAM_EVENT_TYPES.has(type)) {
    return {
      status: 'skipped',
      telegramMessageId: null,
      sentAt: null,
      errorMessage: 'ZarKebab Team notifications apply only to bonuses, fines, and absences',
    }
  }

  const { data: existing, error: existingError } = await supabase
    .from('employee_salary_group_notification_deliveries')
    .select('*')
    .eq('event_type', type)
    .eq('event_id', event.id)
    .single()
  if (existingError) throw existingError
  if (!getSalaryEventRetryTargets(existing, {
    pendingRetryMs: PENDING_DELIVERY_RETRY_MS,
  }).team) {
    return savedTeamDeliveryResult(existing)
  }

  const target = await loadSalaryTeamTarget(supabase)
  const now = new Date().toISOString()
  const pendingFields = {
    team_status: target.chatId ? 'pending' : 'skipped',
    team_chat_id: target.chatId || null,
    team_telegram_message_id: null,
    team_error_message: target.chatId ? '' : 'ZarKebab Team Telegram group is not configured',
    team_attempted_at: now,
    team_sent_at: null,
    updated_at: now,
  }
  let claimQuery = supabase
    .from('employee_salary_group_notification_deliveries')
    .update(pendingFields)
    .eq('id', existing.id)
    .eq('team_status', existing.team_status)
  if (existing.team_attempted_at) {
    claimQuery = claimQuery.eq('team_attempted_at', existing.team_attempted_at)
  } else {
    claimQuery = claimQuery.is('team_attempted_at', null)
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
    return savedTeamDeliveryResult(concurrent)
  }
  if (!target.chatId) {
    return savedTeamDeliveryResult(claimed.data, false)
  }

  try {
    const eventLanguage = type === 'bonus' && event?.source_type === 'daily_kpi'
      ? 'ru'
      : target.language
    const text = buildSalaryTeamEventMessage(type, event, eventLanguage)
    const response = await sendTelegramMessage(target.chatId, text)
    const sentAt = new Date().toISOString()
    const telegramMessageId = getTelegramMessageId(response)
    const { error: updateError } = await supabase
      .from('employee_salary_group_notification_deliveries')
      .update({
        team_status: 'sent',
        team_telegram_message_id: telegramMessageId,
        team_error_message: '',
        team_sent_at: sentAt,
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
        team_status: 'failed',
        team_error_message: errorMessage,
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
      : type === 'rate'
        ? buildEmployeeSalaryRateMessage(
            event,
            remainingDue,
            employeeLink.preferred_language
          )
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

async function requireQueuedSalaryRateDelivery(supabase, eventId) {
  const { data, error } = await supabase
    .from('employee_salary_group_notification_deliveries')
    .select('id')
    .eq('event_type', 'rate')
    .eq('event_id', eventId)
    .maybeSingle()
  if (error) throw error
  if (!data) {
    throw Object.assign(
      new Error('Initial salary setup is not a salary-change notification'),
      { status: 409 }
    )
  }
}

async function notifySalaryEvent(supabase, user, actorName, type, eventId) {
  const event = await loadOwnedSalaryEvent(supabase, user, type, eventId, actorName)
  return notifyLoadedSalaryEvent(supabase, type, event, {
    includeEmployee: !(type === 'bonus' && event.source_type === 'daily_kpi'),
  })
}

async function notifyLoadedSalaryEvent(supabase, type, event, {
  includeEmployee = true,
} = {}) {
  if (type === 'rate') {
    await requireQueuedSalaryRateDelivery(supabase, event.id)
  }
  const salaryProfiles = await loadSalaryProfiles(supabase, [event.salary_profile_id])
  const salaryProfile = salaryProfiles.get(event.salary_profile_id)
  const remainingDue = salaryProfile
    ? getDailySalaryNotificationSummary(salaryProfile, getTashkentDate()).due
    : 0
  const [groupSettled] = await Promise.allSettled([
    deliverSalaryGroupEvent(supabase, type, event, remainingDue),
  ])
  const employeeDelivery = includeEmployee
    ? deliverEmployeeSalaryEvent(supabase, type, event, remainingDue)
    : Promise.resolve({
        status: 'skipped',
        telegramMessageId: null,
        sentAt: null,
        errorMessage: COMBINED_DAILY_KPI_EMPLOYEE_REASON,
      })
  const [employeeSettled, teamSettled] = await Promise.allSettled([
    employeeDelivery,
    deliverSalaryTeamEvent(supabase, type, event),
  ])
  const employee = normalizeDeliverySettlement(employeeSettled)
  const group = normalizeDeliverySettlement(groupSettled)
  const team = normalizeDeliverySettlement(teamSettled)
  const employeeSent = employee.status === 'sent'
  const employeeSatisfied = !includeEmployee || employeeSent
  const groupSent = group.status === 'sent'
  const teamSent = team.status === 'sent'
  const teamRequired = TEAM_EVENT_TYPES.has(type)
  return {
    ok: employeeSatisfied || groupSent || teamSent,
    allSent: employeeSatisfied && groupSent && (!teamRequired || teamSent),
    employeeIncludedInDailySummary: !includeEmployee,
    employee,
    group,
    team,
  }
}

export async function notifyAutomaticKpiBonus(supabase, bonusId) {
  const event = await loadOwnedSalaryEvent(
    supabase,
    { id: null },
    'bonus',
    bonusId,
    'Автоматический KPI'
  )
  if (event.source_type !== 'daily_kpi' || event.created_by != null) {
    throw Object.assign(new Error('Automatic KPI bonus not found'), { status: 404 })
  }
  return notifyLoadedSalaryEvent(supabase, 'bonus', event, {
    includeEmployee: false,
  })
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

async function notifyInvestorIncome(supabase, user, expenseId) {
  const { data: expense, error } = await supabase
    .from('expenses')
    .select('id, entry_type, expense_date, category, payment_method, amount, vendor, description, created_by, created_by_name')
    .eq('id', expenseId)
    .maybeSingle()
  if (error) throw error
  if (
    !expense ||
    expense.created_by !== user.id ||
    expense.entry_type !== 'income' ||
    expense.category !== 'investor_support'
  ) {
    throw Object.assign(new Error('Investor income entry not found'), { status: 404 })
  }

  const target = await loadSalaryGroupTarget(supabase)
  if (!target.chatId) {
    throw Object.assign(new Error('Salary Events Telegram channel is not configured'), { status: 503 })
  }
  const currentDate = getTashkentDate()
  const currentMonthStart = `${currentDate.slice(0, 7)}-01`
  const [year, month] = currentMonthStart.split('-').map(Number)
  const nextMonthStart = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10)
  const { data: currentMonthEntries, error: currentMonthError } = await supabase
    .from('expenses')
    .select('amount')
    .eq('entry_type', 'income')
    .eq('category', 'investor_support')
    .gte('expense_date', currentMonthStart)
    .lt('expense_date', nextMonthStart)
  if (currentMonthError) throw currentMonthError
  const currentMonthTotal = (currentMonthEntries || []).reduce(
    (total, entry) => total + (Number(entry?.amount) || 0),
    0
  )
  const text = buildInvestorIncomeGroupMessage(expense, target.language, currentMonthTotal)
  const response = await sendTelegramMessage(target.chatId, text)
  return {
    ok: true,
    target: 'salary_events',
    telegramMessageId: getTelegramMessageId(response),
  }
}

async function notifyDailyBazaar(supabase, purchaseDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(purchaseDate || ''))) {
    throw Object.assign(new Error('A valid Bazaar purchase date is required'), { status: 400 })
  }
  const { data: purchases, error } = await supabase
    .from('bazaar_purchases')
    .select(`
      id,
      purchase_date,
      total_amount,
      entry_source,
      bazaar_purchase_items (
        id,
        product_name,
        quantity,
        unit,
        line_total,
        sort_order
      )
    `)
    .eq('purchase_date', purchaseDate)
    .eq('entry_source', 'daily_bazaar')
    .order('created_at', { ascending: true })
  if (error) throw error
  const availablePurchases = (purchases || []).filter(purchase => (
    (purchase.bazaar_purchase_items || []).length > 0
  ))
  if (availablePurchases.length === 0) {
    throw Object.assign(new Error('No Daily Bazaar entries found for the selected date'), { status: 404 })
  }

  const target = await loadSalaryGroupTarget(supabase)
  if (!target.chatId) {
    throw Object.assign(new Error('Salary Events Telegram channel is not configured'), { status: 503 })
  }
  const text = buildDailyBazaarGroupMessage(availablePurchases, purchaseDate, target.language)
  const response = await sendTelegramMessage(target.chatId, text)
  return {
    ok: true,
    target: 'salary_events',
    telegramMessageId: getTelegramMessageId(response),
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res)

  try {
    const { type, fineId, paymentId, bonusId, absenceId, rateId, expenseId, purchaseDate } = await readJson(req)
    const notificationType = type
      || (paymentId
        ? 'payment'
        : fineId
          ? 'fine'
          : bonusId
            ? 'bonus'
            : absenceId
              ? 'absence'
              : rateId
                ? 'rate'
                : expenseId
                  ? 'investor_income'
                  : purchaseDate
                    ? 'daily_bazaar'
                : '')
    const eventIds = {
      payment: paymentId,
      fine: fineId,
      bonus: bonusId,
      absence: absenceId,
      rate: rateId,
      investor_income: expenseId,
      daily_bazaar: purchaseDate,
    }
    if (!['fine', 'payment', 'bonus', 'absence', 'rate', 'investor_income', 'daily_bazaar'].includes(notificationType)) {
      return json(res, 400, { error: 'Unsupported notification type' })
    }
    if (!eventIds[notificationType]) {
      return json(res, 400, { error: `${notificationType}Id is required` })
    }

    const auth = notificationType === 'daily_bazaar'
      ? await requireBazaarWriteAccess(req)
      : await requireExpensesWriteAccess(req)
    const { supabase, user, actorName } = auth
    let result
    if (notificationType === 'daily_bazaar') {
      result = await notifyDailyBazaar(supabase, purchaseDate)
    } else if (notificationType === 'investor_income') {
      result = await notifyInvestorIncome(supabase, user, expenseId)
    } else if (notificationType === 'payment') {
      result = await notifyPayment(supabase, user, paymentId)
    } else {
      result = await notifySalaryEvent(
        supabase,
        user,
        actorName,
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
