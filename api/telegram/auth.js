import { json, methodNotAllowed, readJson } from './_lib/http.js'
import { getSupabaseAdmin } from './_lib/supabaseAdmin.js'
import { createTelegramSession, validateTelegramInitData } from './_lib/telegram.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res)

  try {
    const { initData } = await readJson(req)
    const verified = validateTelegramInitData(initData)
    const tg = verified.user
    const supabase = getSupabaseAdmin()
    const fullName = [tg.first_name, tg.last_name].filter(Boolean).join(' ') || tg.username || `Telegram ${tg.id}`
    const inferredLanguage = tg.language_code?.startsWith('uz')
      ? 'uz'
      : tg.language_code?.startsWith('ru')
        ? 'ru'
        : tg.language_code?.startsWith('en')
          ? 'en'
          : null

    const { data: existingTelegramUser } = await supabase
      .from('telegram_users')
      .select('preferred_language')
      .eq('telegram_user_id', tg.id)
      .maybeSingle()

    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .upsert({
        name: fullName,
        telegram_user_id: tg.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'telegram_user_id' })
      .select('*')
      .single()
    if (customerError) throw customerError

    const { data: telegramUser, error: telegramUserError } = await supabase
      .from('telegram_users')
      .upsert({
        telegram_user_id: tg.id,
        chat_id: tg.id,
        username: tg.username,
        first_name: tg.first_name,
        last_name: tg.last_name,
        language_code: tg.language_code,
        preferred_language: existingTelegramUser?.preferred_language || inferredLanguage,
        customer_id: customer.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'telegram_user_id' })
      .select('*')
      .single()
    if (telegramUserError) throw telegramUserError

    const sessionToken = createTelegramSession({
      telegramUserId: tg.id,
      telegramUserRowId: telegramUser.id,
      customerId: customer.id,
      chatId: telegramUser.chat_id || tg.id,
    })

    return json(res, 200, {
      sessionToken,
      customer,
      telegramUser,
    })
  } catch (error) {
    console.error('[telegram/auth]', error)
    return json(res, 401, { error: error.message || 'Telegram auth failed' })
  }
}
