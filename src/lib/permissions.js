// Centralised role permission helpers.
// All sidebar visibility and route protection should reference these — never hardcode role arrays elsewhere.

export const PAGE_ACCESS = {
  publicMenu: ['guest', 'owner', 'admin', 'waiter', 'cashier', 'stakeholder'],
  dashboard: ['owner', 'admin', 'cashier', 'stakeholder'],
  tables:    ['owner', 'admin', 'waiter',  'cashier'],
  menu:      ['owner', 'admin'],
  cashier:   ['owner', 'admin', 'cashier'],
  loyalty:   ['owner', 'admin', 'cashier'],
  expenses:  ['owner'],
  team:      ['owner', 'admin', 'waiter', 'cashier', 'stakeholder'],
  reports:   ['owner', 'admin', 'cashier', 'stakeholder'],
  audit:     ['owner', 'admin'],
  settings:  ['owner', 'admin'],
  move_back_to_table: ['owner'],
  delete_paid_orders: ['owner'],
}

export const FEATURE_DEFINITIONS = [
  {
    key: 'dashboard',
    labels: { uz: 'Boshqaruv paneli', ru: 'Панель управления', en: 'Dashboard' },
    description: { uz: 'Savdo va bugungi holat', ru: 'Продажи и текущая ситуация', en: 'Sales overview and live status' },
  },
  {
    key: 'tables',
    labels: { uz: 'Stollar va buyurtmalar', ru: 'Столы и заказы', en: 'Tables and orders' },
    description: { uz: 'Ofitsiant stol va buyurtma oqimi', ru: 'Столы официанта и отправка заказов', en: 'Waiter table and order flow' },
  },
  {
    key: 'menu',
    labels: { uz: 'Menyu boshqaruvi', ru: 'Управление меню', en: 'Menu management' },
    description: { uz: 'Kategoriya, mahsulot va narxlar', ru: 'Категории, блюда и цены', en: 'Categories, items, and prices' },
  },
  {
    key: 'cashier',
    labels: { uz: 'Kassir', ru: 'Кассир', en: 'Cashier' },
    description: { uz: 'Hisob yopish va cheklar', ru: 'Закрытие счетов и чеки', en: 'Billing, payments, and receipts' },
  },
  {
    key: 'loyalty',
    labels: { uz: 'Sodiqlik kartalari', ru: 'Карты лояльности', en: 'Loyalty cards' },
    description: { uz: 'Mijoz kartalari va bonuslar', ru: 'Карты клиентов и бонусы', en: 'Customer cards and rewards' },
  },
  {
    key: 'expenses',
    labels: { uz: 'Buxgalteriya', ru: 'Бухгалтерия', en: 'Accounting' },
    description: { uz: 'Daromad, xarajat va maoshlar', ru: 'Доходы, расходы и зарплаты', en: 'Income, expenses, and salaries' },
  },
  {
    key: 'team',
    labels: { uz: 'Jamoa', ru: 'Команда', en: 'Team' },
    description: { uz: 'Xodimlar roli va kirish huquqlari', ru: 'Роли сотрудников и доступы', en: 'Employee roles and feature access' },
  },
  {
    key: 'reports',
    labels: { uz: 'Hisobotlar', ru: 'Отчёты', en: 'Reports' },
    description: { uz: 'Savdo va operatsion hisobotlar', ru: 'Продажи и операционные отчёты', en: 'Sales and operational reports' },
  },
  {
    key: 'audit',
    labels: { uz: 'Audit', ru: 'Аудит', en: 'Audit' },
    description: { uz: 'Rol, to‘lov va o‘zgarish tarixi', ru: 'История ролей, оплат и изменений', en: 'Role, payment, and change history' },
  },
  {
    key: 'settings',
    labels: { uz: 'Sozlamalar', ru: 'Настройки', en: 'Settings' },
    description: { uz: 'Restoran sozlamalari va stollar', ru: 'Настройки ресторана и столы', en: 'Restaurant settings and table management' },
  },
  {
    key: 'move_back_to_table',
    labels: { uz: 'Stolga qaytarish', ru: 'Вернуть к столу', en: 'Move back to table' },
    description: { uz: 'Hisob so‘ralgan buyurtmani ofitsiant oqimiga qaytarish', ru: 'Вернуть заказ из кассы обратно официанту', en: 'Return a needs-bill order from cashier back to waiter flow' },
  },
  {
    key: 'delete_paid_orders',
    labels: { uz: 'Buyurtmalarni o‘chirish', ru: 'Удаление заказов', en: 'Delete orders' },
    description: { uz: 'To‘langan yoki test buyurtmalarni olib tashlash', ru: 'Удаление оплаченных или тестовых заказов', en: 'Remove paid or test orders' },
  },
]

