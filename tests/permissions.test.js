import test from 'node:test'
import assert from 'node:assert/strict'

import {
  FEATURE_DEFINITIONS,
  FEATURE_KEYS,
  assignableRoles,
  canDeleteTeamMember,
  canChangeMenuItemAvailability,
  canChangeMenuItemPublicVisibility,
  canEditFeature,
  canEditMenu,
  canEditTeamMember,
  canManageFeatureAccess,
  canMoveBackToTable,
  canViewPage,
  defaultFeaturesForRole,
  defaultPath,
  featureAccessForProfile,
  updateFeatureAccessSelection,
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
  assert.equal(canViewPage(adminWithAccounting, 'menu'), true)
  assert.equal(canEditMenu(adminWithAccounting), false)
  assert.deepEqual(featureAccessForProfile(adminWithAccounting), ['dashboard', 'expenses'])
  assert.equal(canViewPage(viewerWithAccounting, 'expenses'), true)
  assert.equal(canEditFeature(viewerWithAccounting, 'expenses'), false)
})

test('daily bazaar access is independent from salaries and full accounting', () => {
  const bazaarEditor = { role: 'admin', feature_access: ['bazaar'] }
  const bazaarViewer = { role: 'viewer', feature_access: ['bazaar'] }

  assert.equal(canViewPage(bazaarEditor, 'bazaar'), true)
  assert.equal(canEditFeature(bazaarEditor, 'bazaar'), true)
  assert.equal(canViewPage(bazaarEditor, 'expenses'), false)
  assert.equal(canEditFeature(bazaarViewer, 'bazaar'), false)
  assert.equal(defaultPath(bazaarEditor), '/admin/bazaar')
  assert.equal(FEATURE_DEFINITIONS.find(feature => feature.key === 'bazaar')?.kind, 'page')
})

test('menu is always viewable by staff while Manage menu controls editing', () => {
  const viewerWithMenu = { role: 'viewer', feature_access: ['menu'] }
  const viewerWithoutMenu = { role: 'viewer', feature_access: [] }
  const adminWithMenu = { role: 'admin', feature_access: ['menu'] }
  const adminWithoutMenu = { role: 'admin', feature_access: [] }
  const guestWithMenu = { role: 'guest', feature_access: ['menu'] }

  assert.equal(canViewPage(viewerWithMenu, 'menu'), true)
  assert.equal(canViewPage(viewerWithoutMenu, 'menu'), true)
  assert.equal(canEditMenu(viewerWithMenu), false)
  assert.equal(canViewPage(adminWithoutMenu, 'menu'), true)
  assert.equal(canEditMenu(adminWithoutMenu), false)
  assert.equal(canEditMenu(adminWithMenu), true)
  assert.equal(canViewPage(guestWithMenu, 'menu'), false)
  assert.equal(defaultPath(viewerWithoutMenu), '/admin/menu')
  assert.equal(FEATURE_DEFINITIONS.find(feature => feature.key === 'menu')?.kind, 'action')
  assert.equal(FEATURE_KEYS.includes('edit_menu_items'), false)
})

test('anyone with Manage Menu access can change meal availability', () => {
  assert.equal(canChangeMenuItemAvailability('owner'), true)
  assert.equal(canChangeMenuItemAvailability({ role: 'owner', feature_access: ['menu'] }), true)
  assert.equal(canChangeMenuItemAvailability({ role: 'owner', feature_access: ['dashboard'] }), false)
  assert.equal(canChangeMenuItemAvailability({ role: 'admin', feature_access: ['menu'] }), true)
  assert.equal(canChangeMenuItemAvailability({ role: 'admin', feature_access: ['dashboard'] }), false)
  assert.equal(canChangeMenuItemAvailability({ role: 'viewer', feature_access: ['menu'] }), false)
})

test('only owners with menu write access can hide meals from the public menu', () => {
  assert.equal(canChangeMenuItemPublicVisibility('owner'), true)
  assert.equal(canChangeMenuItemPublicVisibility({ role: 'owner', feature_access: ['menu'] }), true)
  assert.equal(canChangeMenuItemPublicVisibility({ role: 'owner', feature_access: ['dashboard'] }), false)
  assert.equal(canChangeMenuItemPublicVisibility({ role: 'admin', feature_access: ['menu'] }), false)
  assert.equal(canChangeMenuItemPublicVisibility({ role: 'viewer', feature_access: ['menu'] }), false)
})

test('feature selection keeps sensitive actions attached to relevant pages', () => {
  assert.deepEqual(
    updateFeatureAccessSelection([], 'delete_paid_orders', true),
    ['dashboard', 'delete_paid_orders']
  )
})

test('cashier access lets owners and admins move bills back without an extra permission', () => {
  assert.equal(canMoveBackToTable({ role: 'admin', feature_access: ['cashier'] }), true)
  assert.equal(canMoveBackToTable({ role: 'owner', feature_access: ['cashier'] }), true)
  assert.equal(canMoveBackToTable({ role: 'admin', feature_access: ['dashboard'] }), false)
  assert.equal(canMoveBackToTable({ role: 'viewer', feature_access: ['cashier'] }), false)
  assert.equal(FEATURE_KEYS.includes('move_back_to_table'), false)
})

test('non-primary owner feature_access can be restricted', () => {
  const primaryOwner = { role: 'owner', email: 'dangerhoggish@gmail.com', feature_access: ['dashboard'] }
  const otherOwner = { role: 'owner', email: 'ddk9499@gmail.com', feature_access: ['dashboard', 'tables'] }

  assert.deepEqual(featureAccessForProfile(primaryOwner), FEATURE_KEYS)
  assert.deepEqual(featureAccessForProfile(otherOwner), ['dashboard', 'tables'])
  assert.equal(canViewPage(otherOwner, 'menu'), true)
  assert.equal(canEditMenu(otherOwner), false)
})

test('null feature_access keeps role defaults and default path follows enabled features', () => {
  assert.equal(canViewPage({ role: 'admin', feature_access: null }, 'menu'), true)
  assert.equal(defaultPath({ role: 'admin', feature_access: ['expenses'] }), '/admin/accounting')
  assert.equal(defaultPath({ role: 'viewer', feature_access: ['cashier'] }), '/cashier/tables')
  assert.equal(defaultPath({ role: 'waiter', feature_access: [] }), '/admin/menu')
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
