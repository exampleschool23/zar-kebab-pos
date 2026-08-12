export function isCashierQuickItem(item) {
  return !!(
    item?.show_in_cashier_quick_items ||
    item?.showInCashierQuickItems ||
    item?.is_counter_item ||
    item?.isCounterItem
  )
}

export function isCashierOnlyItem(item) {
  return !!(item?.cashier_only || item?.cashierOnly)
}

export function isPublicHiddenMenuItem(item) {
  return !!(item?.public_hidden || item?.publicHidden || item?.hide_from_public || item?.hideFromPublic)
}

function parseMenuTime(value) {
  const raw = String(value || '').trim()
  if (!raw) return null
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null
  }
  return hours * 60 + minutes
}

function minutesFromDate(date = new Date()) {
  const current = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(current.getTime())) return minutesFromDate(new Date())
  return current.getHours() * 60 + current.getMinutes()
}

function getScheduleStart(entity) {
  return entity?.visible_from_time ?? entity?.visibleFromTime ?? entity?.available_from_time ?? entity?.availableFromTime
}

function getScheduleEnd(entity) {
  return entity?.visible_until_time ?? entity?.visibleUntilTime ?? entity?.available_until_time ?? entity?.availableUntilTime
}

export function isWithinMenuTimeWindow(entity, date = new Date()) {
  const start = parseMenuTime(getScheduleStart(entity))
  const end = parseMenuTime(getScheduleEnd(entity))
  if (start == null && end == null) return true

  const now = minutesFromDate(date)
  if (start != null && end == null) return now >= start
  if (start == null && end != null) return now < end
  if (start === end) return true
  if (start < end) return now >= start && now < end
  return now >= start || now < end
}

export function isHiddenMenuCategory(category) {
  return !!(category?.hidden || category?.is_hidden || category?.isHidden)
}

export function isDeletedMenuCategory(category) {
  return !!(category?.deleted_at || category?.deletedAt || category?.is_deleted || category?.isDeleted)
}

export function isActiveMenuCategory(category) {
  return !!category && !isDeletedMenuCategory(category)
}

export function isWaiterHiddenMenuCategory(category) {
  return !!(
    category?.waiter_hidden ||
    category?.waiterHidden ||
    category?.hide_from_waiter ||
    category?.hideFromWaiter
  )
}

export function isCustomerMenuCategory(category, date = new Date()) {
  return isActiveMenuCategory(category) &&
    !isHiddenMenuCategory(category) &&
    isWithinMenuTimeWindow(category, date)
}

export function isWaiterMenuCategory(category, date = new Date()) {
  return isActiveMenuCategory(category) &&
    !isWaiterHiddenMenuCategory(category) &&
    isWithinMenuTimeWindow(category, date)
}

export function isDeletedMenuItem(item) {
  return !!(item?.deleted_at || item?.deletedAt || item?.is_deleted || item?.isDeleted)
}

export function isActiveMenuItem(item) {
  return !!item && !isDeletedMenuItem(item)
}

export function isMenuItemOrderable(item) {
  return isActiveMenuItem(item) && item?.available === true
}

export function isCustomerMenuItem(item, date = new Date()) {
  return isActiveMenuItem(item) &&
    !isCashierOnlyItem(item) &&
    !isPublicHiddenMenuItem(item) &&
    isWithinMenuTimeWindow(item, date)
}

export function isWaiterMenuItem(item, date = new Date()) {
  return isMenuItemOrderable(item) &&
    !isCashierOnlyItem(item) &&
    isWithinMenuTimeWindow(item, date)
}

export function getQuickItemSortOrder(item) {
  const value = Number(item?.quick_item_sort_order ?? item?.quickItemSortOrder ?? item?.sort_order ?? 9999)
  return Number.isFinite(value) ? value : 9999
}
