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
  assert.equal(closeout.totals.terminal, 50000)
  assert.equal(closeout.totals.qr, undefined)
  assert.equal(closeout.loyaltyIncome, 10000)
  assert.equal(closeout.loyaltyUsed, 10000)
  assert.equal(closeout.cashbackIssued, 5000)
  assert.equal(closeout.cancelledCount, 1)
  assert.equal(closeout.date, '2026-06-01')
  assert.equal(closeout.dateFrom, '2026-06-01')
  assert.equal(closeout.dateTo, '2026-06-01')
  assert.match(closeoutToCsv(closeout), /"Cash","60000"/)
  assert.doesNotMatch(closeoutToCsv(closeout), /"QR"/)
  assert.match(closeoutToCsv(closeout), /"Loyalty income","10000"/)
  assert.match(closeoutToCsv(closeout), /^"Date","2026-06-01"$/m)
  assert.doesNotMatch(closeoutToCsv(closeout), /^"Date range",/m)
})

test('closeout includes both range boundaries and excludes orders outside the selected range', () => {
  const paidOrder = (id, date, total, paymentMethod) => ({
    id,
    status: 'paid',
    payment_status: 'paid',
    paid_at: `${date}T10:00:00Z`,
    total,
    payment_method: paymentMethod,
  })
  const cancelledOrder = (id, date) => ({
    id,
    status: 'cancelled',
    payment_status: 'cancelled',
    updated_at: `${date}T10:00:00Z`,
    total: 0,
  })

  const closeout = getDailyCloseout([
    paidOrder('before', '2026-05-31', 10, 'cash'),
    paidOrder('range-start', '2026-06-01', 100, 'cash'),
    paidOrder('range-middle', '2026-06-02', 200, 'card'),
    paidOrder('range-end', '2026-06-03', 300, 'terminal'),
    paidOrder('after', '2026-06-04', 40, 'cash'),
    cancelledOrder('cancelled-start', '2026-06-01'),
    cancelledOrder('cancelled-end', '2026-06-03'),
    cancelledOrder('cancelled-after', '2026-06-04'),
  ], '2026-06-01', '2026-06-03')

  assert.equal(closeout.dateFrom, '2026-06-01')
  assert.equal(closeout.dateTo, '2026-06-03')
  assert.equal(closeout.date, '2026-06-03')
  assert.equal(closeout.orderCount, 3)
  assert.equal(closeout.revenue, 600)
  assert.equal(closeout.totals.cash, 100)
  assert.equal(closeout.totals.card, 200)
  assert.equal(closeout.totals.terminal, 300)
  assert.equal(closeout.cancelledCount, 2)

  const csv = closeoutToCsv(closeout)
  assert.match(csv, /^"Date range","[^"]*2026-06-01[^"]*2026-06-03[^"]*"$/m)
  assert.doesNotMatch(csv, /^"Date",/m)
})

test('closeout applies selected table and waiter filters to payments and cancellations', () => {
  const paidOrder = (id, tableId, waiterName, total, paymentMethod, minute) => ({
    id,
    table_id: tableId,
    waiter_name: waiterName,
    status: 'paid',
    payment_status: 'paid',
    paid_at: `2026-06-01T10:${minute}:00Z`,
    total,
    payment_method: paymentMethod,
  })
  const cancelledOrder = (id, tableId, waiterName) => ({
    id,
    table_id: tableId,
    waiter_name: waiterName,
    status: 'cancelled',
    payment_status: 'cancelled',
    created_at: '2026-06-01T09:00:00Z',
    updated_at: '2026-06-01T11:00:00Z',
    total: 0,
  })

  const closeout = getDailyCloseout([
    paidOrder('included-a', 'table-1', 'Alice', 40, 'cash', '00'),
    paidOrder('included-b', 'table-1', 'Alice', 60, 'cash', '00'),
    paidOrder('other-table', 'table-2', 'Alice', 200, 'card', '01'),
    paidOrder('other-waiter', 'table-1', 'Bob', 300, 'terminal', '02'),
    cancelledOrder('cancelled-included-a', 'table-1', 'Alice'),
    cancelledOrder('cancelled-included-b', 'table-1', 'Alice'),
    cancelledOrder('cancelled-other-table', 'table-2', 'Alice'),
    cancelledOrder('cancelled-other-waiter', 'table-1', 'Bob'),
  ], '2026-06-01', '2026-06-01', {
    tableId: 'table-1',
    waiterName: 'Alice',
  })

  assert.equal(closeout.orderCount, 1)
  assert.equal(closeout.revenue, 100)
  assert.equal(closeout.totals.cash, 100)
  assert.equal(closeout.totals.card, 0)
  assert.equal(closeout.totals.terminal, 0)
  assert.equal(closeout.cancelledCount, 2)
})
