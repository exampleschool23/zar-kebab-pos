export function getMenuItemLinkKey(item) {
  return String(item?.external_id || item?.externalId || item?.id || '').trim()
}

export function getMenuItemPublicPath(item, basePath = '/menu') {
  const key = getMenuItemLinkKey(item)
  const normalizedBase = String(basePath || '/menu').replace(/\/+$/, '') || '/menu'
  return key ? `${normalizedBase}/item/${encodeURIComponent(key)}` : normalizedBase
}

export function getMenuItemPublicUrl(item, origin = globalThis?.location?.origin, basePath = '/menu') {
  const path = getMenuItemPublicPath(item, basePath)
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
