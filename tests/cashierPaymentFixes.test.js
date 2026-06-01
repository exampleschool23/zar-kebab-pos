/**
 * Regression tests for three cashier payment bugs fixed in June 2026:
 *
 * Bug 1 – MARK_ORDER_PAID by orderId did not reset the table to 'available'.
 *   Reducer skipped the table update when orderId was provided; DB writer also
 *   skipped the table status update under the same condition.
 *
 * Bug 2 – MARK_TABLE_NEEDS_BILL failed for orders whose payment_status is NULL
 *   (legacy orders created before the field was standardised). The DB query used
 *   .eq('payment_status','unpaid') which silently matched 0 rows, causing
 *   assertUpdatedRows to throw → "Could not save changes" error.
 *
 * Bug 3 – CONFIRM_ORDER_DELIVERED had the same NULL-payment_status issue.
 *   The DB query used .eq('payment_status','unpaid'), which returned 0 rows for
 *   legacy orders. The if (tableOrders?.length) guard silently skipped the update
 *   so the DB write appeared to succeed, but on realtime reload the order came
 *   back with its original item statuses — causing a mismatch in item count and
 *   total shown to the waiter.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { ordersReducer } from '../src/store/ordersReducer.js'

// ─── helpers ─────────────────────────────────────────────────────────────────

function item(overrides) {
  return {
    id: overrides.id,
    menu_item_id: overrides.menu_item_id || 'kebab',
    name: overrides.name || 'Kebab',
    price: overrides.price ?? 25000,
    quantity: overrides.quantity ?? 1,
    status: overrides.status || 'new',
    ...overrides,
  }
}

/** Baseline state with one occupied table and one active order. */
function baseState(overrides = {}) {
  return {
    settings: { serviceRate: 15 },
    user: { name: 'Cashier' },
    currentTableId: 't1',
    tables: [
      { id: 't1', name: 'Table 1', status: 'occupied' },
      { id: 't2', name: 'Table 2', status: 'available' },
    ],
    orders: [
      {
        id: 'o1',
        table_id: 't1',
        table_name: 'Table 1',
        status: 'needs_bill',
        payment_status: 'unpaid',
        order_type: 'dine_in',
        service_rate_pct: 15,
        items: [item({ id: 'i1', price: 100000, quantity: 1, status: 'served' })],
        subtotal: 100000,
        service_fee: 15000,
        total: 115000,
      },
    ],
    cart: [],
    ...overrides,
  }
}

// ─── Bug 1: MARK_ORDER_PAID by orderId must reset the table ──────────────────

test('Bug1 – paying a specific orderId resets the table to available', () => {
  const state = baseState()

  const next = ordersReducer(state, {
    type: 'MARK_ORDER_PAID',
    payload: {
      orderId: 'o1',
      tableId: undefined,
      payment_method: 'cash',
    },
  })

  assert.equal(next.orders[0].payment_status, 'paid', 'order should be marked paid')
  assert.equal(next.tables[0].status, 'available', 'table should be reset to available')
  assert.equal(next.tables[0].reserved_for_name, '', 'reservation fields should be cleared')
})

test('Bug1 – paying by tableId still resets the table (regression guard)', () => {
  const state = baseState()

  const next = ordersReducer(state, {
    type: 'MARK_ORDER_PAID',
    payload: {
      tableId: 't1',
      payment_method: 'cash',
    },
  })

  assert.equal(next.orders[0].payment_status, 'paid')
  assert.equal(next.tables[0].status, 'available')
})

