import { json, methodNotAllowed, getBearerToken } from './_lib/http.js'
import { getSupabaseAdmin } from './_lib/supabaseAdmin.js'
import { buildDailySalaryMessage } from './_lib/salaryMessages.js'
import { sendTelegramMessage } from './_lib/telegram.js'

function tashkentDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Tashkent',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function completedTashkentDate(now = new Date()) {
  const today = tashkentDate(now)
  const date = new Date(`${today}T12:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}

function requireCronSecret(req) {
  const expected = process.env.CRON_SECRET
  if (!expected || getBearerToken(req) !== expected) {
    throw Object.assign(new Error('Unauthorized'), { status: 401 })
  }
}

function composeSalaryProfile(row, related) {
  return {
    ...row,
    rates: related.rates.filter(item => item.salary_profile_id === row.id),
    payments: related.payments.filter(item => item.salary_profile_id === row.id),
    bonuses: related.bonuses.filter(item => item.salary_profile_id === row.id),
    fines: related.fines.filter(item => item.salary_profile_id === row.id),
    absences: related.absences.filter(item => item.salary_profile_id === row.id),
  }
}

async function loadSalaryProfiles(supabase, links) {
  const profileIds = links.map(link => link.salary_profile_id)
  if (profileIds.length === 0) return new Map()

  const [profiles, rates, payments, bonuses, fines, absences] = await Promise.all([
    supabase.from('employee_salary_profiles').select('*').in('id', profileIds),
    supabase.from('employee_salary_rates').select('*').in('salary_profile_id', profileIds),
    supabase.from('employee_salary_payments').select('*').in('salary_profile_id', profileIds),
    supabase.from('employee_salary_bonuses').select('*').in('salary_profile_id', profileIds),
    supabase.from('employee_salary_fines').select('*').in('salary_profile_id', profileIds),
    supabase.from('employee_salary_absences').select('*').in('salary_profile_id', profileIds),
  ])
  const failed = [profiles, rates, payments, bonuses, fines, absences].find(result => result.error)
  if (failed?.error) throw failed.error

  const related = {
    rates: rates.data || [],
    payments: payments.data || [],
    bonuses: bonuses.data || [],
    fines: fines.data || [],
    absences: absences.data || [],
  }
  return new Map((profiles.data || []).map(profile => [
    profile.id,
    composeSalaryProfile(profile, related),
  ]))
}

async function claimDelivery(supabase, salaryProfileId, notificationDate) {
  const { data, error } = await supabase
    .from('employee_salary_notification_deliveries')
    .insert({
      salary_profile_id: salaryProfileId,
      notification_date: notificationDate,
      notification_type: 'daily_salary',
      status: 'pending',
    })
    .select('id')
    .single()

  if (error?.code === '23505') return null
  if (error) throw error
  return data
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return methodNotAllowed(res, ['GET', 'POST'])

  try {
    requireCronSecret(req)
    const supabase = getSupabaseAdmin()
    const notificationDate = completedTashkentDate()
    const { data: links, error: linksError } = await supabase
      .from('employee_salary_telegram_links')
      .select('salary_profile_id, chat_id, preferred_language')
      .eq('notifications_enabled', true)
      .not('chat_id', 'is', null)
    if (linksError) throw linksError

    const salaryProfiles = await loadSalaryProfiles(supabase, links || [])
    const results = []

    for (const link of links || []) {
      const salaryProfile = salaryProfiles.get(link.salary_profile_id)
      if (!salaryProfile || salaryProfile.deleted_at || salaryProfile.is_active === false) {
        results.push({ salaryProfileId: link.salary_profile_id, status: 'skipped' })
        continue
      }

      const delivery = await claimDelivery(supabase, link.salary_profile_id, notificationDate)
      if (!delivery) {
        results.push({ salaryProfileId: link.salary_profile_id, status: 'duplicate' })
        continue
      }

      try {
        const response = await sendTelegramMessage(
          link.chat_id,
          buildDailySalaryMessage(salaryProfile, notificationDate, 'ru')
        )
        await Promise.all([
          supabase.from('employee_salary_notification_deliveries').update({
            status: 'sent',
            telegram_message_id: String(response?.result?.message_id || ''),
            sent_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq('id', delivery.id),
          supabase.from('employee_salary_telegram_links').update({
            last_notified_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq('salary_profile_id', link.salary_profile_id),
        ])
        results.push({ salaryProfileId: link.salary_profile_id, status: 'sent' })
      } catch (error) {
        await supabase.from('employee_salary_notification_deliveries').update({
          status: 'failed',
          error_message: String(error?.message || error).slice(0, 1000),
          updated_at: new Date().toISOString(),
        }).eq('id', delivery.id)
        results.push({ salaryProfileId: link.salary_profile_id, status: 'failed' })
      }
    }

    return json(res, 200, {
      ok: true,
      notificationDate,
      sentCount: results.filter(result => result.status === 'sent').length,
      failedCount: results.filter(result => result.status === 'failed').length,
      results,
    })
  } catch (error) {
    console.error('[telegram/daily-salary]', error)
    return json(res, error?.status || 500, { error: error.message || 'Could not send salary notifications' })
  }
}
