import test from 'node:test'
import assert from 'node:assert/strict'
import { eligibleCategoryProfileIds } from '../src/lib/categoryScheduleAccess.js'
import { isWaiterMenuCategory, isCustomerMenuCategory } from '../src/lib/menuItems.js'
import { formatWriteError } from '../src/lib/writeErrorMessage.js'

test('stale hidden guest selection cannot block adding Bexruz; existing active selections survive', () => {
  const profiles = [
    { id: 'owner', role: 'owner', status: 'active' },
    { id: 'bexruz', role: 'admin', status: 'active' },
    { id: 'manager', role: 'guest', status: 'disabled' },
    { id: 'disabled', role: 'admin', status: 'disabled' },
  ]
  const ids = eligibleCategoryProfileIds(['owner', 'manager', 'bexruz', 'missing', 'disabled', 'owner'], profiles)
  assert.deepEqual(ids, ['bexruz', 'owner'])
  const category = { visible_from_time: '11:00', visible_until_time: '15:00', always_visible_profile_ids: ids }
  const date = new Date('2026-09-22T23:00:00')
  assert.equal(isWaiterMenuCategory(category, date, 'bexruz'), true)
  assert.equal(isWaiterMenuCategory(category, date, 'manager'), false)
  assert.equal(isCustomerMenuCategory(category, date), false)
})

test('category errors describe staff validation, missing schema and incomplete roster in all languages', () => {
  for (const lang of ['en', 'ru', 'uz']) {
    for (const error of [
      { message: 'Category schedule overrides require staff profiles', categoryDetailsSaved: true },
      { code: 'PGRST204', message: 'private column error' },
      { code: 'POS_CATEGORY_STAFF_NOT_LOADED' },
      { message: 'unknown raw error' },
    ]) {
      const message = formatWriteError(error, lang, 'UPDATE_CATEGORY')
      assert.doesNotMatch(message, /order or bill|заказа|buyurtma|private column|unknown raw/)
      assert.ok(message.length > 60)
    }
  }
  assert.match(formatWriteError({ message: 'Category schedule overrides require staff profiles' }, 'en', 'UPDATE_CATEGORY'), /active staff/)
  assert.match(formatWriteError({ code: 'PGRST204' }, 'en', 'UPDATE_CATEGORY'), /database needs an update/)
})
