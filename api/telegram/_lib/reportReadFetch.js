// Retry only reads: replaying a timed-out write or Telegram send can duplicate it.
const READ_RPCS = new Set(['get_pending_daily_kpi_dates', 'get_pending_employee_meal_dates'])
const TRANSIENT_STATUSES = new Set([502, 503, 504])

export function createReportReadFetch({
  fetchImpl = globalThis.fetch,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  timeoutMs = 15000,
} = {}) {
  return async (input, init = {}) => {
    const request = input instanceof Request ? input : null
    const url = new URL(request ? request.url : String(input))
    const method = String(init.method || request?.method || 'GET').toUpperCase()
    const parts = url.pathname.split('/').filter(Boolean)
    const isRest = parts[0] === 'rest' && parts[1] === 'v1'
    const isRpc = parts[2] === 'rpc'
    const safeRead = isRest && (isRpc
      ? READ_RPCS.has(parts[3]) && ['GET', 'POST'].includes(method)
      : ['GET', 'HEAD'].includes(method))
    if (!safeRead) return fetchImpl(input, init)

    // Only include the operation name, never query values, headers or credentials.
    const operation = `Daily report database read (${isRpc ? 'rpc/' : ''}${parts[isRpc ? 3 : 2]})`
    const callerSignal = init.signal || request?.signal
    for (let attempt = 0; attempt < 3; attempt += 1) {
      callerSignal?.throwIfAborted()
      const controller = new AbortController()
      const abort = () => controller.abort(callerSignal.reason)
      callerSignal?.addEventListener('abort', abort, { once: true })
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      let response
      try {
        response = await fetchImpl(request ? request.clone() : input, {
          ...init,
          signal: controller.signal,
        })
      } catch (error) {
        if (callerSignal?.aborted) throw error
        if (attempt === 2) throw new Error(`${operation} failed after 3 attempts (network error or timeout)`)
      } finally {
        clearTimeout(timer)
        callerSignal?.removeEventListener('abort', abort)
      }
      if (response && !TRANSIENT_STATUSES.has(response.status)) return response
      if (response && attempt === 2) {
        await response.body?.cancel()
        return new Response(JSON.stringify({
          message: `${operation} failed after 3 attempts (HTTP ${response.status})`,
          code: 'REPORT_READ_UNAVAILABLE',
        }), { status: response.status, headers: { 'Content-Type': 'application/json' } })
      }
      await response?.body?.cancel()
      await sleep(500 * (2 ** attempt))
    }
  }
}
