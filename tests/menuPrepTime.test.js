import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DEFAULT_MENU_PREP_MINUTES,
  MAX_MENU_PREP_MINUTES,
  menuPrepTimeLabel,
  normalizeMenuPrepMinutes,
} from '../src/lib/menuPrepTime.js'

test('menu preparation time defaults, rounds, and stays within its supported range', () => {
  assert.equal(normalizeMenuPrepMinutes(''), DEFAULT_MENU_PREP_MINUTES)
  assert.equal(normalizeMenuPrepMinutes(0), DEFAULT_MENU_PREP_MINUTES)
  assert.equal(normalizeMenuPrepMinutes(14.6), 15)
  assert.equal(normalizeMenuPrepMinutes(999), MAX_MENU_PREP_MINUTES)
})

test('menu preparation time is localized for customer and waiter badges', () => {
  const item = { estimated_prep_minutes: 25 }
  assert.equal(menuPrepTimeLabel(item, 'en'), '~25 min')
  assert.equal(menuPrepTimeLabel(item, 'ru'), '~25 мин')
  assert.equal(menuPrepTimeLabel(item, 'uz'), '~25 daq')
  assert.equal(menuPrepTimeLabel({}, 'en'), '~15 min')
})
