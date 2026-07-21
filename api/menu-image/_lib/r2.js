import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

const VALID_TYPES = new Set(['product', 'category'])
const IMAGE_EXTENSIONS = {
  'image/avif': 'avif',
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}
const ALLOWED_IMAGE_TYPES = new Set(Object.keys(IMAGE_EXTENSIONS))
const MENU_OBJECT_KEY_PATTERN = /^menu\/(?:products|categories)\/[a-z0-9][a-z0-9._-]{0,220}$/i

function requiredEnv(name) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

export function getR2Config() {
  const accountId = requiredEnv('R2_ACCOUNT_ID')
  return {
    endpoint: process.env.R2_ENDPOINT || `https://${accountId}.r2.cloudflarestorage.com`,
    accessKeyId: requiredEnv('R2_ACCESS_KEY_ID'),
    secretAccessKey: requiredEnv('R2_SECRET_ACCESS_KEY'),
    bucket: requiredEnv('R2_BUCKET'),
    publicBaseUrl: requiredEnv('R2_PUBLIC_BASE_URL').replace(/\/+$/, ''),
  }
}

export function getR2Client() {
  const config = getR2Config()
  return new S3Client({
    endpoint: config.endpoint,
    region: 'auto',
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  })
}

export async function assertImageFile(file) {
  if (!file?.buffer?.length) throw new Error('Image file is required')
  const contentType = String(file.contentType || '').toLowerCase()
  if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
    throw new Error('Only JPEG, PNG, WebP, GIF, or AVIF images are allowed')
  }
  if (!matchesImageSignature(file.buffer, contentType)) {
    throw new Error('Image contents do not match the declared file type')
  }
}

function matchesImageSignature(buffer, contentType) {
  if (contentType === 'image/jpeg' || contentType === 'image/jpg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
  }
  if (contentType === 'image/png') {
    return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  }
  if (contentType === 'image/gif') {
    const signature = buffer.subarray(0, 6).toString('ascii')
    return signature === 'GIF87a' || signature === 'GIF89a'
  }
  if (contentType === 'image/webp') {
    return buffer.length >= 12
      && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
      && buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  }
  if (contentType === 'image/avif') {
    return buffer.length >= 16
      && buffer.subarray(4, 8).toString('ascii') === 'ftyp'
      && /avif|avis/.test(buffer.subarray(8, Math.min(buffer.length, 40)).toString('ascii'))
  }
  return false
}

function extensionForContentType(contentType) {
  return IMAGE_EXTENSIONS[String(contentType || '').toLowerCase()] || 'img'
}

function safeSlug(value) {
  return String(value || 'temp')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'temp'
}

export function makeObjectKey({ type, entityId, contentType }) {
  if (!VALID_TYPES.has(type)) throw new Error('Image type must be product or category')
  const folder = type === 'category' ? 'categories' : 'products'
  const timestamp = Date.now()
  const random = Math.random().toString(36).slice(2, 10)
  return `menu/${folder}/${safeSlug(entityId)}-${timestamp}-${random}.${extensionForContentType(contentType)}`
}

export async function uploadToR2({ key, file }) {
  const safeKey = normalizeMenuObjectKey(key)
  if (!safeKey) throw new Error('Invalid menu image object key')
  await assertImageFile(file)
  const config = getR2Config()
  await getR2Client().send(new PutObjectCommand({
    Bucket: config.bucket,
    Key: safeKey,
    Body: file.buffer,
    ContentType: file.contentType || 'image/webp',
    CacheControl: 'public, max-age=31536000, immutable',
  }))
  return {
    key: safeKey,
    url: `${config.publicBaseUrl}/${safeKey}`,
  }
}

export function normalizeMenuObjectKey(value) {
  try {
    const decoded = decodeURIComponent(String(value || '').trim().replace(/^\/+/, ''))
    if (!MENU_OBJECT_KEY_PATTERN.test(decoded) || decoded.includes('..')) return ''
    return decoded
  } catch {
    return ''
  }
}

export function keyFromR2Url(urlOrKey) {
  const value = String(urlOrKey || '').trim()
  if (!value) return ''
  if (!/^https?:\/\//i.test(value)) return normalizeMenuObjectKey(value)

  const { publicBaseUrl } = getR2Config()
  const base = new URL(publicBaseUrl)
  const url = new URL(value)
  if (url.origin !== base.origin) return ''

  const basePath = base.pathname.replace(/\/+$/, '')
  if (basePath && !url.pathname.startsWith(`${basePath}/`)) return ''
  return normalizeMenuObjectKey(url.pathname.slice(basePath.length))
}

export async function deleteFromR2(urlOrKey) {
  const key = keyFromR2Url(urlOrKey)
  if (!key) return { key: '', deleted: false }

  const config = getR2Config()
  await getR2Client().send(new DeleteObjectCommand({
    Bucket: config.bucket,
    Key: key,
  }))
  return { key, deleted: true }
}
