import test from 'node:test'
import assert from 'node:assert/strict'

import { closeoutToCsv, getDailyCloseout } from '../src/lib/closeout.js'

test('daily closeout reconciles payment methods loyalty cashback cancellations and exports csv', () => {
  const closeout = getDailyCloseout([
    {
      id: 'o1',
      status: 'paid',
      payment_status: 'paid',
      paid_at: '2026-06-01T10:00:00Z',
      total: 100000,
      payment_method: 'mixed',
      loyalty_used_amount: 10000,
      cashback_earned: 5000,
      payments: [
        { method: 'cash', amount: 60000 },
        { method: 'card', amount: 40000 },
      ],
    },
    {
      id: 'o2',
      status: 'paid',
      payment_status: 'paid',
      paid_at: '2026-06-01T11:00:00Z',
      total: 50000,
      payment_method: 'qr',
    },
    {
      id: 'o3',
      status: 'cancelled',
      payment_status: 'cancelled',
      updated_at: '2026-06-01T12:00:00Z',
      total: 0,
    },
  ], '2026-06-01')

  assert.equal(closeout.orderCount, 2)
  assert.equal(closeout.revenue, 150000)
  assert.equal(closeout.totals.cash, 60000)
  assert.equal(closeout.totals.card, 40000)
  assert.equal(closeout.totals.qr, 50000)
  assert.equal(closeout.loyaltyUsed, 10000)
  assert.equal(closeout.cashbackIssued, 5000)
  assert.equal(closeout.cancelledCount, 1)
  assert.match(closeoutToCsv(closeout), /"Cash","60000"/)
})