test('Bug1 – paying orderId keeps table occupied when another unpaid order remains', () => {
  const state = baseState({
    orders: [
      {
        id: 'o1',
        table_id: 't1',
        status: 'needs_bill',
        payment_status: 'unpaid',
        order_type: 'dine_in',
        service_rate_pct: 15,
        items: [item({ id: 'i1', price: 50000, quantity: 1, status: 'served' })],
        subtotal: 50000,
        service_fee: 7500,
        total: 57500,
      },
      {
        id: 'o2',
        table_id: 't1',
        status: 'sent_to_kitchen',
        payment_status: 'unpaid',
        order_type: 'dine_in',
        service_rate_pct: 15,
        items: [item({ id: 'i2', price: 30000, quantity: 1, status: 'new' })],
        subtotal: 30000,
        service_fee: 4500,
        total: 34500,
      },
    ],
  })

  const next = ordersReducer(state, {
    type: 'MARK_ORDER_PAID',
    payload: { orderId: 'o1', payment_method: 'cash' },
  })

  assert.equal(next.orders.find(o => o.id === 'o1').payment_status, 'paid')
  assert.equal(next.orders.find(o => o.id === 'o2').payment_status, 'unpaid', 'other order untouched')
  assert.equal(next.tables[0].status, 'occupied', 'table stays occupied — another order still open')
})

test('Bug1 – paying orderId for a take-away order does not touch any dine-in table', () => {
  const state = {
    settings: { serviceRate: 15 },
    user: { name: 'Cashier' },
    currentTableId: null,
    tables: [{ id: 't1', name: 'Table 1', status: 'available' }],
    orders: [
      {
        id: 'ta1',
        table_id: null,
        table_name: 'Take Away',
        order_number: 'TA-0001',
        status: 'needs_bill',
        payment_status: 'unpaid',
        order_type: 'take_away',
        service_rate_pct: 0,
        items: [item({ id: 'ti1', price: 40000, quantity: 1, status: 'served' })],
        subtotal: 40000,
        service_fee: 0,
        total: 40000,
      },
    ],
    cart: [],
  }

  const next = ordersReducer(state, {
    type: 'MARK_ORDER_PAID',
    payload: { orderId: 'ta1', payment_method: 'cash' },
  })

  assert.equal(next.orders[0].payment_status, 'paid')
  assert.equal(next.tables[0].status, 'available', 'dine-in table must not be touched')
})

test('Bug1 – reservation fields are cleared when table is reset via orderId payment', () => {
  const state = baseState({
    tables: [
      {
        id: 't1',
        name: 'Table 1',
        status: 'needs_bill',
        reserved_for_name: 'Aziz',
        reserved_for_phone: '+998901234567',
        reserved_at: '2026-06-01T19:00:00Z',
        reserved_until: '2026-06-01T21:00:00Z',
        reservation_notes: 'Birthday',
      },
    ],
  })

  const next = ordersReducer(state, {
    type: 'MARK_ORDER_PAID',
    payload: { orderId: 'o1', payment_method: 'card' },
  })

  const t = next.tables[0]
  assert.equal(t.status, 'available')
  assert.equal(t.reserved_for_name, '')
  assert.equal(t.reserved_for_phone, '')
  assert.equal(t.reserved_at, null)
  assert.equal(t.reserved_until, null)
  assert.equal(t.reservation_notes, '')
})

// ─── Bug 1: unrelated tables must never be affected ──────────────────────────

test('Bug1 – unrelated tables are not touched when paying one specific order', () => {
  const state = {
    settings: { serviceRate: 15 },
    user: { name: 'Cashier' },
    currentTableId: 't1',
    tables: [
      { id: 't1', name: 'Table 1', status: 'needs_bill' },
      { id: 't2', name: 'Table 2', status: 'occupied' },
    ],
    orders: [
      {
        id: 'o1',
        table_id: 't1',
        status: 'needs_bill',
        payment_status: 'unpaid',
        order_type: 'dine_in',
        service_rate_pct: 15,
        items: [item({ id: 'i1', price: 100000, quantity: 1, status: 'served' })],
        subtotal: 100000,
        service_fee: 15000,
        total: 115000,
      },
      {
        id: 'o2',
        table_id: 't2',
        status: 'sent_to_kitchen',
        payment_status: 'unpaid',
        order_type: 'dine_in',
        service_rate_pct: 15,
        items: [item({ id: 'i2', price: 50000, quantity: 1, status: 'new' })],
        subtotal: 50000,
        service_fee: 7500,
        total: 57500,
      },
    ],
    cart: [],
  }

  const next = ordersReducer(state, {
    type: 'MARK_ORDER_PAID',
    payload: { orderId: 'o1', payment_method: 'cash' },
  })

  assert.equal(next.tables.find(t => t.id === 't1').status, 'available', 't1 paid → available')
  assert.equal(next.tables.find(t => t.id === 't2').status, 'occupied', 't2 untouched')
})

