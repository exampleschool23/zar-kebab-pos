import test from 'node:test'
import assert from 'node:assert/strict'
import { sendTrackedOrderStatusMessage, retractDeletedOrderStatusMessages } from '../api/telegram/_lib/orderStatusDelivery.js'

function database(rows = []) {
  return { rows, from() {
    let predicates = [], patch, insert
    const q = {
      select() { return q }, order() { return q }, limit() { return q },
      eq(k, v) { predicates.push(r => r[k] === v); return q },
      is(k, v) { predicates.push(r => (r[k] ?? null) === v); return q },
      not(k) { predicates.push(r => r[k] != null); return q },
      overlaps(k, v) { predicates.push(r => r[k].some(id => v.includes(id))); return q },
      insert(v) { insert = v; return q }, update(v) { patch = v; return q },
      then(resolve, reject) { return Promise.resolve().then(() => {
        if (insert) rows.push({ delete_requested: false, ...insert })
        const selected = rows.filter(r => predicates.every(p => p(r)))
        if (patch) selected.forEach(r => Object.assign(r, patch))
        return { data: structuredClone(selected) }
      }).then(resolve, reject) },
    }
    return q
  } }
}
async function telegram(run) {
  const previous = global.fetch, token = process.env.TELEGRAM_BOT_TOKEN
  process.env.TELEGRAM_BOT_TOKEN = 'test'
  const calls = []
  global.fetch = async (url, opts) => {
    calls.push({ method: url.split('/').at(-1), ...JSON.parse(opts.body) })
    return { ok: true, json: async () => ({ ok: true, result: { message_id: 42 } }) }
  }
  try { await run(calls) } finally {
    global.fetch = previous
    if (token === undefined) delete process.env.TELEGRAM_BOT_TOKEN
    else process.env.TELEGRAM_BOT_TOKEN = token
  }
}
test('tracks combined order IDs and deletes only requested group messages once', async () => telegram(async calls => {
  const db = database()
  await sendTrackedOrderStatusMessage(db, ['a', 'b'], '-100', 'receipt')
  await sendTrackedOrderStatusMessage(db, ['c'], '-200', 'other')
  assert.deepEqual(db.rows[0].order_ids, ['a', 'b'])
  assert.equal(db.rows[0].message_id, '42')
  db.rows[0].delete_requested = true
  await retractDeletedOrderStatusMessages(db, ['b'])
  await retractDeletedOrderStatusMessages(db)
  assert.equal(calls.filter(c => c.method === 'deleteMessage').length, 1)
  assert.equal(calls.at(-1).chat_id, '-100')
  assert.ok(db.rows[0].deleted_at)
  assert.equal(db.rows[1].deleted_at, undefined)
}))
test('missing messages succeed but permission errors stay retryable', async () => telegram(async () => {
  const db = database([{ id: 'one', order_ids: ['a'], chat_id: '-100', message_id: '42', delete_requested: true }])
  global.fetch = async () => ({ ok: false, json: async () => ({ ok: false, description: 'not enough rights' }) })
  assert.equal((await retractDeletedOrderStatusMessages(db)).ok, false)
  assert.match(db.rows[0].error_message, /rights/)
  assert.equal(db.rows[0].deleted_at, undefined)
  global.fetch = async () => ({ ok: false, json: async () => ({ ok: false, description: 'Bad Request: message to delete not found' }) })
  assert.equal((await retractDeletedOrderStatusMessages(db)).ok, true)
  assert.ok(db.rows[0].deleted_at)
}))
test('deletion during a send is reconciled after its message ID is saved', async () => telegram(async () => {
  const db = database()
  const fetch = global.fetch
  global.fetch = async (...args) => {
    if (args[0].endsWith('/sendMessage')) db.rows[0].delete_requested = true
    return fetch(...args)
  }
  await sendTrackedOrderStatusMessage(db, ['a'], '-100', 'receipt')
  assert.ok(db.rows[0].deleted_at)
}))
test('unknown sends retain their reservation without inventing a message ID or resending', async () => telegram(async () => {
  const db = database()
  let attempts = 0
  global.fetch = async () => { attempts++; throw new Error('timeout') }
  await assert.rejects(sendTrackedOrderStatusMessage(db, ['a'], '-100', 'receipt'), /timeout/)
  db.rows[0].delete_requested = true
  await retractDeletedOrderStatusMessages(db)
  assert.equal(attempts, 1)
  assert.equal(db.rows[0].message_id, undefined)
}))
