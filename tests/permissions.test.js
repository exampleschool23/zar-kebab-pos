import test from 'node:test'
import assert from 'node:assert/strict'

import {
  FEATURE_KEYS,
  assignableRoles,
  canDeleteTeamMember,
  canManageFeatureAccess,
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

test('non-primary owner feature_access can be restricted', () => {
  const primaryOwner = { role: 'owner', email: 'dangerhoggish@gmail.com', feature_access: ['dashboard'] }
  const otherOwner = { role: 'owner', email: 'ddk9499@gmail.com', feature_access: ['dashboard', 'tables'] }

  assert.deepEqual(featureAccessForProfile(primaryOwner), FEATURE_KEYS)
  assert.deepEqual(featureAccessForProfile(otherOwner), ['dashboard', 'tables'])
  assert.equal(canViewPage(otherOwner, 'menu'), false)
})

test('null feature_access keeps role defaults and default path follows enabled features', () => {
  assert.equal(canViewPage({ role: 'admin', feature_access: null }, 'menu'), true)
  assert.equal(defaultPath({ role: 'admin', feature_access: ['expenses'] }), '/admin/accounting')
  assert.equal(defaultPath({ role: 'waiter', feature_access: [] }), '/menu')
})

test('only the primary owner account can manage feature access', () => {
  assert.equal(canManageFeatureAccess({ role: 'owner', email: 'dangerhoggish@gmail.com' }), true)
  assert.equal(canManageFeatureAccess({ role: 'owner', email: 'DANGERHOGGISH@GMAIL.COM' }), true)
  assert.equal(canManageFeatureAccess({ role: 'owner', email: 'other-owner@example.com' }), false)
  assert.equal(canManageFeatureAccess({ role: 'admin', email: 'dangerhoggish@gmail.com' }), false)
  assert.equal(canManageFeatureAccess('owner'), false)
})

test('assignable role options match owner and admin profile policy limits', () => {
  assert.deepEqual(assignableRoles('owner'), ['owner', 'admin', 'waiter', 'cashier', 'stakeholder', 'guest'])
  assert.deepEqual(assignableRoles('admin'), ['waiter', 'cashier', 'guest'])
  assert.deepEqual(assignableRoles('waiter'), [])
})

test('primary owner can delete non-primary owner profiles only', () => {
  const primaryOwner = { role: 'owner', email: 'dangerhoggish@gmail.com' }
  const otherOwner = { role: 'owner', email: 'ddk9499@gmail.com' }

  assert.equal(canDeleteTeamMember(primaryOwner, otherOwner), true)
  assert.equal(canDeleteTeamMember(primaryOwner, primaryOwner), false)
  assert.equal(canDeleteTeamMember(otherOwner, primaryOwner), false)
  assert.equal(canDeleteTeamMember(primaryOwner, otherOwner, true), false)
  assert.equal(canDeleteTeamMember(primaryOwner, { role: 'stakeholder', email: 'stakeholder@example.com' }), false)
})