// ─── Bug 2: MARK_TABLE_NEEDS_BILL with legacy null payment_status (reducer) ──

test('Bug2 – MARK_TABLE_NEEDS_BILL marks legacy order with null payment_status in reducer', () => {
  // The reducer does not filter by payment_status — it matches all orders for the
  // table. This test confirms the reducer works even for legacy orders stored without
  // payment_status (the field may be missing/null on old records).
  const state = {
    settings: { serviceRate: 15 },
    user: { name: 'Waiter' },
    currentTableId: 't1',
    tables: [{ id: 't1', name: 'Table 2', status: 'occupied' }],
    orders: [
      {
        id: 'legacy-o1',
        table_id: 't1',
        status: 'delivered',
        payment_status: null,   // ← legacy: no payment_status in DB
        order_type: 'dine_in',
        service_rate_pct: 15,
        items: [item({ id: 'li1', price: 100000, quantity: 24, status: 'served' })],
        subtotal: 2400000,
        service_fee: 360000,
        total: 2760000,
      },
    ],
    cart: [],
  }

  const next = ordersReducer(state, {
    type: 'MARK_TABLE_NEEDS_BILL',
    payload: 't1',
  })

  assert.equal(next.tables[0].status, 'needs_bill')
  assert.equal(next.orders[0].status, 'needs_bill', 'legacy order should be updated in reducer')
})

test('Bug2 – MARK_TABLE_NEEDS_BILL marks orders with both unpaid and null payment_status', () => {
  // Mixed state: one order has payment_status='unpaid', another has null (legacy)
  const state = {
    settings: { serviceRate: 15 },
    user: { name: 'Waiter' },
    currentTableId: 't1',
    tables: [{ id: 't1', name: 'Table 2', status: 'occupied' }],
    orders: [
      {
        id: 'o-unpaid',
        table_id: 't1',
        status: 'delivered',
        payment_status: 'unpaid',
        order_type: 'dine_in',
        service_rate_pct: 15,
        items: [item({ id: 'i1', price: 25000, quantity: 1, status: 'served' })],
        subtotal: 25000,
        service_fee: 3750,
        total: 28750,
      },
      {
        id: 'o-legacy',
        table_id: 't1',
        status: 'delivered',
        payment_status: null,
        order_type: 'dine_in',
        service_rate_pct: 15,
        items: [item({ id: 'i2', price: 80000, quantity: 1, status: 'served' })],
        subtotal: 80000,
        service_fee: 12000,
        total: 92000,
      },
    ],
    cart: [],
  }

  const next = ordersReducer(state, {
    type: 'MARK_TABLE_NEEDS_BILL',
    payload: 't1',
  })

  assert.equal(next.tables[0].status, 'needs_bill')
  assert.equal(next.orders.find(o => o.id === 'o-unpaid').status, 'needs_bill')
  assert.equal(next.orders.find(o => o.id === 'o-legacy').status, 'needs_bill')
})

