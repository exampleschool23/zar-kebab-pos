import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getRequiredMenuItemCost,
  hasRequiredMenuItemCost,
  isTechCardMenuItemCost,
  normalizeMenuItemCostSource,
} from '../src/lib/menuItemCosts.js'
import { menuReducer } from '../src/store/menuReducer.js'

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

test('tech-card-backed costs are identified separately from editable manual costs', () => {
  assert.equal(normalizeMenuItemCostSource('tech_card'), 'tech_card')
  assert.equal(normalizeMenuItemCostSource('manual'), 'manual')
  assert.equal(normalizeMenuItemCostSource(undefined), 'manual')
  assert.equal(isTechCardMenuItemCost({ cost_source: 'tech_card' }), true)
  assert.equal(isTechCardMenuItemCost({ cost_source: 'manual' }), false)
  assert.equal(isTechCardMenuItemCost({}), false)
})

test('ordinary product edits preserve a tech-card cost lock in local menu state', () => {
  const state = {
    menuItems: [{ id: 'kebab', external_id: 'MI-1', cost_price: 18_000, cost_source: 'tech_card' }],
  }
  const next = menuReducer(state, {
    type: 'UPDATE_MENU_ITEM',
    payload: { id: 'kebab', name_en: 'Kebab', cost_price: 18_000 },
  })

  assert.equal(next.menuItems[0].cost_source, 'tech_card')
})
