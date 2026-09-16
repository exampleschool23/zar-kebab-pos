import { escapeTelegramHtml, sendTelegramMessage } from './telegram.js'

const money = value => new Intl.NumberFormat('ru-RU').format(Number(value) || 0).replace(/\s/g, ' ')

export function buildEmployeeOrderKpiMessage(snapshot) {
  return [
    `✅ Заказ №${escapeTelegramHtml(snapshot.order_number)} оплачен`,
    `Сумма: ${money(snapshot.total)} сум`,
    `Ваш KPI (${money(snapshot.rate_bps / 100)}%): ≈ ${money(snapshot.cut)} сум`,
    'Итог KPI — после закрытия дня.',
  ].join('\n')
}

export async function deliverEmployeeOrderKpiNotification(supabase, row, send = sendTelegramMessage) {
  const table = 'employee_order_kpi_notifications'
  if (row.status !== 'queued') return { status: 'duplicate' }
  const { data: claimed, error } = await supabase.from(table)
    .update({ status: 'processing', attempted_at: new Date().toISOString() })
    .eq('id', row.id).eq('status', 'queued').select('*').maybeSingle()
  if (error) throw error
  if (!claimed) return { status: 'duplicate' }
  try {
    const response = await send(claimed.chat_id, buildEmployeeOrderKpiMessage(claimed.snapshot))
    const messageId = response?.result?.message_id
    if (!messageId) throw new Error('Telegram delivery outcome is unknown')
    // Retry receipt persistence, never the Telegram send after an uncertain outcome.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await supabase.from(table).update({ status: 'sent', telegram_message_id: messageId,
        sent_at: new Date().toISOString(), error_message: '' })
        .eq('id', row.id).eq('status', 'processing').select('id').maybeSingle()
      if (!result.error && result.data) return { status: 'sent' }
    }
    throw new Error('Telegram accepted the message but its receipt could not be saved')
  } catch (error) {
    await supabase.from(table).update({ error_message: String(error?.message || error).slice(0, 1000) })
      .eq('id', row.id).eq('status', 'processing')
    return { status: 'processing', needsReview: true }
  }
}

export async function drainEmployeeOrderKpiNotifications(supabase) {
  const { data, error } = await supabase.from('employee_order_kpi_notifications')
    .select('*').eq('status', 'queued').order('created_at', { ascending: true }).limit(30)
  if (error) throw error
  const results = []
  for (const row of data || []) results.push(await deliverEmployeeOrderKpiNotification(supabase, row))
  return { sent: results.filter(row => row.status === 'sent').length,
    needsReview: results.filter(row => row.needsReview).length }
}
