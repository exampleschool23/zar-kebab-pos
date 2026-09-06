import { formatDateTime } from '../../../src/lib/dateFormat.js'
import { buildItemRows } from './orderStatusMessages.js'
import { escapeTelegramHtml, sendTelegramMessage } from './telegram.js'

export async function loadGameClubTeamTarget(supabase, env = process.env) {
  const { data, error } = await supabase.from('telegram_notification_targets')
    .select('chat_id, is_enabled').eq('target_key', 'team_events').maybeSingle()
  if (error) throw error
  if (data && !data.is_enabled) return ''
  return String(data?.chat_id || env.TELEGRAM_TEAM_CHAT_ID || '').trim()
}

export function buildGameClubTeamMessages(snapshot) {
  const items = snapshot?.items || []
  if (!items.length) throw new Error('Game Club submission has no items')
  const header = [
    '🎮 <b>Новый заказ — Игровой клуб</b>',
    `Дата: ${escapeTelegramHtml(formatDateTime(snapshot.submitted_at, '—').replace(' ', ', '))}`,
    `Добавил: ${escapeTelegramHtml(snapshot.actor_name || 'Неизвестный сотрудник')}`,
    `Тип меню: ${snapshot.price_mode === 'tourist' ? 'Туристическое' : 'Обычное'}`,
  ].join('\n')
  const money = new Intl.NumberFormat('ru-RU').format(Math.round(Number(snapshot.total) || 0)).replace(/\s/g, ' ')
  const footer = `\n\n<b>Сумма заказа: ${money} UZS</b>`
  const messages = []
  let batch = []
  for (const item of items) {
    const candidate = [...batch, item]
    const message = `${header}\n\n<pre>${escapeTelegramHtml(buildItemRows(candidate))}</pre>${footer}`
    if (message.length > 3900 && batch.length) {
      messages.push(`${header}\n\n<pre>${escapeTelegramHtml(buildItemRows(batch))}</pre>`)
      batch = [item]
    } else batch = candidate
  }
  messages.push(`${header}\n\n<pre>${escapeTelegramHtml(buildItemRows(batch))}</pre>${footer}`)
  return messages
}

// A compare-and-set claim prevents parallel workers from sending the same round.
// An uncertain Telegram result stays processing for review, never blindly resent.
export async function deliverGameClubNotification(supabase, row, chatId, send = sendTelegramMessage) {
  const table = 'game_club_team_notifications'
  const { data: claimed, error } = await supabase.from(table)
    .update({ status: 'processing', chat_id: chatId, attempted_at: new Date().toISOString() })
    .eq('id', row.id).eq('status', 'queued').select('*').maybeSingle()
  if (error) throw error
  if (!claimed) return { status: 'duplicate' }
  const messageIds = []
  try {
    for (const message of buildGameClubTeamMessages(claimed.snapshot)) {
      const response = await send(chatId, message)
      const id = response?.result?.message_id
      if (!id) throw new Error('Telegram did not return a message id; delivery outcome is unknown')
      messageIds.push(id)
      let saved = false
      for (let attempt = 0; attempt < 3 && !saved; attempt += 1) {
        const result = await supabase.from(table).update({ telegram_message_ids: messageIds })
          .eq('id', row.id).eq('status', 'processing').select('id').maybeSingle()
        saved = !result.error && !!result.data
      }
      if (!saved) throw new Error('Telegram accepted the message but its receipt could not be saved')
    }
    const result = await supabase.from(table)
      .update({ status: 'sent', sent_at: new Date().toISOString(), error_message: '' })
      .eq('id', row.id).eq('status', 'processing').select('id').maybeSingle()
    if (result.error || !result.data) throw result.error || new Error('Delivery ledger missing')
    return { status: 'sent' }
  } catch (error) {
    await supabase.from(table).update({ error_message: String(error?.message || error).slice(0, 1000) })
      .eq('id', row.id).eq('status', 'processing')
    return { status: 'processing', needsReview: true }
  }
}

export async function drainGameClubNotifications(supabase) {
  const chatId = await loadGameClubTeamTarget(supabase)
  if (!chatId) return { status: 'not_configured', sent: 0 }
  const { data, error } = await supabase.from('game_club_team_notifications')
    .select('*').eq('status', 'queued').order('created_at', { ascending: true }).limit(20)
  if (error) throw error
  const results = []
  for (const row of data || []) results.push(await deliverGameClubNotification(supabase, row, chatId))
  return { sent: results.filter(row => row.status === 'sent').length, needsReview: results.filter(row => row.needsReview).length }
}
