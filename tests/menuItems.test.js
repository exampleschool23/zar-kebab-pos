import test from 'node:test'
import assert from 'node:assert/strict'

import {
  isActiveMenuItem,
  isCashierOnlyItem,
  isCashierQuickItem,
  isCustomerMenuCategory,
  isCustomerMenuItem,
  isDeletedMenuItem,
  isHiddenMenuCategory,
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

test('soft-deleted menu items stay out of active menus', () => {
  const deleted = { available: true, deleted_at: '2026-07-09T10:00:00.000Z' }

  assert.equal(isDeletedMenuItem(deleted), true)
  assert.equal(isActiveMenuItem(deleted), false)
  assert.equal(isCustomerMenuItem(deleted), false)
})

test('hidden menu categories are excluded from customer menus', () => {
  assert.equal(isHiddenMenuCategory({ hidden: true }), true)
  assert.equal(isHiddenMenuCategory({ is_hidden: true }), true)
  assert.equal(isCustomerMenuCategory({ hidden: true }), false)
  assert.equal(isCustomerMenuCategory({ hidden: false }), true)
  assert.equal(isCustomerMenuCategory({}), true)
})