test('Bug2 – MARK_TABLE_NEEDS_BILL does not touch already-paid orders', () => {
  const state = {
    settings: { serviceRate: 15 },
    user: { name: 'Waiter' },
    currentTableId: 't1',
    tables: [{ id: 't1', name: 'Table 1', status: 'occupied' }],
    orders: [
      {
        id: 'o-paid',
        table_id: 't1',
        status: 'paid',
        payment_status: 'paid',
        order_type: 'dine_in',
        items: [item({ id: 'pi', price: 50000, quantity: 1, status: 'served' })],
        subtotal: 50000,
        service_fee: 7500,
        total: 57500,
      },
      {
        id: 'o-active',
        table_id: 't1',
        status: 'delivered',
        payment_status: 'unpaid',
        order_type: 'dine_in',
        service_rate_pct: 15,
        items: [item({ id: 'ai', price: 30000, quantity: 1, status: 'served' })],
        subtotal: 30000,
        service_fee: 4500,
        total: 34500,
      },
    ],
    cart: [],
  }

  const next = ordersReducer(state, {
    type: 'MARK_TABLE_NEEDS_BILL',
    payload: 't1',
  })

  assert.equal(next.orders.find(o => o.id === 'o-paid').status, 'paid', 'paid order untouched')
  assert.equal(next.orders.find(o => o.id === 'o-active').status, 'needs_bill')
})

// ─── Bug 3: CONFIRM_ORDER_DELIVERED with legacy null payment_status (reducer) ─

test('Bug3 – CONFIRM_ORDER_DELIVERED marks legacy null-payment_status order as delivered', () => {
  // The reducer uses `o.payment_status !== 'paid'` which correctly matches null.
  // This test guards against that being changed back to an equality check.
  const state = {
    settings: { serviceRate: 15 },
    user: { name: 'Waiter' },
    currentTableId: 't1',
    tables: [{ id: 't1', name: 'Table 2', status: 'occupied' }],
    orders: [
      {
        id: 'legacy-o1',
        table_id: 't1',
        status: 'sent_to_kitchen',
        payment_status: null,   // ← legacy order: no payment_status
        order_type: 'dine_in',
        service_rate_pct: 15,
        items: [
          item({ id: 'a1', price: 25000, quantity: 5, status: 'ready' }),
          item({ id: 'a2', price: 12000, quantity: 3, status: 'ready' }),
        ],
        subtotal: 161000,
        service_fee: 24150,
        total: 185150,
      },
    ],
    cart: [],
  }

  const next = ordersReducer(state, {
    type: 'CONFIRM_ORDER_DELIVERED',
    payload: 't1',
  })

  assert.equal(next.orders[0].status, 'delivered', 'legacy order must be marked delivered')
  assert.equal(next.orders[0].items[0].status, 'served', 'all items must be served')
  assert.equal(next.orders[0].items[1].status, 'served')
})

test('Bug3 – CONFIRM_ORDER_DELIVERED item counts and totals are consistent before and after', () => {
  // Simulates the real screenshot bug: x24 items / 1,090,800 UZS before vs
  // x18 items / 932,400 UZS after confirm — caused by DB not updating legacy
  // order so realtime reload brought back old state with different counts.
  // The reducer fix ensures the local state is always correct regardless of DB.
  const items = [
    item({ id: 'i1', price: 25000, quantity: 6, status: 'ready' }),
    item({ id: 'i2', price: 32000, quantity: 8, status: 'ready' }),
    item({ id: 'i3', price: 12000, quantity: 10, status: 'ready' }),
  ]
  const state = {
    settings: { serviceRate: 15 },
    user: { name: 'Waiter' },
    currentTableId: 't1',
    tables: [{ id: 't1', name: 'Table 2', status: 'occupied' }],
    orders: [
      {
        id: 'o-legacy',
        table_id: 't1',
        status: 'sent_to_kitchen',
        payment_status: null,
        order_type: 'dine_in',
        service_rate_pct: 15,
        items,
        subtotal: 526000,
        service_fee: 78900,
        total: 604900,
      },
    ],
    cart: [],
  }

  const before = state.orders[0].items.reduce((s, i) => s + i.quantity, 0)
  assert.equal(before, 24, '24 items before confirm')

  const next = ordersReducer(state, {
    type: 'CONFIRM_ORDER_DELIVERED',
    payload: 't1',
  })

  const after = next.orders[0].items.reduce((s, i) => s + i.quantity, 0)
  assert.equal(after, 24, 'item count must remain 24 after confirm — no items dropped')
  assert.equal(next.orders[0].total, 604900, 'total must not change after confirm')
  assert.equal(next.orders[0].items.every(i => i.status === 'served'), true)
})

