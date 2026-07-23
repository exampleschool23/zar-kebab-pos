export const MENU_IMAGE_MIME_TYPES = [
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]

export const MENU_VIDEO_MIME_TYPES = [
  'video/mp4',
  'video/webm',
]

export const MENU_IMAGE_ACCEPT = MENU_IMAGE_MIME_TYPES.join(',')
export const MENU_PRODUCT_MEDIA_ACCEPT = [...MENU_IMAGE_MIME_TYPES, ...MENU_VIDEO_MIME_TYPES].join(',')

export function isMenuVideoMimeType(value) {
  return MENU_VIDEO_MIME_TYPES.includes(String(value || '').trim().toLowerCase())
}

export function isMenuVideoUrl(value) {
  const url = String(value || '').trim()
  if (!url) return false
  if (/^data:video\/(?:mp4|webm)[;,]/i.test(url)) return true
  const path = url.split(/[?#]/, 1)[0]
  return /\.(?:mp4|webm)$/i.test(path)
}

export function normalizeMenuMediaUrls(values = []) {
  let rows = values
  if (typeof rows === 'string') {
    try {
      rows = JSON.parse(rows)
    } catch {
      rows = [rows]
    }
  }
  if (!Array.isArray(rows)) rows = rows ? [rows] : []

  const seen = new Set()
  return rows
    .map(value => String(value || '').trim())
    .filter(value => {
      if (!value || seen.has(value)) return false
      seen.add(value)
      return true
    })
}

export function getMenuItemMediaUrls(item) {
  if (!item) return []
  const gallery = item.media_urls ?? item.mediaUrls ?? []
  return normalizeMenuMediaUrls([item.image_url || item.imageUrl || '', ...normalizeMenuMediaUrls(gallery)])
}

export function getMenuItemPrimaryMediaUrl(item) {
  return getMenuItemMediaUrls(item)[0] || ''
}
