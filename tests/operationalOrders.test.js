import test from 'node:test'
import assert from 'node:assert/strict'

import { mergeOperationalOrders } from '../src/lib/db.js'

test('operational order state keeps every active order regardless of age plus paid-today context', () => {
  const activeOrders = [
    { id: 'active-old', payment_status: 'unpaid', created_at: '2024-01-10T10:00:00+05:00' },
    { id: 'active-new', payment_status: null, created_at: '2026-07-16T10:00:00+05:00' },
    { id: 'same', payment_status: 'unpaid', source: 'active' },
  ]
  const paidTodayOrders = [
    { id: 'paid-today', payment_status: 'paid', paid_at: '2026-07-16T11:00:00+05:00' },
    { id: 'same', payment_status: 'paid', source: 'paid' },
  ]

  const merged = mergeOperationalOrders(activeOrders, paidTodayOrders)

  assert.deepEqual(new Set(merged.map(order => order.id)), new Set([
    'active-old',
    'active-new',
    'paid-today',
    'same',
  ]))
  assert.equal(merged.find(order => order.id === 'same').source, 'active')
})
