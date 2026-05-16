// Centralised role permission helpers.
// All sidebar visibility and route protection should reference these — never hardcode role arrays elsewhere.

export const PAGE_ACCESS = {
  dashboard: ['owner', 'admin', 'cashier', 'stakeholder'],
  tables:    ['owner', 'admin', 'waiter',  'cashier'],
  menu:      ['owner', 'admin'],
  kitchen:   ['owner', 'admin', 'kitchen'],
  cashier:   ['owner', 'admin', 'cashier'],
  team:      ['owner', 'admin', 'waiter', 'cashier', 'kitchen', 'stakeholder'],
  reports:   ['owner', 'admin', 'cashier', 'stakeholder'],
  settings:  ['owner', 'admin'],
}

export function canViewPage(role, page) {
  return (PAGE_ACCESS[page] || []).includes(role)
}

export function canEditMenu(role)          { return ['owner', 'admin'].includes(role) }
export function canManageSettings(role)    { return ['owner', 'admin'].includes(role) }
export function canUseKitchenActions(role) { return ['owner', 'admin', 'kitchen'].includes(role) }
export function canUseCashierActions(role) { return ['owner', 'admin', 'cashier'].includes(role) }
export function isReadOnlyUser(role)       { return role === 'stakeholder' }

/**
 * Returns whether `viewerRole` can change the role/status of a user who currently has `targetRole`.
 * - owner   → can edit anyone except themselves (handled separately)
 * - admin   → can edit non-owner users only
 * - others  → view-only, no edits
 */
export function canEditTeamMember(viewerRole, targetRole) {
  if (viewerRole === 'owner') return true
  if (viewerRole === 'admin') return targetRole !== 'owner'
  return false
}

/** Roles the viewer is allowed to assign. Owner can assign any role; admin cannot assign owner. */
export function assignableRoles(viewerRole) {
  const all = ['owner', 'admin', 'waiter', 'cashier', 'kitchen', 'stakeholder']
  if (viewerRole === 'owner') return all
  if (viewerRole === 'admin') return all.filter(r => r !== 'owner')
  return []
}

export function defaultPath(role) {
  if (['owner', 'admin', 'stakeholder'].includes(role)) return '/admin'
  if (role === 'cashier')  return '/cashier/tables'
  if (role === 'waiter')   return '/waiter/tables'
  if (role === 'kitchen')  return '/kitchen'
  return '/pending-approval'
}
