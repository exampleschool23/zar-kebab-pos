const SDK_SRC = 'https://telegram.org/js/telegram-web-app.js'

export function loadTelegramSdk() {
  if (typeof window === 'undefined') return Promise.resolve(null)
  if (window.Telegram?.WebApp) return Promise.resolve(window.Telegram.WebApp)

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      resolve(window.Telegram?.WebApp || null)
    }, 4000)
    const finish = value => {
      window.clearTimeout(timeout)
      resolve(value)
    }
    const fail = error => {
      window.clearTimeout(timeout)
      reject(error)
    }

    const existing = document.querySelector(`script[src="${SDK_SRC}"]`)
    if (existing) {
      existing.addEventListener('load', () => finish(window.Telegram?.WebApp || null), { once: true })
      existing.addEventListener('error', fail, { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = SDK_SRC
    script.async = true
    script.onload = () => finish(window.Telegram?.WebApp || null)
    script.onerror = fail
    document.head.appendChild(script)
  })
}

export async function initTelegramWebApp() {
  const webApp = await loadTelegramSdk()
  if (!webApp) return null
  webApp.ready()
  webApp.expand()
  return webApp
}

export function getStoredTelegramSession() {
  try {
    return localStorage.getItem('zk_telegram_session') || ''
  } catch {
    return ''
  }
}

export function setStoredTelegramSession(token) {
  try {
    localStorage.setItem('zk_telegram_session', token)
  } catch {
    // Ignore storage failures inside restricted WebViews.
  }
}

export async function telegramApi(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  }
  const token = options.token || getStoredTelegramSession()
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(path, {
    ...options,
    headers,
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || `Request failed with ${res.status}`)
  return body
}
