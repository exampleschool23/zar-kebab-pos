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

export function isHiddenMenuCategory(category) {
  return !!(category?.hidden || category?.is_hidden || category?.isHidden)
}

export function isCustomerMenuCategory(category) {
  return !isHiddenMenuCategory(category)
}

export function isDeletedMenuItem(item) {
  return !!(item?.deleted_at || item?.deletedAt || item?.is_deleted || item?.isDeleted)
}

export function isActiveMenuItem(item) {
  return !!item && !isDeletedMenuItem(item)
}

export function isCustomerMenuItem(item) {
  return isActiveMenuItem(item) && !!item?.available && !isCashierOnlyItem(item)
}

export function getQuickItemSortOrder(item) {
  const value = Number(item?.quick_item_sort_order ?? item?.quickItemSortOrder ?? item?.sort_order ?? 9999)
  return Number.isFinite(value) ? value : 9999
}
