import { json, methodNotAllowed, readJson } from './_lib/http.js'
import { getSupabaseAdmin } from './_lib/supabaseAdmin.js'
import { sendTelegramMessage, TELEGRAM_STATUS_MESSAGES } from './_lib/telegram.js'

const ITEM_STATUS_TO_TELEGRAM_STATUS = {
  preparing: 'preparing',
  ready: 'ready',
  served: 'completed',
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res)

  try {
    const { orderId, status } = await readJson(req)
    const telegramStatus = TELEGRAM_STATUS_MESSAGES[status]
      ? status
      : ITEM_STATUS_TO_TELEGRAM_STATUS[status]
    if (!orderId || !telegramStatus || !TELEGRAM_STATUS_MESSAGES[telegramStatus]) {
      return json(res, 400, { error: 'Valid orderId and status are required' })
    }

    const supabase = getSupabaseAdmin()
    const { data: order, error } = await supabase
      .from('orders')
      .select('id, source, telegram_user_id, customer_id, order_number')
      .eq('id', orderId)
      .maybeSingle()
    if (error) throw error
    if (!order || order.source !== 'telegram' || !order.telegram_user_id) {
      return json(res, 200, { skipped: true })
    }

    const { data: telegramUser } = await supabase
      .from('telegram_users')
      .select('chat_id')
      .eq('telegram_user_id', order.telegram_user_id)
      .maybeSingle()

    const chatId = telegramUser?.chat_id || order.telegram_user_id
    const text = `${TELEGRAM_STATUS_MESSAGES[telegramStatus]}\nOrder ${order.order_number || order.id}`
    await sendTelegramMessage(chatId, text)
    return json(res, 200, { ok: true })
  } catch (error) {
    console.error('[telegram/order-status]', error)
    return json(res, 400, { error: error.message || 'Could not notify Telegram customer' })
  }
}