test('Bug3 – CONFIRM_ORDER_DELIVERED marks both legacy and normal orders for mixed table', () => {
  // Two orders for the same table: one with payment_status='unpaid', one with null.
  // Both must be marked delivered.
  const state = {
    settings: { serviceRate: 15 },
    user: { name: 'Waiter' },
    currentTableId: 't1',
    tables: [{ id: 't1', name: 'Table 1', status: 'occupied' }],
    orders: [
      {
        id: 'o-modern',
        table_id: 't1',
        status: 'sent_to_kitchen',
        payment_status: 'unpaid',
        order_type: 'dine_in',
        service_rate_pct: 15,
        items: [item({ id: 'mi1', price: 25000, quantity: 2, status: 'ready' })],
        subtotal: 50000,
        service_fee: 7500,
        total: 57500,
      },
      {
        id: 'o-legacy',
        table_id: 't1',
        status: 'sent_to_kitchen',
        payment_status: null,
        order_type: 'dine_in',
        service_rate_pct: 15,
        items: [item({ id: 'li1', price: 80000, quantity: 1, status: 'ready' })],
        subtotal: 80000,
        service_fee: 12000,
        total: 92000,
      },
    ],
    cart: [],
  }

  const next = ordersReducer(state, {
    type: 'CONFIRM_ORDER_DELIVERED',
    payload: 't1',
  })

  assert.equal(next.orders.find(o => o.id === 'o-modern').status, 'delivered')
  assert.equal(next.orders.find(o => o.id === 'o-legacy').status, 'delivered',
    'legacy null-payment_status order must also be marked delivered')
})

test('Bug3 – CONFIRM_ORDER_DELIVERED does not affect already-paid orders', () => {
  const state = {
    settings: { serviceRate: 15 },
    user: { name: 'Waiter' },
    currentTableId: 't1',
    tables: [{ id: 't1', name: 'Table 1', status: 'occupied' }],
    orders: [
      {
        id: 'o-paid',
        table_id: 't1',
        status: 'paid',
        payment_status: 'paid',
        order_type: 'dine_in',
        items: [item({ id: 'pi', price: 50000, quantity: 1, status: 'served' })],
        subtotal: 50000,
        service_fee: 7500,
        total: 57500,
      },
      {
        id: 'o-active',
        table_id: 't1',
        status: 'sent_to_kitchen',
        payment_status: 'unpaid',
        order_type: 'dine_in',
        service_rate_pct: 15,
        items: [item({ id: 'ai', price: 30000, quantity: 1, status: 'ready' })],
        subtotal: 30000,
        service_fee: 4500,
        total: 34500,
      },
    ],
    cart: [],
  }

  const next = ordersReducer(state, {
    type: 'CONFIRM_ORDER_DELIVERED',
    payload: 't1',
  })

  const paid = next.orders.find(o => o.id === 'o-paid')
  assert.equal(paid.status, 'paid', 'already-paid order must not be changed')
  assert.equal(paid.items[0].status, 'served', 'paid order items must not be changed')

  const active = next.orders.find(o => o.id === 'o-active')
  assert.equal(active.status, 'delivered')
  assert.equal(active.items[0].status, 'served')
})

// ─── DB query guard: verify the correct filter is used ────────────────────────
//
// The DB writer (writeToSupabase) imports supabase directly and is hard to unit
// test without a live connection. The tests below verify the query-filter
// contract at the source level by inspecting the db.js source text. This is
// intentionally simple: if the filter is reverted to the broken .eq() form the
// test catches it immediately without needing a network call.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbSource = readFileSync(path.join(__dirname, '../src/lib/db.js'), 'utf8')

