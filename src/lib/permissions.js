// Centralised role permission helpers.
// All sidebar visibility and route protection should reference these — never hardcode role arrays elsewhere.

export const PAGE_ACCESS = {
  dashboard: ['owner', 'admin', 'cashier', 'stakeholder'],
  tables:    ['owner', 'admin', 'waiter',  'cashier'],
  menu:      ['owner', 'admin'],
  kitchen:   ['owner', 'admin', 'kitchen'],
  cashier:   ['owner', 'admin', 'cashier'],
  team:      ['owner', 'admin'],
  reports:   ['owner', 'admin', 'cashier', 'stakeholder'],
  settings:  ['owner', 'admin'],
}

export function canViewPage(role, page) {
  return (PAGE_ACCESS[page] || []).includes(role)
}

export function canEditMenu(role)          { return ['owner', 'admin'].includes(role) }
export function canManageTeam(role)        { return ['owner', 'admin'].includes(role) }
export function canUseKitchenActions(role) { return ['owner', 'admin', 'kitchen'].includes(role) }
export function canUseCashierActions(role) { return ['owner', 'admin', 'cashier'].includes(role) }
export function canManageSettings(role)    { return ['owner', 'admin'].includes(role) }
export function isReadOnlyUser(role)       { return role === 'stakeholder' }

export function defaultPath(role) {
  if (['owner', 'admin', 'stakeholder'].includes(role)) return '/admin'
  if (role === 'cashier')  return '/cashier/tables'
  if (role === 'waiter')   return '/waiter/tables'
  if (role === 'kitchen')  return '/kitchen'
  return '/pending-approval'
}
