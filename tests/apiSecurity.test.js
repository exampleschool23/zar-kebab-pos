import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  assertImageFile,
  keyFromR2Url,
  normalizeMenuObjectKey,
} from '../api/menu-image/_lib/r2.js'

const root = new URL('..', import.meta.url).pathname
const readSource = path => readFileSync(`${root}/${path}`, 'utf8')

test('menu image validation checks raster file signatures and rejects SVG or disguised content', async () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  await assert.doesNotReject(assertImageFile({ buffer: png, contentType: 'image/png' }))
  await assert.rejects(
    assertImageFile({ buffer: Buffer.from('<svg></svg>'), contentType: 'image/svg+xml' }),
    /Only JPEG, PNG, WebP, GIF, or AVIF/,
  )
  await assert.rejects(
    assertImageFile({ buffer: Buffer.from('not a png'), contentType: 'image/png' }),
    /do not match/,
  )
})

test('R2 object keys are limited to flat product and category menu paths', () => {
  assert.equal(normalizeMenuObjectKey('menu/products/dish-123.webp'), 'menu/products/dish-123.webp')
  assert.equal(normalizeMenuObjectKey('/menu/categories/main.png'), 'menu/categories/main.png')
  assert.equal(keyFromR2Url('menu/products/dish-123.webp'), 'menu/products/dish-123.webp')
  assert.equal(normalizeMenuObjectKey('private/backups/data.json'), '')
  assert.equal(normalizeMenuObjectKey('menu/products/../secret.webp'), '')
  assert.equal(normalizeMenuObjectKey('menu/products/nested/dish.webp'), '')
  assert.equal(normalizeMenuObjectKey('menu%2Fproducts%2F..%2Fsecret.webp'), '')
})

test('Telegram order creation uses one service-role-only transactional RPC', () => {
  const api = readSource('api/telegram/order.js')
  const migration = readSource('supabase/101_atomic_telegram_orders.sql')

  assert.match(api, /supabase\.rpc\('create_telegram_order'/)
  assert.doesNotMatch(api, /\.from\('orders'\)[\s\S]{0,120}\.insert\(orderInsert\)/)
  assert.doesNotMatch(api, /\.from\('order_items'\)[\s\S]{0,120}\.insert/)
  assert.match(migration, /insert into public\.orders[\s\S]*insert into public\.order_items/)
  assert.match(migration, /revoke all on function public\.create_telegram_order\(jsonb\) from public, anon, authenticated/)
  assert.match(migration, /grant execute on function public\.create_telegram_order\(jsonb\) to service_role/)
})

test('Telegram loyalty responses are minimal and active zero-balance cards remain valid', () => {
  const lookup = readSource('api/telegram/loyalty/[cardNumber].js')
  const order = readSource('api/telegram/order.js')

  assert.match(lookup, /select\('balance, cashback_type, is_active'\)/)
  assert.doesNotMatch(lookup, /select\('\*'\)/)
  assert.doesNotMatch(lookup, /card:\s*data/)
  assert.match(lookup, /const valid = !!data && data\.is_active !== false/)
  assert.match(order, /select\('card_number, balance, cashback_type, is_active'\)/)
  assert.match(order, /!loyaltyCard \|\| loyaltyCard\.is_active === false/)
  assert.doesNotMatch(order, /balance <= 0/)
})
