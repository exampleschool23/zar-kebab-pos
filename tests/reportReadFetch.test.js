import test from 'node:test'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import { createReportReadFetch } from '../api/telegram/_lib/reportReadFetch.js'

const base = 'https://example.supabase.co/rest/v1/'

test('transient database reads recover with bounded backoff', async () => {
  const delays = []
  let calls = 0
  const fetch = createReportReadFetch({
    fetchImpl: async () => ++calls < 3
      ? new Response('Gateway Timeout', { status: 504 })
      : new Response('[]'),
    sleep: async ms => delays.push(ms),
  })
  assert.equal((await fetch(`${base}orders`)).status, 200)
  assert.equal(calls, 3)
  assert.deepEqual(delays, [500, 1000])
})

test('exhausted reads preserve HTTP failure and expose only operation context', async () => {
  const fetch = createReportReadFetch({
    fetchImpl: async () => new Response('Gateway Timeout', { status: 504 }),
    sleep: async () => {},
  })
  const s = createClient('https://example.supabase.co', 'test-key', { global: { fetch } })
  const { error } = await s.from('employee_salary_profiles').select('id').eq('id', 'private-id')
  assert.equal(error.code, 'REPORT_READ_UNAVAILABLE')
  assert.match(error.message, /employee_salary_profiles.*3 attempts.*504/)
  assert.doesNotMatch(error.message, /private-id|test-key/)
})

test('writes, finalization RPCs, unknown RPCs and Telegram requests are never replayed', async () => {
  for (const [path, method] of [
    [`${base}orders`, 'POST'], [`${base}orders`, 'PATCH'], [`${base}orders`, 'DELETE'],
    [`${base}rpc/generate_daily_kpi_bonuses`, 'POST'],
    [`${base}rpc/generate_employee_daily_meal_expense`, 'POST'],
    [`${base}rpc/unknown`, 'GET'], ['https://api.telegram.org/bot-test/sendPhoto', 'POST'],
  ]) {
    let calls = 0
    const fetch = createReportReadFetch({ fetchImpl: async () => {
      calls += 1
      return new Response('Gateway Timeout', { status: 504 })
    } })
    assert.equal((await fetch(path, { method })).status, 504)
    assert.equal(calls, 1, `${method} ${path}`)
  }
})

test('only allowlisted read RPCs retry, preserving POST bodies', async () => {
  for (const name of ['get_pending_daily_kpi_dates', 'get_pending_employee_meal_dates']) {
    const bodies = []
    const fetch = createReportReadFetch({
      fetchImpl: async request => {
        bodies.push(await request.text())
        return new Response('[]', { status: bodies.length === 1 ? 503 : 200 })
      },
      sleep: async () => {},
    })
    const response = await fetch(new Request(`${base}rpc/${name}`, { method: 'POST', body: '{"p_limit":31}' }))
    assert.equal(response.status, 200)
    assert.deepEqual(bodies, ['{"p_limit":31}', '{"p_limit":31}'])
  }
})

test('authentication and query errors are not retried', async () => {
  for (const status of [400, 401, 403, 404, 409, 500]) {
    let calls = 0
    const fetch = createReportReadFetch({ fetchImpl: async () => {
      calls += 1
      return new Response('{}', { status })
    } })
    assert.equal((await fetch(`${base}orders`)).status, status)
    assert.equal(calls, 1)
  }
})

test('network failures retry and terminate with useful context', async () => {
  let calls = 0
  const fetch = createReportReadFetch({
    fetchImpl: async () => { calls += 1; throw new TypeError('fetch failed') },
    sleep: async () => {},
  })
  await assert.rejects(fetch(`${base}orders`), /orders.*3 attempts.*network error or timeout/)
  assert.equal(calls, 3)
})

test('stalled reads are aborted with a bounded attempt count', async () => {
  let calls = 0
  const fetch = createReportReadFetch({
    timeoutMs: 5,
    fetchImpl: async (_, { signal }) => new Promise((resolve, reject) => {
      calls += 1
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    }),
    sleep: async () => {},
  })
  await assert.rejects(fetch(`${base}orders`), /3 attempts/)
  assert.equal(calls, 3)
})

test('caller cancellation does not trigger another attempt', async () => {
  const controller = new AbortController()
  let calls = 0
  const fetch = createReportReadFetch({ fetchImpl: async () => {
    calls += 1
    controller.abort()
    throw controller.signal.reason
  } })
  await assert.rejects(fetch(`${base}orders`, { signal: controller.signal }), { name: 'AbortError' })
  assert.equal(calls, 1)
})
