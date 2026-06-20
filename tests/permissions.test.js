import test from 'node:test'
import assert from 'node:assert/strict'

import {
  FEATURE_KEYS,
  canViewPage,
  defaultFeaturesForRole,
  defaultPath,
  featureAccessForProfile,
} from '../src/lib/permissions.js'

test('role defaults still cover existing app features', () => {
  assert.deepEqual(defaultFeaturesForRole('owner'), FEATURE_KEYS)
  assert.ok(defaultFeaturesForRole('admin').includes('menu'))
  assert.ok(defaultFeaturesForRole('waiter').includes('tables'))
  assert.ok(defaultFeaturesForRole('cashier').includes('cashier'))
  assert.ok(defaultFeaturesForRole('stakeholder').includes('reports'))
  assert.equal(defaultFeaturesForRole('admin').includes('expenses'), false)
  assert.equal(defaultFeaturesForRole('admin').includes('move_back_to_table'), false)
  assert.equal(defaultFeaturesForRole('admin').includes('delete_paid_orders'), false)
})

test('profile feature_access overrides role defaults for one user', () => {
  const adminWithAccounting = { role: 'admin', feature_access: ['dashboard', 'expenses'] }
  assert.equal(canViewPage(adminWithAccounting, 'expenses'), true)
  assert.equal(canViewPage(adminWithAccounting, 'menu'), false)
  assert.deepEqual(featureAccessForProfile(adminWithAccounting), ['dashboard', 'expenses'])
})

test('null feature_access keeps role defaults and default path follows enabled features', () => {
  assert.equal(canViewPage({ role: 'admin', feature_access: null }, 'menu'), true)
  assert.equal(defaultPath({ role: 'admin', feature_access: ['expenses'] }), '/admin/accounting')
  assert.equal(defaultPath({ role: 'waiter', feature_access: [] }), '/menu')
})
