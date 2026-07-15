import test from 'node:test'
import assert from 'node:assert/strict'

import {
  FEATURE_KEYS,
  assignableRoles,
  canDeleteTeamMember,
  canEditFeature,
  canEditMenu,
  canEditTeamMember,
  canManageFeatureAccess,
  canViewPage,
  defaultFeaturesForRole,
  defaultPath,
  featureAccessForProfile,
} from '../src/lib/permissions.js'

test('role defaults still cover existing app features', () => {
  assert.deepEqual(defaultFeaturesForRole('owner'), FEATURE_KEYS)
  assert.deepEqual(defaultFeaturesForRole('admin'), [])
  assert.deepEqual(defaultFeaturesForRole('viewer'), [])
  assert.ok(defaultFeaturesForRole('waiter').includes('tables'))
  assert.ok(defaultFeaturesForRole('cashier').includes('cashier'))
  assert.ok(defaultFeaturesForRole('stakeholder').includes('reports'))
  assert.deepEqual(defaultFeaturesForRole('guest'), [])
})

test('feature access controls visibility while role controls write access', () => {
  const adminWithAccounting = { role: 'admin', feature_access: ['dashboard', 'expenses'] }
  const viewerWithAccounting = { role: 'viewer', feature_access: ['dashboard', 'expenses'] }

  assert.equal(canViewPage(adminWithAccounting, 'expenses'), true)
  assert.equal(canEditFeature(adminWithAccounting, 'expenses'), true)
  assert.equal(canViewPage(adminWithAccounting, 'menu'), false)
  assert.deepEqual(featureAccessForProfile(adminWithAccounting), ['dashboard', 'expenses'])
  assert.equal(canViewPage(viewerWithAccounting, 'expenses'), true)
  assert.equal(canEditFeature(viewerWithAccounting, 'expenses'), false)
})

test('explicit menu-item edit access grants menu routing and writes', () => {
  const viewerWithMenuEdit = { role: 'viewer', feature_access: ['edit_menu_items'] }
  const viewerWithMenuView = { role: 'viewer', feature_access: ['menu'] }

  assert.equal(canViewPage(viewerWithMenuEdit, 'menu'), true)
  assert.equal(canEditMenu(viewerWithMenuEdit), true)
  assert.equal(defaultPath(viewerWithMenuEdit), '/admin/menu')
  assert.equal(canViewPage(viewerWithMenuView, 'menu'), true)
  assert.equal(canEditMenu(viewerWithMenuView), false)
})

test('non-primary owner feature_access can be restricted', () => {
  const primaryOwner = { role: 'owner', email: 'dangerhoggish@gmail.com', feature_access: ['dashboard'] }
  const otherOwner = { role: 'owner', email: 'ddk9499@gmail.com', feature_access: ['dashboard', 'tables'] }

  assert.deepEqual(featureAccessForProfile(primaryOwner), FEATURE_KEYS)
  assert.deepEqual(featureAccessForProfile(otherOwner), ['dashboard', 'tables'])
  assert.equal(canViewPage(otherOwner, 'menu'), false)
})

test('null feature_access keeps role defaults and default path follows enabled features', () => {
  assert.equal(canViewPage({ role: 'admin', feature_access: null }, 'menu'), false)
  assert.equal(defaultPath({ role: 'admin', feature_access: ['expenses'] }), '/admin/accounting')
  assert.equal(defaultPath({ role: 'viewer', feature_access: ['cashier'] }), '/cashier/tables')
  assert.equal(defaultPath({ role: 'waiter', feature_access: [] }), '/menu')
})

test('owners can manage feature access', () => {
  assert.equal(canManageFeatureAccess({ role: 'owner', email: 'dangerhoggish@gmail.com' }), true)
  assert.equal(canManageFeatureAccess({ role: 'owner', email: 'DANGERHOGGISH@GMAIL.COM' }), true)
  assert.equal(canManageFeatureAccess({ role: 'owner', email: 'other-owner@example.com' }), true)
  assert.equal(canManageFeatureAccess({ role: 'admin', email: 'dangerhoggish@gmail.com' }), false)
  assert.equal(canManageFeatureAccess('owner'), true)
})

test('assignable role options match owner and admin profile policy limits', () => {
  assert.deepEqual(assignableRoles('owner'), ['owner', 'admin', 'viewer', 'guest'])
  assert.deepEqual(assignableRoles('admin'), ['viewer', 'guest'])
  assert.deepEqual(assignableRoles('viewer'), [])
})

test('owner can delete non-owner profiles but cannot delete self or owners', () => {
  assert.equal(canDeleteTeamMember('owner', 'admin'), true)
  assert.equal(canDeleteTeamMember('owner', 'viewer'), true)
  assert.equal(canDeleteTeamMember('owner', 'guest'), true)
  assert.equal(canDeleteTeamMember('owner', 'owner'), false)
  assert.equal(canDeleteTeamMember('owner', 'admin', true), false)
  assert.equal(canDeleteTeamMember('admin', 'viewer'), false)
})

test('admin can edit only viewer and guest team members', () => {
  assert.equal(canEditTeamMember('owner', 'admin'), true)
  assert.equal(canEditTeamMember('admin', 'viewer'), true)
  assert.equal(canEditTeamMember('admin', 'guest'), true)
  assert.equal(canEditTeamMember('admin', 'admin'), false)
  assert.equal(canEditTeamMember('admin', 'owner'), false)
  assert.equal(canEditTeamMember('viewer', 'guest'), false)
})
