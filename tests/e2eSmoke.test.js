import test from 'node:test'
import assert from 'node:assert/strict'

import { ordersReducer } from '../src/store/ordersReducer.js'

test('smoke flow: waiter sends, kitchen prepares, cashier pays, loyalty fields remain on order', () => {
  let state = {
    settings: { serviceRate: 10 },
    user: { name: 'Waiter' },
    currentTableId: 't1',
    tables: [{ id: 't1', name: 'Table 1', status: 'available' }],
    cart: [{ id: 'cart-1', menu_item_id: 'kebab', name: 'Kebab', price: 100000, quantity: 1 }],
    orders: [],
  }

  state = ordersReducer(state, {
    type: 'SEND_TO_KITCHEN',
    _orderId: 'o1',
    _items: [{ id: 'oi1', menu_item_id: 'kebab', name: 'Kebab', price: 100000, quantity: 1, status: 'new' }],
    payload: { orderType: 'dine_in' },
  })
  assert.equal(state.orders[0].status, 'sent_to_kitchen')

  state = ordersReducer(state, {
    type: 'UPDATE_ORDER_ITEM_STATUS',
    payload: { orderId: 'o1', orderItemId: 'oi1', status: 'preparing' },
  })
  state = ordersReducer(state, {
    type: 'UPDATE_ORDER_ITEM_STATUS',
    payload: { orderId: 'o1', orderItemId: 'oi1', status: 'ready' },
  })
  assert.equal(state.orders[0].items[0].status, 'ready')

  state = ordersReducer(state, {
    type: 'MARK_ORDER_PAID',
    payload: {
      tableId: 't1',
      loyalty: {
        loyalty_card_number: '12345678',
        loyalty_used_amount: 10000,
        cashback_type: 'silver',
      },
      payment_method: 'cash',
    },
  })

  assert.equal(state.orders[0].payment_status, 'paid')
  assert.equal(state.orders[0].loyalty_used_amount, 10000)
  assert.equal(state.orders[0].cashback_earned, 5000)
  assert.equal(state.orders[0].cashback_percent, 5)
})
