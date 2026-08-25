export const PROFILE_LOAD_RETRY_DELAYS_MS = [300, 1000]

export function isRetryableProfileLoadError(error) {
  const status = Number(error?.status || error?.statusCode || 0)
  if (status === 401 || status === 408 || status === 425 || status === 429 || status >= 500) return true

  const message = `${error?.name || ''} ${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return (
    message.includes('abort') ||
    message.includes('jwt') ||
    message.includes('token expired') ||
    message.includes('session expired') ||
    message.includes('failed to fetch') ||
    message.includes('fetch failed') ||
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('connection') ||
    message.includes('gateway') ||
    message.includes('service unavailable') ||
    message.includes('temporarily unavailable')
  )
}

function wait(delayMs) {
  return new Promise(resolve => setTimeout(resolve, delayMs))
}

export async function loadProfileWithRetry(
  load,
  { retryDelaysMs = PROFILE_LOAD_RETRY_DELAYS_MS, waitFor = wait } = {}
) {
  const delays = Array.isArray(retryDelaysMs) ? retryDelaysMs : []

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await load()
    } catch (error) {
      if (!isRetryableProfileLoadError(error) || attempt >= delays.length) throw error
      await waitFor(Math.max(0, Number(delays[attempt]) || 0))
    }
  }
}