export const FEATURE_KEYS = FEATURE_DEFINITIONS.map(feature => feature.key)
export const FEATURE_ACCESS_MANAGER_EMAILS = ['dangerhoggish@gmail.com']

export function normalizeRole(role) {
  return (role || 'guest').toLowerCase()
}

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

export function isFeatureAccessManager(profileOrRole) {
  if (typeof profileOrRole === 'string' || !profileOrRole) return false
  return normalizeRole(profileOrRole.role) === 'owner' && FEATURE_ACCESS_MANAGER_EMAILS.includes(normalizeEmail(profileOrRole.email))
}

export function normalizeFeatureAccess(featureAccess) {
  if (!Array.isArray(featureAccess)) return null
  return [...new Set(featureAccess.map(key => String(key || '').trim()).filter(key => FEATURE_KEYS.includes(key)))]
}

export function defaultFeaturesForRole(role) {
  const normalizedRole = normalizeRole(role)
  return FEATURE_KEYS.filter(key => (PAGE_ACCESS[key] || []).includes(normalizedRole))
}

export function featureAccessForProfile(profileOrRole) {
  if (typeof profileOrRole === 'string' || !profileOrRole) return defaultFeaturesForRole(profileOrRole)
  if (isFeatureAccessManager(profileOrRole)) return FEATURE_KEYS
  const explicitAccess = normalizeFeatureAccess(profileOrRole.feature_access)
  return explicitAccess || defaultFeaturesForRole(profileOrRole.role)
}

export function canViewPage(profileOrRole, page) {
  if (page === 'publicMenu') return (PAGE_ACCESS.publicMenu || []).includes(normalizeRole(profileOrRole?.role || profileOrRole))
  return featureAccessForProfile(profileOrRole).includes(page)
}

export function canManageFeatureAccess(profileOrRole) {
  return isFeatureAccessManager(profileOrRole)
}

export function canDeletePaidOrders(profileOrRole) {
  return canViewPage(profileOrRole, 'delete_paid_orders')
}

export function canMoveBackToTable(profileOrRole) {
  return canViewPage(profileOrRole, 'move_back_to_table')
}

export function canEditMenu(role)          { return ['owner', 'admin'].includes(role) }
export function canManageSettings(role)    { return ['owner', 'admin'].includes(role) }
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
  const viewer = normalizeRole(viewerRole?.role || viewerRole)
  const target = normalizeRole(targetRole?.role || targetRole)
  if (isSelf) return false
  if (viewer !== 'owner') return false
  if (target === 'stakeholder') return false
  if (target === 'owner') {
    return isFeatureAccessManager(viewerRole) && !isFeatureAccessManager(targetRole)
  }
  return true
}

/** Roles the viewer is allowed to assign. Owner can assign any role; admin cannot assign owner. */
export function assignableRoles(viewerRole) {
  const all = ['owner', 'admin', 'waiter', 'cashier', 'stakeholder', 'guest']
  if (viewerRole === 'owner') return all
  if (viewerRole === 'admin') return all.filter(r => r !== 'owner' && r !== 'stakeholder')
  return []
}

export function defaultPath(role) {
  const profile = typeof role === 'object' && role ? role : { role }
  role = normalizeRole(profile.role)
  if (role === 'waiter' && canViewPage(profile, 'tables')) return '/waiter/tables'
  if (role === 'cashier' && canViewPage(profile, 'cashier')) return '/cashier/tables'
  if (canViewPage(profile, 'dashboard')) return '/admin'
  if (canViewPage(profile, 'cashier')) return '/cashier/tables'
  if (canViewPage(profile, 'tables')) return '/waiter/tables'
  if (canViewPage(profile, 'menu')) return '/admin/menu'
  if (canViewPage(profile, 'loyalty')) return '/admin/loyalty'
  if (canViewPage(profile, 'expenses')) return '/admin/accounting'
  if (canViewPage(profile, 'team')) return '/admin/users'
  if (canViewPage(profile, 'reports')) return '/admin/reports'
  if (canViewPage(profile, 'audit')) return '/admin/audit'
  if (canViewPage(profile, 'settings')) return '/admin/settings'
  if (role === 'kitchen') return '/pending-approval'
  return '/menu'
}
