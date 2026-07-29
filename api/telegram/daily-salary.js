import { json, methodNotAllowed, getBearerToken } from './_lib/http.js'
import { getSupabaseAdmin } from './_lib/supabaseAdmin.js'
import { buildDailySalaryMessage, getTashkentDate } from './_lib/salaryMessages.js'
import { loadSalaryProfiles } from './_lib/salaryProfileData.js'
import { sendTelegramMessage } from './_lib/telegram.js'

function requireCronSecret(req) {
  const expected = process.env.CRON_SECRET
  if (!expected || getBearerToken(req) !== expected) {
    throw Object.assign(new Error('Unauthorized'), { status: 401 })
  }
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
    const notificationDate = getTashkentDate()
    const { data: links, error: linksError } = await supabase
      .from('employee_salary_telegram_links')
      .select('salary_profile_id, chat_id, preferred_language')
      .eq('notifications_enabled', true)
      .not('chat_id', 'is', null)
    if (linksError) throw linksError

    const salaryProfiles = await loadSalaryProfiles(
      supabase,
      (links || []).map(link => link.salary_profile_id)
    )
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
