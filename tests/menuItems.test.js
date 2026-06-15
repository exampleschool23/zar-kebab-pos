import test from 'node:test'
import assert from 'node:assert/strict'

import {
  isCashierOnlyItem,
  isCashierQuickItem,
  isCustomerMenuItem,
} from '../src/lib/menuItems.js'

test('cashier-only items stay available for cashier quick items but hidden from customer menus', () => {
  const item = {
    available: true,
    cashier_only: true,
    show_in_cashier_quick_items: true,
  }

  assert.equal(isCashierQuickItem(item), true)
  assert.equal(isCashierOnlyItem(item), true)
  assert.equal(isCustomerMenuItem(item), false)
})

test('normal available items remain visible to customer menus', () => {
  assert.equal(isCustomerMenuItem({ available: true, cashier_only: false }), true)
  assert.equal(isCustomerMenuItem({ available: true }), true)
  assert.equal(isCustomerMenuItem({ available: false, cashier_only: false }), false)
})
