import { randomUUID } from 'node:crypto'
import { deleteTelegramMessage, sendTelegramMessage } from './telegram.js'

const TABLE = 'order_status_telegram_messages'

export async function sendTrackedOrderStatusMessage(supabase, orderIds, chatId, text) {
  const id = randomUUID()
  // Reserve before sending so a concurrent order deletion also queues this message.
  const reserved = await supabase.from(TABLE).insert({ id, order_ids: orderIds, chat_id: String(chatId) })
  if (reserved.error) throw reserved.error
  const response = await sendTelegramMessage(chatId, text)
  const messageId = response?.result?.message_id
  if (!messageId) throw new Error('Telegram did not return a status message id')
  const saved = await supabase.from(TABLE).update({ message_id: String(messageId) }).eq('id', id)
  if (saved.error) {
    // Do not leave a known, untracked message behind after a persistence failure.
    await deleteTelegramMessage(chatId, messageId)
    throw saved.error
  }
  await retractDeletedOrderStatusMessages(supabase, orderIds)
  return response
}

export async function retractDeletedOrderStatusMessages(supabase, orderIds) {
  let query = supabase.from(TABLE).select('*').eq('delete_requested', true)
    .is('deleted_at', null).not('message_id', 'is', null)
    .order('attempted_at', { ascending: true, nullsFirst: true }).limit(100)
  if (orderIds?.length) query = query.overlaps('order_ids', orderIds)
  const { data, error } = await query
  if (error) throw error
  const results = []
  for (const row of data || []) {
    let failure = null
    try {
      await deleteTelegramMessage(row.chat_id, row.message_id)
    } catch (error) {
      if (!/message to delete not found/i.test(error.message || '')) failure = error
    }
    const now = new Date().toISOString()
    const saved = await supabase.from(TABLE).update({
      attempted_at: now,
      error_message: failure ? String(failure.message || failure) : '',
      ...(!failure ? { deleted_at: now } : {}),
    }).eq('id', row.id)
    if (saved.error) throw saved.error
    results.push({ id: row.id, deleted: !failure })
  }
  return { ok: results.every(row => row.deleted), results }
}
