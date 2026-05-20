import { getBearerToken, json, methodNotAllowed } from '../_lib/http.js'
import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js'
import { verifyTelegramSession } from '../_lib/telegram.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])

  try {
    verifyTelegramSession(getBearerToken(req))
    const cardNumber = String(req.query.cardNumber || '').trim()
    if (!/^\d{8}$/.test(cardNumber)) {
      return json(res, 400, { error: 'Loyalty card must be 8 digits' })
    }

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('loyalty_cards')
      .select('*')
      .eq('card_number', cardNumber)
      .maybeSingle()

    if (error && !/relation|schema cache/i.test(error.message || '')) throw error

    return json(res, 200, {
      cardNumber,
      valid: !!data,
      balance: Math.max(0, Math.round(Number(data?.balance || data?.balance_amount || 0))),
      card: data || null,
    })
  } catch (error) {
    console.error('[telegram/loyalty]', error)
    return json(res, 401, { error: error.message || 'Could not load loyalty card' })
  }
}
