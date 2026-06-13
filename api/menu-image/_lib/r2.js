import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

const MAX_FILE_SIZE = 5 * 1024 * 1024
const VALID_TYPES = new Set(['product', 'category'])

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

export function assertImageFile(file) {
  if (!file?.buffer?.length) throw new Error('Image file is required')
  if (String(file.contentType || '').toLowerCase() !== 'image/webp') throw new Error('Only WebP menu images are allowed')
  if (file.buffer.length > MAX_FILE_SIZE) throw new Error('Image must be 5 MB or smaller')
  const header = file.buffer.subarray(0, 12)
  if (header.toString('ascii', 0, 4) !== 'RIFF' || header.toString('ascii', 8, 12) !== 'WEBP') {
    throw new Error('Uploaded WebP file is invalid')
  }
}

function safeSlug(value) {
  return String(value || 'temp')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'temp'
}

export function makeObjectKey({ type, entityId }) {
  if (!VALID_TYPES.has(type)) throw new Error('Image type must be product or category')
  const folder = type === 'category' ? 'categories' : 'products'
  const timestamp = Date.now()
  const random = Math.random().toString(36).slice(2, 10)
  return `menu/${folder}/${safeSlug(entityId)}-${timestamp}-${random}.webp`
}

export async function uploadToR2({ key, file }) {
  const config = getR2Config()
  await getR2Client().send(new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    Body: file.buffer,
    ContentType: file.contentType || 'image/webp',
    CacheControl: 'public, max-age=31536000, immutable',
  }))
  return {
    key,
    url: `${config.publicBaseUrl}/${key}`,
  }
}

export function keyFromR2Url(urlOrKey) {
  const value = String(urlOrKey || '').trim()
  if (!value) return ''
  if (!/^https?:\/\//i.test(value)) return value.replace(/^\/+/, '')

  const { publicBaseUrl } = getR2Config()
  const base = new URL(publicBaseUrl)
  const url = new URL(value)
  if (url.origin !== base.origin) return ''

  const basePath = base.pathname.replace(/\/+$/, '')
  if (basePath && !url.pathname.startsWith(`${basePath}/`)) return ''
  return decodeURIComponent(url.pathname.slice(basePath.length).replace(/^\/+/, ''))
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
