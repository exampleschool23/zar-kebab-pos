import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getRequiredMenuItemCost,
  hasRequiredMenuItemCost,
} from '../src/lib/menuItemCosts.js'

test('new menu item real cost must be a positive value', () => {
  for (const value of [undefined, null, '', '   ', 0, '0', -1, 'not-a-number']) {
    assert.equal(getRequiredMenuItemCost(value), null)
    assert.equal(hasRequiredMenuItemCost(value), false)
  }
})

test('new menu item real cost accepts and normalizes positive UZS values', () => {
  assert.equal(getRequiredMenuItemCost('18 000'), 18_000)
  assert.equal(getRequiredMenuItemCost('18000'), 18_000)
  assert.equal(getRequiredMenuItemCost(18_000.4), 18_000)
  assert.equal(hasRequiredMenuItemCost('1'), true)
})
