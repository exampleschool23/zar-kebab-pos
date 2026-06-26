import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import sharp from 'sharp'

const MAX_FILE_SIZE = 5 * 1024 * 1024
const MENU_IMAGE_TARGET_SIZE = 600
const MAX_MENU_IMAGE_BYTES = 100 * 1024
const VALID_TYPES = new Set(['product', 'category'])
const IMAGE_EXTENSIONS = {
  'image/avif': 'avif',
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
}

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
  if (!contentType.startsWith('image/')) throw new Error('Only image uploads are allowed')
  if (file.buffer.length > MAX_FILE_SIZE) throw new Error('Image must be 5 MB or smaller')
  if (contentType !== 'image/webp') throw new Error('Only WebP menu images are allowed')
  if (file.buffer.length > MAX_MENU_IMAGE_BYTES) throw new Error('Menu images must be smaller than 100 KB')
  if (!isWebpBuffer(file.buffer)) {
    throw new Error('This file is named WebP but contains different image data')
  }
  const metadata = await sharp(file.buffer, { animated: false }).metadata()
  if (metadata.width !== MENU_IMAGE_TARGET_SIZE || metadata.height !== MENU_IMAGE_TARGET_SIZE) {
    throw new Error('Menu images must be exactly 600x600 px')
  }
}

function isWebpBuffer(buffer) {
  const header = buffer.subarray(0, 12)
  return header.toString('ascii', 0, 4) === 'RIFF' && header.toString('ascii', 8, 12) === 'WEBP'
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
