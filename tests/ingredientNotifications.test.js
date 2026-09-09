import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildIngredientInvestorMessage, deliverIngredientNotification, loadIngredientInvestorTarget } from '../api/telegram/_lib/ingredientNotifications.js'

const snapshot = {
  event_type: 'updated', actor_name: '<Admin>', changed_at: '2026-09-09T10:00:00Z',
  before: { name: 'Flour', category: 'groceries', unit: 'kg', normal_unit_price: 10000, is_active: true },
  after: { name: 'Premium <flour>', category: 'groceries', unit: 'kg', normal_unit_price: 12000, is_active: true },
}

function ledger(snapshotValue = snapshot) {
  const row = { id: 'r1', status: 'queued', snapshot: snapshotValue }
  return { row, from() {
    let patch = null
    const filters = []
    const query = {
      update(value) { patch = value; return this },
      eq(key, value) { filters.push([key, value]); return this },
      select() { return this }, maybeSingle() { return this },
      then(resolve) {
        const matches = filters.every(([key, value]) => row[key] === value)
        if (matches) Object.assign(row, patch)
        return Promise.resolve({ data: matches ? { ...row } : null, error: null }).then(resolve)
      },
    }
    return query
  } }
}

test('ingredient edits render immutable before/after prices, names, actor, and Tashkent time', () => {
  const message = buildIngredientInvestorMessage(snapshot)
  assert.match(message, /Изменён ингредиент/)
  assert.match(message, /Flour → <b>Premium &lt;flour&gt;<\/b>/)
  assert.match(message, /10\s000 UZS → <b>12\s000 UZS<\/b>/)
  assert.match(message, /&lt;Admin&gt;/)
  assert.match(message, /15:00/)
  assert.doesNotMatch(message, /<Admin>|Premium <flour>/)
  assert.ok(message.length < 4096)
})

test('creation, archival and restoration have distinct messages', () => {
  for (const [event_type, title] of [['created', 'Добавлен'], ['archived', 'удалён (в архив)'], ['restored', 'восстановлен']]) {
    const message = buildIngredientInvestorMessage({ ...snapshot, event_type, before: null })
    assert.ok(message.includes(title))
    assert.doesNotMatch(message, /→/)
  }
})

test('parallel workers claim an ingredient event once and persist Telegram receipt before marking sent', async () => {
  const db = ledger()
  let count = 0
  const send = async () => { count += 1; return { result: { message_id: 123 } } }
  const results = await Promise.all([deliverIngredientNotification(db, db.row, 'investor', send), deliverIngredientNotification(db, db.row, 'investor', send)])
  assert.equal(count, 1)
  assert.equal(db.row.status, 'sent')
  assert.deepEqual(db.row.telegram_message_ids, [123])
  assert.ok(results.some(result => result.status === 'duplicate'))
  await deliverIngredientNotification(db, db.row, 'investor', send)
  assert.equal(count, 1)
})

test('uncertain Telegram sends and missing receipts stay held and are not automatically resent', async () => {
  for (const send of [async () => { throw new Error('network timeout') }, async () => ({ ok: true })]) {
    const db = ledger()
    const result = await deliverIngredientNotification(db, db.row, 'investor', send)
    assert.equal(result.needsReview, true)
    assert.equal(db.row.status, 'processing')
    assert.ok(db.row.error_message)
    assert.equal((await deliverIngredientNotification(db, db.row, 'investor', () => assert.fail('must not resend'))).status, 'duplicate')
  }
})

test('only the configured Investor target is used; disabled and absent targets remain silent', async () => {
  const db = data => ({ from(table) { assert.equal(table, 'telegram_notification_targets'); return { select(){return this}, eq(k,v){assert.equal(v,'salary_events');return this}, maybeSingle:async()=>({data,error:null}) } } })
  assert.equal(await loadIngredientInvestorTarget(db({is_enabled:true,chat_id:'investor'})), 'investor')
  assert.equal(await loadIngredientInvestorTarget(db({is_enabled:false}), {TELEGRAM_SALARY_PAYMENTS_CHAT_ID:'fallback'}), '')
  assert.equal(await loadIngredientInvestorTarget(db(null), {TELEGRAM_TEAM_CHAT_ID:'team'}), '')
})

test('ingredient dispatch uses the existing cron-authenticated endpoint', () => {
  const endpoint = readFileSync(new URL('../api/telegram/daily-salary.js', import.meta.url), 'utf8')
  assert.equal((endpoint.match(/await drainIngredientNotifications\(supabase\)/g) || []).length, 1)
  assert.ok(endpoint.indexOf('requireCronSecret(req)', endpoint.indexOf('export default')) < endpoint.indexOf("cronTask === 'ingredient-events'"))
  const sql = readFileSync(new URL('../supabase/189_ingredient_investor_notifications.sql', import.meta.url), 'utf8')
  assert.match(sql, /revoke all on public.ingredient_investor_notifications from public, anon, authenticated/)
  assert.match(sql, /before_value = after_value then return new/)
  assert.match(sql, /auth.uid\(\) is null or new.is_catalog_managed is not true/)
})