test('DB guard – MARK_TABLE_NEEDS_BILL uses neq(payment_status, paid) not eq(unpaid)', () => {
  // Extract the MARK_TABLE_NEEDS_BILL case from the source
  const caseStart = dbSource.indexOf("case 'MARK_TABLE_NEEDS_BILL':")
  const caseEnd = dbSource.indexOf('\n    }', caseStart) + 6
  const caseSource = dbSource.slice(caseStart, caseEnd)

  assert.ok(
    caseSource.includes(".neq('payment_status', 'paid')"),
    "MARK_TABLE_NEEDS_BILL must use .neq('payment_status','paid') to match null/legacy orders"
  )
  assert.ok(
    !caseSource.includes(".eq('payment_status', 'unpaid')"),
    "MARK_TABLE_NEEDS_BILL must not use .eq('payment_status','unpaid') — misses NULL rows"
  )
})

test('DB guard – MARK_TABLE_NEEDS_BILL has a null-payment_status fallback query', () => {
  const caseStart = dbSource.indexOf("case 'MARK_TABLE_NEEDS_BILL':")
  const caseEnd = dbSource.indexOf('\n    }', caseStart) + 6
  const caseSource = dbSource.slice(caseStart, caseEnd)

  assert.ok(
    caseSource.includes(".is('payment_status', null)"),
    'MARK_TABLE_NEEDS_BILL must have a fallback .is(null) query for truly legacy rows'
  )
})

test('DB guard – CONFIRM_ORDER_DELIVERED uses neq(payment_status, paid) not eq(unpaid)', () => {
  const caseStart = dbSource.indexOf("case 'CONFIRM_ORDER_DELIVERED':")
  const caseEnd = dbSource.indexOf('\n    }', caseStart) + 6
  const caseSource = dbSource.slice(caseStart, caseEnd)

  assert.ok(
    caseSource.includes(".neq('payment_status', 'paid')"),
    "CONFIRM_ORDER_DELIVERED must use .neq('payment_status','paid') to match null/legacy orders"
  )
  assert.ok(
    !caseSource.includes(".eq('payment_status', 'unpaid')"),
    "CONFIRM_ORDER_DELIVERED must not use .eq('payment_status','unpaid') — misses NULL rows"
  )
})

test('DB guard – MARK_ORDER_PAID fetch uses neq(payment_status, paid) not eq(unpaid)', () => {
  // This was the root cause of "payment completes but order comes back":
  // The DB fetch used .eq('payment_status','unpaid') so legacy orders with NULL
  // payment_status returned 0 rows → the if(unpaidOrders?.length) block was skipped
  // → no DB write → realtime reload brought the order back as unpaid.
  const caseStart = dbSource.indexOf("case 'MARK_ORDER_PAID':")
  const caseEnd = dbSource.lastIndexOf('break\n    }') + 10
  const caseSource = dbSource.slice(caseStart, caseEnd)

  assert.ok(
    !caseSource.includes(".eq('payment_status', 'unpaid')"),
    "MARK_ORDER_PAID must not use .eq('payment_status','unpaid') for the order fetch — misses NULL rows"
  )
  // The initial order fetch must use neq('paid') so legacy orders are found
  assert.ok(
    /\.neq\('payment_status', 'paid'\)[\s\S]*unpaidQuery/.test(caseSource) ||
    caseSource.indexOf(".neq('payment_status', 'paid')") < caseSource.indexOf('unpaidOrders?.length'),
    "MARK_ORDER_PAID must fetch orders with .neq('payment_status','paid')"
  )
})

