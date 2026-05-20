#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

function loadLocalEnv(path = '.env.local') {
  if (!existsSync(path)) return
  const lines = readFileSync(path, 'utf8').split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue
    const index = trimmed.indexOf('=')
    const key = trimmed.slice(0, index).trim()
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')
    if (key && process.env[key] == null) process.env[key] = value
  }
}

loadLocalEnv()

const token = process.env.TELEGRAM_BOT_TOKEN
const webAppUrl = process.env.TELEGRAM_WEB_APP_URL
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!token || !webAppUrl) {
  console.error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_WEB_APP_URL')
  process.exit(1)
}

const apiBase = `https://api.telegram.org/bot${token}`
const supabase = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null

const LANGUAGES = {
  uz: {
    label: "O'zbekcha",
    choose: "Tilni tanlang / Выберите язык / Choose language",
    saved: "Til tanlandi. Menyuni ochishingiz mumkin.",
    openMenu: "Menyuni ochish",
  },
  ru: {
    label: 'Русский',
    choose: "Tilni tanlang / Выберите язык / Choose language",
    saved: 'Язык выбран. Теперь можно открыть меню.',
    openMenu: 'Открыть меню',
  },
  en: {
    label: 'English',
    choose: "Tilni tanlang / Выберите язык / Choose language",
    saved: 'Language saved. You can open the menu now.',
    openMenu: 'Open Menu',
  },
}

async function telegram(method, payload) {
  const res = await fetch(`${apiBase}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body.ok === false) {
    throw new Error(body.description || `${method} failed with ${res.status}`)
  }
  return body.result
}

async function savePreferredLanguage(user, chatId, language) {
  if (!supabase || !user?.id || !LANGUAGES[language]) return

  const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || `Telegram ${user.id}`
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

  const { error } = await supabase
    .from('telegram_users')
    .upsert({
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

function languageKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: LANGUAGES.uz.label, callback_data: 'language:uz' },
        { text: LANGUAGES.ru.label, callback_data: 'language:ru' },
      ],
      [
        { text: LANGUAGES.en.label, callback_data: 'language:en' },
      ],
    ],
  }
}

function openMenuKeyboard(language) {
  const labels = LANGUAGES[language] || LANGUAGES.en
  return {
    inline_keyboard: [[
      {
        text: labels.openMenu,
        web_app: { url: webAppUrl },
      },
    ]],
  }
}

async function handleUpdate(update) {
  const message = update.message
  if (message?.text && (message.text.startsWith('/start') || message.text.startsWith('/language'))) {
    await telegram('sendMessage', {
      chat_id: message.chat.id,
      text: LANGUAGES.en.choose,
      reply_markup: languageKeyboard(),
    })
    return
  }

  const callbackQuery = update.callback_query
  if (!callbackQuery?.data?.startsWith('language:')) return

  const language = callbackQuery.data.split(':')[1]
  if (!LANGUAGES[language]) return

  await telegram('answerCallbackQuery', {
    callback_query_id: callbackQuery.id,
    text: LANGUAGES[language].saved,
  })

  try {
    await savePreferredLanguage(callbackQuery.from, callbackQuery.message?.chat?.id || callbackQuery.from.id, language)
  } catch (error) {
    console.warn('[telegram-bot] could not save preferred language:', error.message)
  }

  await telegram('editMessageText', {
    chat_id: callbackQuery.message.chat.id,
    message_id: callbackQuery.message.message_id,
    text: LANGUAGES[language].saved,
    reply_markup: openMenuKeyboard(language),
  })
}

async function runPolling() {
  let offset = 0
  console.log('Telegram bot polling started')

  for (;;) {
    try {
      const updates = await telegram('getUpdates', {
        offset,
        timeout: 30,
        allowed_updates: ['message', 'callback_query'],
      })

      for (const update of updates) {
        offset = update.update_id + 1
        await handleUpdate(update)
      }
    } catch (error) {
      console.error('[telegram-bot]', error.message)
      await new Promise(resolve => setTimeout(resolve, 3000))
    }
  }
}

runPolling()
