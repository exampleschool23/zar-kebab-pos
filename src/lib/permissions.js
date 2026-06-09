// Centralised role permission helpers.
// All sidebar visibility and route protection should reference these — never hardcode role arrays elsewhere.

export const PAGE_ACCESS = {
  publicMenu: ['guest', 'owner', 'admin', 'waiter', 'cashier', 'stakeholder'],
  dashboard: ['owner', 'admin', 'cashier', 'stakeholder'],
  tables:    ['owner', 'admin', 'waiter',  'cashier'],
  menu:      ['owner', 'admin'],
  kitchen:   ['owner', 'admin'],
  cashier:   ['owner', 'admin', 'cashier'],
  loyalty:   ['owner', 'admin', 'cashier'],
  team:      ['owner', 'admin', 'waiter', 'cashier', 'stakeholder'],
  reports:   ['owner', 'admin', 'cashier', 'stakeholder'],
  audit:     ['owner', 'admin'],
  settings:  ['owner', 'admin'],
}

export function canViewPage(role, page) {
  return (PAGE_ACCESS[page] || []).includes((role || 'guest').toLowerCase())
}

export function canEditMenu(role)          { return ['owner', 'admin'].includes(role) }
export function canManageSettings(role)    { return ['owner', 'admin'].includes(role) }
export function canUseKitchenActions(role) { return ['owner', 'admin'].includes(role) }
export function canUseCashierActions(role) { return ['owner', 'admin', 'cashier'].includes(role) }
export function isReadOnlyUser(role)       { return role === 'stakeholder' }
export function isPublicOnlyRole(role) {
  return ['guest', 'customer'].includes((role || 'guest').toLowerCase())
}

/**
 * Returns whether `viewerRole` can change the role/status of a user who currently has `targetRole`.
 * - owner   → can edit anyone except themselves (handled separately)
 * - admin   → can edit staff below admin only
 * - others  → view-only, no edits
 */
export function canEditTeamMember(viewerRole, targetRole) {
  const viewer = (viewerRole || '').toLowerCase()
  const target = (targetRole || '').toLowerCase()
  if (viewer === 'owner') return true
  if (viewer === 'admin') return !['owner', 'admin', 'stakeholder'].includes(target)
  return false
}

/**
 * Returns whether `viewerRole` can permanently remove a profile row.
 * Historical orders keep denormalized names such as waiter_name, so profile deletion
 * must not cascade into order/report records.
 */
export function canDeleteTeamMember(viewerRole, targetRole, isSelf = false) {
  const viewer = (viewerRole || '').toLowerCase()
  const target = (targetRole || '').toLowerCase()
  if (isSelf) return false
  if (viewer !== 'owner') return false
  return !['owner', 'stakeholder'].includes(target)
}

/** Roles the viewer is allowed to assign. Owner can assign any role; admin cannot assign owner. */
export function assignableRoles(viewerRole) {
  const all = ['owner', 'admin', 'waiter', 'cashier', 'stakeholder', 'guest']
  if (viewerRole === 'owner') return all
  if (viewerRole === 'admin') return all.filter(r => r !== 'owner' && r !== 'stakeholder')
  return []
}

export function defaultPath(role) {
  role = (role || 'guest').toLowerCase()
  if (['owner', 'admin', 'stakeholder'].includes(role)) return '/admin'
  if (role === 'cashier')  return '/cashier/tables'
  if (role === 'waiter')   return '/waiter/tables'
  if (role === 'kitchen')  return '/pending-approval'
  return '/menu'
}