test('DB guard – ADD_QUICK_ITEM_TO_ORDER and UPDATE_BILL_ITEM_QTY use neq not eq for fetch', () => {
  const addQuickStart = dbSource.indexOf("case 'ADD_QUICK_ITEM_TO_ORDER':")
  const addQuickEnd = dbSource.indexOf('\n    }', addQuickStart) + 6
  const addQuickSource = dbSource.slice(addQuickStart, addQuickEnd)

  assert.ok(
    !addQuickSource.includes(".eq('payment_status', 'unpaid')"),
    "ADD_QUICK_ITEM_TO_ORDER must not use .eq('payment_status','unpaid')"
  )

  const updateBillStart = dbSource.indexOf("case 'UPDATE_BILL_ITEM_QTY':")
  const updateBillEnd = dbSource.indexOf('\n    }', updateBillStart) + 6
  const updateBillSource = dbSource.slice(updateBillStart, updateBillEnd)

  assert.ok(
    !updateBillSource.includes(".eq('payment_status', 'unpaid')"),
    "UPDATE_BILL_ITEM_QTY must not use .eq('payment_status','unpaid')"
  )
})

test('DB guard – no remaining eq(payment_status, unpaid) calls anywhere in db.js', () => {
  assert.ok(
    !dbSource.includes(".eq('payment_status', 'unpaid')"),
    "db.js must have zero .eq('payment_status','unpaid') calls — all replaced with .neq('payment_status','paid')"
  )
})

test('DB guard – MARK_ORDER_PAID by orderId uses post-payment re-query for table reset', () => {
  const caseStart = dbSource.indexOf("case 'MARK_ORDER_PAID':")
  const caseEnd = dbSource.lastIndexOf('break\n    }') + 10
  const caseSource = dbSource.slice(caseStart, caseEnd)

  // The fix uses a re-query of remaining unpaid orders to decide whether to reset
  assert.ok(
    caseSource.includes('affectedTableIds') || caseSource.includes('paidIds'),
    'MARK_ORDER_PAID orderId path must compute affected table IDs from the paid orders'
  )
  // Must NOT skip the table reset when orderId is present (original bug: `if (!orderId)` only)
  const onlyResetsWhenNoOrderId =
    /if\s*\(\s*!orderId\s*&&\s*tableId\s*\)\s*\{[^}]*updateRestaurantTableStatus/.test(caseSource) &&
    !caseSource.includes('affectedTableIds')
  assert.ok(
    !onlyResetsWhenNoOrderId,
    'MARK_ORDER_PAID must also reset the table when paying by orderId — not skip it'
  )
})

// ─── Full end-to-end reducer flows incorporating all three fixes ──────────────

test('E2E – 37h-old legacy order: waiter requests bill then cashier pays by orderId', () => {
  // Reproduces the exact production scenario from the screenshots:
  // Table 2, 37h old, payment_status=null in DB but shown as 'occupied' locally.
  let state = {
    settings: { serviceRate: 15 },
    user: { name: 'Waiter' },
    currentTableId: 't2',
    tables: [{ id: 't2', name: 'Table 2', status: 'occupied' }],
    orders: [
      {
        id: 'legacy-table2',
        table_id: 't2',
        status: 'delivered',
        payment_status: null,           // legacy null payment_status
        order_type: 'dine_in',
        service_rate_pct: 15,
        items: Array.from({ length: 24 }, (_, k) =>
          item({ id: `li${k}`, price: 25000, quantity: 1, status: 'served' })
        ),
        subtotal: 600000,
        service_fee: 90000,
        total: 690000,
      },
    ],
    cart: [],
  }

  // Step 1: Waiter taps "Request Bill" (MARK_TABLE_NEEDS_BILL)
  state = ordersReducer(state, {
    type: 'MARK_TABLE_NEEDS_BILL',
    payload: 't2',
  })
  assert.equal(state.tables[0].status, 'needs_bill', 'table must become needs_bill')
  assert.equal(state.orders[0].status, 'needs_bill', 'legacy order must be flagged')

  // Step 2: Cashier pays by orderId (not tableId)
  state = ordersReducer(state, {
    type: 'MARK_ORDER_PAID',
    payload: {
      orderId: 'legacy-table2',
      payment_method: 'cash',
    },
  })
  assert.equal(state.orders[0].payment_status, 'paid', 'order must be paid')
  assert.equal(state.tables[0].status, 'available', 'table must reset to available — Bug 1 fix')
})

