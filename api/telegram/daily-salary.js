import { json, methodNotAllowed, getBearerToken } from './_lib/http.js'
import { getSupabaseAdmin } from './_lib/supabaseAdmin.js'
import {
  buildDailySalaryMessage,
  getCompletedTashkentDate,
  getCompletedTashkentDates,
  getTashkentDate,
} from './_lib/salaryMessages.js'
import { loadSalaryProfiles } from './_lib/salaryProfileData.js'
import { sendTelegramMessage } from './_lib/telegram.js'
import { notifyAutomaticKpiBonus } from './employee-notification.js'

const KPI_CATCH_UP_DAYS = 7
const PENDING_DELIVERY_RETRY_MS = 2 * 60 * 1000

function requireCronSecret(req) {
  const expected = process.env.CRON_SECRET
  if (!expected || getBearerToken(req) !== expected) {
    throw Object.assign(new Error('Unauthorized'), { status: 401 })
  }
}

function isMissingDailyKpiMigration(error) {
  return ['42883', 'PGRST202', 'PGRST205'].includes(error?.code)
    || (
      /generate_daily_kpi_bonuses|employee_daily_kpi/i.test(error?.message || '')
      && /does not exist|schema cache|could not find/i.test(error?.message || '')
    )
}

function isEligibleForSalaryDate(salaryProfile, notificationDate) {
  if (!salaryProfile) return false
  const joinedAt = String(salaryProfile.joined_at || '').slice(0, 10)
  const endedAt = String(salaryProfile.ended_at || '').slice(0, 10)
  const deletedAt = salaryProfile.deleted_at
    ? getTashkentDate(new Date(salaryProfile.deleted_at))
    : ''
  if (joinedAt && joinedAt > notificationDate) return false
  if (endedAt && endedAt < notificationDate) return false
  if (deletedAt && deletedAt <= notificationDate) return false
  if (salaryProfile.is_active === false && !endedAt) return false
  return true
}

function canRetryPending(attemptedAt) {
  const attemptedAtMs = new Date(attemptedAt || 0).getTime()
  return !Number.isFinite(attemptedAtMs)
    || Date.now() - attemptedAtMs >= PENDING_DELIVERY_RETRY_MS
}

function getTelegramMessageId(response) {
  const messageId = String(response?.result?.message_id || '').trim()
  if (!messageId) throw new Error('Telegram did not return a message id')
  return messageId
}

function getOptionalTashkentDate(value) {
  if (!value) return ''
  const timestamp = new Date(value)
  return Number.isFinite(timestamp.getTime()) ? getTashkentDate(timestamp) : ''
}

async function markDailySalaryDeliverySent(supabase, deliveryId, telegramMessageId, sentAt) {
  let lastError = null
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const updated = await supabase
      .from('employee_salary_notification_deliveries')
      .update({
        status: 'sent',
        telegram_message_id: telegramMessageId,
        error_message: '',
        sent_at: sentAt,
        updated_at: sentAt,
      })
      .eq('id', deliveryId)
      .select('id')
      .maybeSingle()
    if (!updated.error && updated.data) return
    lastError = updated.error || new Error('Daily salary delivery row disappeared')
  }
  throw lastError
}

async function claimDelivery(supabase, salaryProfileId, notificationDate) {
  const { data: existing, error: existingError } = await supabase
    .from('employee_salary_notification_deliveries')
    .select('*')
    .eq('salary_profile_id', salaryProfileId)
    .eq('notification_date', notificationDate)
    .eq('notification_type', 'daily_salary')
    .maybeSingle()
  if (existingError) throw existingError

  if (!existing) {
    const now = new Date().toISOString()
    const created = await supabase
      .from('employee_salary_notification_deliveries')
      .insert({
        salary_profile_id: salaryProfileId,
        notification_date: notificationDate,
        notification_type: 'daily_salary',
        status: 'pending',
        error_message: '',
        attempted_at: now,
        sent_at: null,
        updated_at: now,
      })
      .select('*')
      .single()
    if (created.error?.code === '23505') return null
    if (created.error) throw created.error
    return created.data
  }

  if (existing.status === 'sent') return null
  if (existing.status === 'pending' && !canRetryPending(existing.attempted_at)) return null

  const now = new Date().toISOString()
  let claim = supabase
    .from('employee_salary_notification_deliveries')
    .update({
      status: 'pending',
      telegram_message_id: null,
      error_message: '',
      attempted_at: now,
      sent_at: null,
      updated_at: now,
    })
    .eq('id', existing.id)
    .eq('status', existing.status)
  if (existing.attempted_at) {
    claim = claim.eq('attempted_at', existing.attempted_at)
  } else {
    claim = claim.is('attempted_at', null)
  }
  const claimed = await claim.select('*').maybeSingle()
  if (claimed.error) throw claimed.error
  return claimed.data || null
}

