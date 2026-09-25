import test from 'node:test'
import assert from 'node:assert/strict'
import { loadActiveOrderWaiterNames, getActiveWaiterNames } from '../src/lib/activeOrderWaiters.js'

const order = { id: 'order-1', opened_by: 'user-1', opened_by_name: 'Oleg', waiter_name: 'Oleg', payment_status: 'unpaid', status: 'needs_bill' }
function client(result) {
  return { from(table) {
    assert.equal(table, 'profiles')
    return { select(fields) {
      assert.equal(fields, 'id, full_name')
      return { in(field, ids) {
        assert.equal(field, 'id')
        assert.deepEqual(ids, ['user-1'])
        return Promise.resolve(result)
      } }
    } }
  } }
}

test('active orders use current profile name without changing actor snapshots or history', async () => {
  const paid = { ...order, id: 'paid', payment_status: 'paid' }
  const cancelled = { ...order, id: 'cancelled', status: 'cancelled' }
  const settled = { ...order, id: 'settled', paid_at: '2026-09-25T10:00:00Z' }
  const result = await loadActiveOrderWaiterNames([order, paid, cancelled, settled], client({ data: [{ id: 'user-1', full_name: 'Asil' }] }))
  assert.equal(result[0].waiter_name, 'Asil')
  assert.equal(result[0].opened_by_name, 'Oleg')
  assert.equal(order.waiter_name, 'Oleg')
  assert.equal(result[1], paid)
  assert.equal(result[2], cancelled)
  assert.equal(result[3], settled)
})

test('missing, blank and unavailable profiles retain saved waiter names', async () => {
  for (const response of [{ data: [] }, { data: [{ id: 'user-1', full_name: ' ' }] }, { error: new Error('offline') }]) {
    const result = await loadActiveOrderWaiterNames([order], client(response))
    assert.equal(result[0], order)
  }
  const legacy = { ...order, opened_by: null }
  assert.deepEqual(await loadActiveOrderWaiterNames([legacy], {}), [legacy])
})

test('table labels include all distinct assigned names and omit empty labels', () => {
  assert.deepEqual(getActiveWaiterNames([{ waiter_name: 'Asil' }, { waiter_name: 'Asil' }, { waiter_name: 'Ali' }, {}]), ['Asil', 'Ali'])
})