test('E2E – Table 2 legacy order (38h old, null payment_status): full payment flow completes', () => {
  // Exact reproduction of the production bug:
  // Table 2, 38h old, payment_status=null in DB, x24 items, 1,090,800 UZS.
  // Cashier navigates to /cashier/bill/t2 (tableId-based), pays → order came back.
  // Root cause: MARK_ORDER_PAID DB fetch used .eq('payment_status','unpaid') which
  // returned 0 rows for the null-status order → silent skip → realtime reload reverted.
  let state = {
    settings: { serviceRate: 15 },
    user: { name: 'Cashier' },
    currentTableId: 't2',
    tables: [{ id: 't2', name: 'Table 2', status: 'needs_bill' }],
    orders: [
      {
        id: 'table2-legacy',
        table_id: 't2',
        table_name: 'Table 2',
        status: 'needs_bill',
        payment_status: null,   // ← the null that caused the bug
        order_type: 'dine_in',
        service_rate_pct: 15,
        items: Array.from({ length: 24 }, (_, k) =>
          item({ id: `t2-item-${k}`, price: 25000, quantity: 1, status: 'served' })
        ),
        subtotal: 600000,
        service_fee: 90000,
        total: 690000,
      },
    ],
    cart: [],
  }

  // Cashier pays by tableId (the route /cashier/bill/:tableId)
  state = ordersReducer(state, {
    type: 'MARK_ORDER_PAID',
    payload: {
      tableId: 't2',
      payment_method: 'cash',
      loyalty: null,
    },
  })

  assert.equal(state.orders[0].payment_status, 'paid',
    'order must be marked paid — not silently skipped')
  assert.equal(state.tables[0].status, 'available',
    'table must reset to available after payment')
  assert.equal(state.orders[0].payment_method, 'cash')
})

test('E2E – legacy order confirm served keeps consistent item count (Bug 3 regression)', () => {
  // Reproduces the x24→x18 item count mismatch after "Confirm served".
  let state = {
    settings: { serviceRate: 15 },
    user: { name: 'Waiter' },
    currentTableId: 't2',
    tables: [{ id: 't2', name: 'Table 2', status: 'occupied' }],
    orders: [
      {
        id: 'legacy-ready',
        table_id: 't2',
        status: 'sent_to_kitchen',
        payment_status: null,
        order_type: 'dine_in',
        service_rate_pct: 15,
        items: [
          // 5 items shown as "ready", 13 others served — total 24 items / 1,090,800 UZS
          ...Array.from({ length: 5 }, (_, k) =>
            item({ id: `ready-${k}`, price: 25000, quantity: 1, status: 'ready' })
          ),
          ...Array.from({ length: 18 }, (_, k) =>
            item({ id: `served-${k}`, price: 40000, quantity: 1, status: 'served' })
          ),
        ],
        subtotal: 845000,
        service_fee: 126750,
        total: 971750,
      },
    ],
    cart: [],
  }

  const itemsBefore = state.orders[0].items.reduce((s, i) => s + i.quantity, 0)
  assert.equal(itemsBefore, 23)

  // Waiter taps "Confirm served"
  state = ordersReducer(state, {
    type: 'CONFIRM_ORDER_DELIVERED',
    payload: 't2',
  })

  const itemsAfter = state.orders[0].items.reduce((s, i) => s + i.quantity, 0)
  assert.equal(itemsAfter, itemsBefore, 'item count must not change after confirm served')
  assert.equal(state.orders[0].total, 971750, 'total must not change after confirm served')
  assert.ok(
    state.orders[0].items.every(i => i.status === 'served'),
    'all items must be served after confirm'
  )
})
