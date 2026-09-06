import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildGameClubTeamMessages, deliverGameClubNotification, loadGameClubTeamTarget } from '../api/telegram/_lib/gameClubNotifications.js'

const snapshot = {
  actor_name: 'Jasurbek', submitted_at: '2026-09-06T13:45:00Z', price_mode: 'regular', total: 60000,
  items: [{ name: 'Люля-кебаб', quantity: 2, price: 24000 }, { name: 'Кока-Кола', quantity: 1, price: 12000 }],
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

test('approved Team format uses adding actor, Tashkent date, receipt table and subtotal only', () => {
  const [message] = buildGameClubTeamMessages(snapshot)
  assert.match(message, /Новый заказ — Игровой клуб/)
  assert.match(message, /Дата: 06\.09\.2026, 18:45/)
  assert.match(message, /Добавил: Jasurbek/)
  assert.match(message, /Тип меню: Обычное/)
  assert.match(message, /<pre>Позиция\s+Кол\s+Сумма/)
  assert.match(message, /Люля-кебаб\s+2\s+48 000/)
  assert.match(message, /Сумма заказа: 60 000 UZS/)
  assert.doesNotMatch(message, /Официант|GC-|Отправлен|Прибыль|Доход|Оплата|Сервис/)
})

test('message escapes actor/product HTML and supports Tourist prices and weighted items', () => {
  const [message] = buildGameClubTeamMessages({ ...snapshot, actor_name: '<Alice & Bob>', price_mode: 'tourist', total: 25000,
    items: [{ name: '<Kebab>', price: 100000, quantity: 0.25, sale_unit: 'kg' }] })
  assert.match(message, /&lt;Alice &amp; Bob&gt;/)
  assert.match(message, /&lt;Kebab&gt;/)
  assert.match(message, /Туристическое/)
  assert.match(message, /25 000/)
})

test('large submissions split into bounded messages without dropping rows or repeating total', () => {
  const messages = buildGameClubTeamMessages({ ...snapshot, items: Array.from({length: 180}, (_, i) => ({name: `Блюдо ${i}`, quantity: 1, price: 1000})) })
  assert.ok(messages.length > 1)
  for (const message of messages) assert.ok(message.length <= 4096)
  assert.equal((messages.join('').match(/Блюдо /g) || []).length, 180)
  assert.equal((messages.join('').match(/Сумма заказа/g) || []).length, 1)
})

test('parallel workers claim a round once and persist Telegram receipt before marking sent', async () => {
  const db = ledger()
  let count = 0
  const send = async () => { count += 1; return { result: { message_id: 123 } } }
  const results = await Promise.all([deliverGameClubNotification(db, db.row, 'team', send), deliverGameClubNotification(db, db.row, 'team', send)])
  assert.equal(count, 1)
  assert.equal(db.row.status, 'sent')
  assert.deepEqual(db.row.telegram_message_ids, [123])
  assert.ok(results.some(result => result.status === 'duplicate'))
  await deliverGameClubNotification(db, db.row, 'team', send)
  assert.equal(count, 1)
})

test('uncertain Telegram sends and missing receipts stay held and are not automatically resent', async () => {
  for (const send of [async () => { throw new Error('network timeout') }, async () => ({ ok: true })]) {
    const db = ledger()
    const result = await deliverGameClubNotification(db, db.row, 'team', send)
    assert.equal(result.needsReview, true)
    assert.equal(db.row.status, 'processing')
    assert.ok(db.row.error_message)
    assert.equal((await deliverGameClubNotification(db, db.row, 'team', () => assert.fail('must not resend'))).status, 'duplicate')
  }
})

test('Team target honors configured disable and never falls back to completed-orders group', async () => {
  const db = data => ({ from(table) { assert.equal(table, 'telegram_notification_targets'); return {select(){return this},eq(k,v){assert.equal(v,'team_events');return this},maybeSingle:async()=>({data,error:null})} } })
  assert.equal(await loadGameClubTeamTarget(db({is_enabled:true,chat_id:'team-db'}), {TELEGRAM_TEAM_CHAT_ID:'team-env'}), 'team-db')
  assert.equal(await loadGameClubTeamTarget(db({is_enabled:false}), {TELEGRAM_TEAM_CHAT_ID:'team-env'}), '')
  assert.equal(await loadGameClubTeamTarget(db(null), {TELEGRAM_COMPLETED_ORDERS_CHAT_ID:'other'}), '')
})

test('database snapshots complete new rounds at commit, with actor identity and no protected payloads or backfill', () => {
  const sql = readFileSync(new URL('../supabase/180_game_club_team_notifications.sql', import.meta.url), 'utf8')
  assert.match(sql, /after insert on public.order_kitchen_rounds deferrable initially deferred/)
  assert.match(sql, /saved_order.order_type is distinct from 'game_club'/)
  assert.match(sql, /where id = auth.uid\(\)/)
  assert.match(sql, /item.id = any\(saved_round.item_ids\)/)
  assert.match(sql, /unique \(order_id, kitchen_round_id\)/)
  assert.match(sql, /on conflict \(order_id, kitchen_round_id\) do nothing/)
  assert.match(sql, /revoke all on public.game_club_team_notifications from public, anon, authenticated/)
  assert.doesNotMatch(sql, /cost_price|profit|recipe/i)
  const endpoint = readFileSync(new URL('../api/telegram/daily-salary.js', import.meta.url), 'utf8')
  assert.ok(endpoint.indexOf('requireCronSecret(req)', endpoint.indexOf('export default')) < endpoint.indexOf("cronTask === 'game-club-orders'"))
})
