import { json, methodNotAllowed, readJson } from './_lib/http.js'
import { getSupabaseAdmin } from './_lib/supabaseAdmin.js'
import {
  buildDailySalaryMessage,
  getTashkentDate,
  parseEmployeeStartToken,
  normalizeSalaryNotificationLanguage,
} from './_lib/salaryMessages.js'
import { loadSalaryProfiles } from './_lib/salaryProfileData.js'
import { callTelegramApi, sendTelegramMessage } from './_lib/telegram.js'

const LANGUAGES = {
  uz: { label: "O'zbekcha", saved: "Til tanlandi. Menyuni ochishingiz mumkin.", openMenu: "Menyuni ochish" },
  ru: { label: 'Русский', saved: 'Язык выбран. Теперь можно открыть меню.', openMenu: 'Открыть меню' },
  en: { label: 'English', saved: 'Language saved. You can open the menu now.', openMenu: 'Open Menu' },
}
const CHOOSE_LANGUAGE = "Tilni tanlang / Выберите язык / Choose language"

function requireWebhookSecret(req) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET
  const received = req.headers['x-telegram-bot-api-secret-token']
  if (!expected) {
    throw Object.assign(new Error('Telegram webhook secret is not configured'), { status: 503 })
  }
  if (received !== expected) {
    throw Object.assign(new Error('Unauthorized'), { status: 401 })
  }
}

function linkedMessage() {
  return '✅ Ваш Telegram-аккаунт успешно привязан к профилю зарплаты.'
}

function invalidLinkMessage() {
  return 'Эта ссылка недействительна или устарела. Попросите администратора создать новую.'
}

async function linkEmployee(supabase, message, token) {
  const user = message.from
  const language = 'ru'
  const { data: link, error: findError } = await supabase
    .from('employee_salary_telegram_links')
    .select('salary_profile_id')
    .eq('link_token', token)
    .gt('link_token_expires_at', new Date().toISOString())
    .maybeSingle()
  if (findError) throw findError

  if (!link) {
    await sendTelegramMessage(message.chat.id, invalidLinkMessage())
    return
  }

  const salaryProfiles = await loadSalaryProfiles(supabase, [link.salary_profile_id])
  const salaryProfile = salaryProfiles.get(link.salary_profile_id)
  if (!salaryProfile) throw new Error('Employee salary profile not found')

  const { data: updated, error: updateError } = await supabase
    .from('employee_salary_telegram_links')
    .update({
      telegram_user_id: String(user.id),
      chat_id: String(message.chat.id),
      username: user.username || '',
      preferred_language: language,
      notifications_enabled: true,
      link_token: null,
      link_token_expires_at: null,
      linked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('salary_profile_id', link.salary_profile_id)
    .eq('link_token', token)
    .select('salary_profile_id')
    .maybeSingle()

  if (updateError) throw updateError
  if (!updated) {
    await sendTelegramMessage(message.chat.id, invalidLinkMessage())
    return
  }

  const currentStatus = buildDailySalaryMessage(salaryProfile, getTashkentDate(), 'ru')
  try {
    await sendTelegramMessage(
      message.chat.id,
      `${linkedMessage()}\n\n📌 <b>Текущий статус</b>\n\n${currentStatus}`
    )
  } catch (error) {
    console.error('[telegram/webhook] linked status send failed:', error)
  }
}

function languageKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: LANGUAGES.uz.label, callback_data: 'language:uz' },
        { text: LANGUAGES.ru.label, callback_data: 'language:ru' },
      ],
      [{ text: LANGUAGES.en.label, callback_data: 'language:en' }],
    ],
  }
}

function openMenuKeyboard(language) {
  const webAppUrl = process.env.TELEGRAM_WEB_APP_URL
  return webAppUrl ? {
    inline_keyboard: [[{
      text: LANGUAGES[language].openMenu,
      web_app: { url: webAppUrl },
    }]],
  } : undefined
}

async function savePreferredLanguage(supabase, user, chatId, language) {
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ')
    || user.username
    || `Telegram ${user.id}`
  const { data: customer, error: customerError } = await supabase
    .from('customers')
    .upsert({
      name: fullName,
      telegram_user_id: String(user.id),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'telegram_user_id' })
    .select('id')
    .single()
  if (customerError) throw customerError

  const { error } = await supabase.from('telegram_users').upsert({
    telegram_user_id: String(user.id),
    chat_id: String(chatId || user.id),
    username: user.username || '',
    first_name: user.first_name || '',
    last_name: user.last_name || '',
    language_code: user.language_code || '',
    preferred_language: language,
    customer_id: customer.id,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'telegram_user_id' })
  if (error) throw error
}

async function handleLanguageCallback(supabase, callbackQuery) {
  const language = String(callbackQuery?.data || '').split(':')[1]
  if (!LANGUAGES[language] || !callbackQuery?.message?.chat?.id) return

  await savePreferredLanguage(
    supabase,
    callbackQuery.from,
    callbackQuery.message.chat.id,
    language
  )
  await callTelegramApi('answerCallbackQuery', {
    callback_query_id: callbackQuery.id,
    text: LANGUAGES[language].saved,
  })
  await callTelegramApi('editMessageText', {
    chat_id: callbackQuery.message.chat.id,
    message_id: callbackQuery.message.message_id,
    text: LANGUAGES[language].saved,
    reply_markup: openMenuKeyboard(language),
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res)

  try {
    requireWebhookSecret(req)
    const update = await readJson(req)
    const supabase = getSupabaseAdmin()
    const message = update?.message
    const token = parseEmployeeStartToken(message?.text)
    if (message?.chat?.id && message?.from?.id && token) {
      await linkEmployee(supabase, message, token)
    } else if (message?.chat?.id && /^\/(?:start|language)(?:@\w+)?(?:\s|$)/i.test(message?.text || '')) {
      await callTelegramApi('sendMessage', {
        chat_id: message.chat.id,
        text: CHOOSE_LANGUAGE,
        reply_markup: languageKeyboard(),
      })
    } else if (update?.callback_query?.data?.startsWith('language:')) {
      await handleLanguageCallback(supabase, update.callback_query)
    }
    return json(res, 200, { ok: true })
  } catch (error) {
    console.error('[telegram/webhook]', error)
    return json(res, error?.status || 500, { error: error.message || 'Telegram webhook failed' })
  }
}
