export function getMenuItemLinkKey(item) {
  return String(item?.external_id || item?.externalId || item?.id || '').trim()
}

export function getMenuItemPublicPath(item) {
  const key = getMenuItemLinkKey(item)
  return key ? `/menu/item/${encodeURIComponent(key)}` : '/menu'
}

export function getMenuItemPublicUrl(item, origin = globalThis?.location?.origin) {
  const path = getMenuItemPublicPath(item)
  if (!origin) return path
  return new URL(path, origin).toString()
}

export function findMenuItemByLinkKey(items, linkKey) {
  const decoded = decodeURIComponent(String(linkKey || '')).trim()
  if (!decoded) return null
  return (items || []).find(item =>
    item.id === decoded ||
    item.external_id === decoded ||
    item.externalId === decoded
  ) || null
}