async function finalizeDailyKpiDate(supabase, businessDate) {
  const { data, error } = await supabase.rpc('generate_daily_kpi_bonuses', {
    p_business_date: businessDate,
  })
  if (error) throw error
  return data || []
}

async function deliverAutomaticKpiBonuses(supabase, results) {
  const generatedResults = (results || []).filter(
    result => result.status === 'generated' && result.bonus_id
  )
  const deliveries = []
  for (const result of generatedResults) {
    try {
      const delivery = await notifyAutomaticKpiBonus(supabase, result.bonus_id)
      deliveries.push({
        businessDate: result.business_date,
        salaryProfileId: result.salary_profile_id,
        bonusId: result.bonus_id,
        status: delivery.allSent ? 'sent' : delivery.ok ? 'partial' : 'failed',
        delivery,
      })
    } catch (error) {
      deliveries.push({
        businessDate: result.business_date,
        salaryProfileId: result.salary_profile_id,
        bonusId: result.bonus_id,
        status: 'failed',
        error: String(error?.message || error).slice(0, 1000),
      })
    }
  }
  return deliveries
}

async function sendDailySalaryNotifications(supabase, notificationDate) {
  const { data: links, error: linksError } = await supabase
    .from('employee_salary_telegram_links')
    .select('salary_profile_id, chat_id, preferred_language, linked_at')
    .eq('notifications_enabled', true)
    .not('chat_id', 'is', null)
  if (linksError) throw linksError

  const salaryProfiles = await loadSalaryProfiles(
    supabase,
    (links || []).map(link => link.salary_profile_id)
  )
  const results = []

  for (const link of links || []) {
    const linkedDate = getOptionalTashkentDate(link.linked_at)
    if (linkedDate && linkedDate > notificationDate) {
      results.push({ salaryProfileId: link.salary_profile_id, status: 'skipped' })
      continue
    }
    const salaryProfile = salaryProfiles.get(link.salary_profile_id)
    if (!isEligibleForSalaryDate(salaryProfile, notificationDate)) {
      results.push({ salaryProfileId: link.salary_profile_id, status: 'skipped' })
      continue
    }

    const delivery = await claimDelivery(supabase, link.salary_profile_id, notificationDate)
    if (!delivery) {
      results.push({ salaryProfileId: link.salary_profile_id, status: 'duplicate' })
      continue
    }

    let telegramMessageId = ''
    try {
      const response = await sendTelegramMessage(
        link.chat_id,
        buildDailySalaryMessage(
          salaryProfile,
          notificationDate,
          link.preferred_language || 'ru'
        )
      )
      telegramMessageId = getTelegramMessageId(response)
      const sentAt = new Date().toISOString()
      await markDailySalaryDeliverySent(
        supabase,
        delivery.id,
        telegramMessageId,
        sentAt
      )
      const lastNotifiedUpdate = await supabase
        .from('employee_salary_telegram_links')
        .update({
          last_notified_at: sentAt,
          updated_at: sentAt,
        })
        .eq('salary_profile_id', link.salary_profile_id)
      if (lastNotifiedUpdate.error) {
        console.warn('[telegram/daily-salary] could not update last_notified_at:', lastNotifiedUpdate.error)
      }
      results.push({ salaryProfileId: link.salary_profile_id, status: 'sent' })
    } catch (error) {
      if (!telegramMessageId) {
        await supabase.from('employee_salary_notification_deliveries').update({
          status: 'failed',
          error_message: String(error?.message || error).slice(0, 1000),
          updated_at: new Date().toISOString(),
        }).eq('id', delivery.id)
      } else {
        console.error('[telegram/daily-salary] message sent but delivery status was not persisted:', error)
      }
      results.push({ salaryProfileId: link.salary_profile_id, status: 'failed' })
    }
  }

  return results
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return methodNotAllowed(res, ['GET', 'POST'])

  try {
    requireCronSecret(req)
    const supabase = getSupabaseAdmin()
    const now = new Date()
    const notificationDate = getCompletedTashkentDate(now)
    const catchUpDates = getCompletedTashkentDates(now, KPI_CATCH_UP_DAYS)
    const kpiRuns = []
    const kpiDeliveries = []
    let kpiUnavailable = false

    for (const businessDate of catchUpDates) {
      try {
        const results = await finalizeDailyKpiDate(supabase, businessDate)
        const deliveries = await deliverAutomaticKpiBonuses(supabase, results)
        kpiRuns.push({
          businessDate,
          resultCount: results.length,
          generatedCount: results.filter(result => result.status === 'generated').length,
          status: 'completed',
        })
        kpiDeliveries.push(...deliveries)
      } catch (error) {
        if (isMissingDailyKpiMigration(error)) {
          kpiUnavailable = true
          kpiRuns.push({
            businessDate,
            status: 'unavailable',
            error: 'Run supabase/129_daily_kpi_bonuses.sql',
          })
          break
        }
        kpiRuns.push({
          businessDate,
          status: 'failed',
          error: String(error?.message || error).slice(0, 1000),
        })
      }
    }

    const notificationKpiRun = kpiRuns.find(run => run.businessDate === notificationDate)
    const kpiFinalizationFailed = notificationKpiRun?.status !== 'completed'
    const dailySummaryRuns = []

    for (const kpiRun of kpiRuns) {
      if (kpiRun.status !== 'completed') continue
      try {
        const summaryResults = await sendDailySalaryNotifications(
          supabase,
          kpiRun.businessDate
        )
        const failedCount = summaryResults.filter(result => result.status === 'failed').length
        dailySummaryRuns.push({
          businessDate: kpiRun.businessDate,
          status: failedCount > 0 ? 'partial' : 'completed',
          sentCount: summaryResults.filter(result => result.status === 'sent').length,
          failedCount,
          results: summaryResults,
        })
      } catch (error) {
        dailySummaryRuns.push({
          businessDate: kpiRun.businessDate,
          status: 'failed',
          error: String(error?.message || error).slice(0, 1000),
          results: [],
        })
      }
    }

    const notificationSummaryRun = dailySummaryRuns.find(
      run => run.businessDate === notificationDate
    )
    const dailySummaryFailed = !kpiFinalizationFailed
      && notificationSummaryRun?.status !== 'completed'
    const requestFailed = kpiFinalizationFailed || dailySummaryFailed

    // Never permanently claim a salary summary that is missing its KPI bonus.
    // Missing migrations, schema-cache misses, and operational failures all
    // return 500 and leave delivery unclaimed for a complete retry.
    const results = notificationSummaryRun?.results || []
    const responseStatus = requestFailed ? 500 : 200

    return json(res, responseStatus, {
      ok: !requestFailed,
      notificationDate,
      dailySummaryStatus: kpiFinalizationFailed
        ? 'deferred'
        : notificationSummaryRun?.status || 'deferred',
      catchUpDates,
      kpiUnavailable,
      kpiRuns,
      dailySummaryRuns,
      kpiDeliverySentCount: kpiDeliveries.filter(result => result.status === 'sent').length,
      kpiDeliveryPartialCount: kpiDeliveries.filter(result => result.status === 'partial').length,
      kpiDeliveryFailedCount: kpiDeliveries.filter(result => result.status === 'failed').length,
      kpiDeliveries,
      sentCount: results.filter(result => result.status === 'sent').length,
      failedCount: results.filter(result => result.status === 'failed').length,
      results,
      ...(requestFailed
        ? { error: kpiFinalizationFailed
            ? 'Daily salary summary deferred because KPI finalization failed'
            : 'Daily salary summary delivery could not be prepared' }
        : {}),
    })
  } catch (error) {
    console.error('[telegram/daily-salary]', error)
    return json(res, error?.status || 500, {
      error: error.message || 'Could not finalize KPI bonuses and send salary notifications',
    })
  }
}
