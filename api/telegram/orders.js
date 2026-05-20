import { getBearerToken, json, methodNotAllowed } from './_lib/http.js'
import { getSupabaseAdmin } from './_lib/supabaseAdmin.js'
import { verifyTelegramSession } from './_lib/telegram.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])

  try {
    const session = verifyTelegramSession(getBearerToken(req))
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('orders')
      .select('*, items:order_items(*)')
      .eq('source', 'telegram')
      .eq('telegram_user_id', session.telegramUserId)
      .order('created_at', { ascending: false })
      .limit(20)
    if (error) throw error
    return json(res, 200, { orders: data || [] })
  } catch (error) {
    console.error('[telegram/orders]', error)
    return json(res, 401, { error: error.message || 'Could not load orders' })
  }
}
