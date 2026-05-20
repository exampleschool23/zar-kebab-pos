import crypto from 'crypto'

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30
const INIT_DATA_MAX_AGE_SECONDS = 60 * 60 * 24

function base64url(input) {
  return Buffer.from(input).toString('base64url')
}

function fromBase64url(input) {
  return Buffer.from(input, 'base64url').toString('utf8')
}

function timingSafeEqualHex(a, b) {
  const left = Buffer.from(String(a || ''), 'hex')
  const right = Buffer.from(String(b || ''), 'hex')
  return left.length === right.length && crypto.timingSafeEqual(left, right)
}

function getBotToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) throw new Error('Missing TELEGRAM_BOT_TOKEN')
  return token
}

function getSessionSecret() {
  return process.env.TELEGRAM_SESSION_SECRET || getBotToken()
}

export function validateTelegramInitData(initData) {
  if (!initData || typeof initData !== 'string') {
    throw new Error('Telegram initData is required')
  }

  const params = new URLSearchParams(initData)
  const receivedHash = params.get('hash')
  if (!receivedHash) throw new Error('Telegram initData hash is missing')

  params.delete('hash')
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')

  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(getBotToken())
    .digest()
  const calculatedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex')

  if (!timingSafeEqualHex(calculatedHash, receivedHash)) {
    throw new Error('Telegram initData signature is invalid')
  }

  const authDate = Number(params.get('auth_date') || 0)
  const now = Math.floor(Date.now() / 1000)
  if (!Number.isFinite(authDate) || authDate <= 0 || now - authDate > INIT_DATA_MAX_AGE_SECONDS) {
    throw new Error('Telegram initData is expired')
  }

  const userRaw = params.get('user')
  if (!userRaw) throw new Error('Telegram initData user is missing')

  const user = JSON.parse(userRaw)
  if (!user?.id) throw new Error('Telegram user id is missing')

  return {
    authDate,
    queryId: params.get('query_id') || null,
    user: {
      id: String(user.id),
      username: user.username || '',
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      language_code: user.language_code || '',
    },
  }
}

export function createTelegramSession(payload) {
  const body = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  }
  const encoded = base64url(JSON.stringify(body))
  const sig = crypto.createHmac('sha256', getSessionSecret()).update(encoded).digest('base64url')
  return `${encoded}.${sig}`
}

export function verifyTelegramSession(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) {
    throw new Error('Telegram session is required')
  }

  const [encoded, sig] = token.split('.')
  const expected = crypto.createHmac('sha256', getSessionSecret()).update(encoded).digest('base64url')
  const left = Buffer.from(sig || '')
  const right = Buffer.from(expected)
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
    throw new Error('Telegram session signature is invalid')
  }

  const payload = JSON.parse(fromBase64url(encoded))
  if (!payload?.telegramUserId || !payload?.customerId || !payload?.exp) {
    throw new Error('Telegram session payload is invalid')
  }
  if (payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Telegram session is expired')
  }
  return payload
}

export async function sendTelegramMessage(chatId, text) {
  if (!chatId || !text) return { skipped: true }

  const res = await fetch(`https://api.telegram.org/bot${getBotToken()}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
    }),
  })

  const body = await res.json().catch(() => ({}))
  if (!res.ok || body.ok === false) {
    throw new Error(body.description || `Telegram sendMessage failed with ${res.status}`)
  }
  return body
}

export const TELEGRAM_STATUS_MESSAGES = {
  accepted: '✅ Order accepted',
  preparing: '👨‍🍳 Your order is being prepared',
  ready: '📦 Your order is ready',
  completed: '✅ Order completed',
  cancelled: 'Order cancelled',
}
