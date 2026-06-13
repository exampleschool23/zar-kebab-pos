import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { getR2Config, uploadToR2 } from '../api/menu-image/_lib/r2.js'

const IMAGE_TABLES = [
  { table: 'menu_items', folder: 'products', label: 'menu item' },
  { table: 'menu_categories', folder: 'categories', label: 'category' },
]

const DEFAULT_TARGET_BYTES = 50 * 1024
const DEFAULT_MAX_DIMENSION = 520
const MIN_DIMENSION = 160
const QUALITIES = [76, 70, 64, 58, 52, 46, 40, 34, 28, 22]

function loadEnvFile(path) {
  if (!existsSync(path)) return
  const text = readFileSync(path, 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
}

loadEnvFile(resolve(process.cwd(), '.env.local'))
loadEnvFile(resolve(process.cwd(), '.env'))

const argv = process.argv.slice(2)
const args = new Set(argv)
const apply = args.has('--apply')
const includeExternal = args.has('--include-external')
const force = args.has('--force')
const targetBytes = parseBytesArg('--target-kb', DEFAULT_TARGET_BYTES)
const maxDimension = parseNumberArg('--max-dimension', DEFAULT_MAX_DIMENSION)
const reportDir = resolve(process.cwd(), 'migration-reports')
const reportFile = resolve(reportDir, `menu-images-optimized-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`)

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase config. Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or VITE_SUPABASE_ANON_KEY.')
  process.exit(1)
}

if (apply && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Apply mode requires SUPABASE_SERVICE_ROLE_KEY so menu image URLs can be updated without RLS blocking the optimization.')
  process.exit(1)
}

if (apply && /^sb_publish/i.test(String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim())) {
  console.error('SUPABASE_SERVICE_ROLE_KEY is set to a publishable key. Use the private service_role key from Supabase Project Settings > API.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function argValue(name) {
  const index = argv.findIndex(arg => arg === name)
  const equals = argv.find(arg => arg.startsWith(`${name}=`))
  if (equals) return equals.slice(name.length + 1)
  if (index !== -1) return argv[index + 1]
  return ''
}

function parseBytesArg(name, fallback) {
  const value = Number(argValue(name))
  return Number.isFinite(value) && value > 0 ? Math.round(value * 1024) : fallback
}

function parseNumberArg(name, fallback) {
  const value = Number(argValue(name))
  return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback
}

function writeReport(entry) {
  mkdirSync(reportDir, { recursive: true })
  appendFileSync(reportFile, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`)
}

function safeSlug(value) {
  return String(value || 'temp')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'temp'
}

function isR2Url(url) {
  try {
    const base = new URL(getR2Config().publicBaseUrl)
    const parsed = new URL(url)
    return parsed.origin === base.origin
  } catch {
    return false
  }
}

function isRealWebp(buffer) {
  if (buffer.length < 12) return false
  return buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP'
}

function formatBytes(bytes) {
  return `${Math.round(bytes / 1024)} KB`
}

function objectKeyFor(row, tableInfo) {
  const timestamp = Date.now()
  const random = Math.random().toString(36).slice(2, 10)
  return `menu/${tableInfo.folder}/${safeSlug(row.id)}-${timestamp}-${random}.webp`
}

async function fetchImage(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`download failed: ${response.status} ${response.statusText}`)

  const contentType = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
  if (!contentType.startsWith('image/')) throw new Error(`not an image: ${contentType || 'unknown content type'}`)

  const buffer = Buffer.from(await response.arrayBuffer())
  if (!buffer.length) throw new Error('downloaded image is empty')
  return { buffer, contentType }
}

async function loadRows(table) {
  const { data, error } = await supabase
    .from(table)
    .select('id, image_url')
    .not('image_url', 'is', null)
    .neq('image_url', '')
    .order('id')

  if (error) throw new Error(`${table}: ${error.message}`)
  return data || []
}

async function updateImageUrl(table, id, imageUrl) {
  const { data, error } = await supabase
    .from(table)
    .update({ image_url: imageUrl })
    .eq('id', id)
    .select('id, image_url')
    .single()

  if (error) throw new Error(`database update failed: ${error.message}`)
  if (!data || data.image_url !== imageUrl) throw new Error('database update did not persist the new image URL')
}

async function assertApplyCanUpdateRows() {
  const tableInfo = IMAGE_TABLES[0]
  const rows = await loadRows(tableInfo.table)
  const row = rows[0]
  if (!row) throw new Error(`No ${tableInfo.table} image rows found for update preflight`)

  try {
    await updateImageUrl(tableInfo.table, row.id, row.image_url)
  } catch (error) {
    throw new Error(`Apply preflight failed. Check SUPABASE_SERVICE_ROLE_KEY; it must be the private service_role key, not the publishable or anon key. ${error.message}`)
  }
}

async function encodeWebpUnderTarget(inputBuffer) {
  let best = null
  const metadata = await sharp(inputBuffer, { animated: false }).metadata()
  const sourceMax = Math.max(metadata.width || maxDimension, metadata.height || maxDimension)
  const firstDimension = Math.min(maxDimension, sourceMax)

  for (let dimension = firstDimension; dimension >= MIN_DIMENSION; dimension = Math.floor(dimension * 0.86)) {
    for (const quality of QUALITIES) {
      const buffer = await sharp(inputBuffer, { animated: false })
        .rotate()
        .resize({
          width: dimension,
          height: dimension,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({
          quality,
          effort: 6,
          smartSubsample: true,
        })
        .toBuffer()

      const candidate = { buffer, bytes: buffer.length, width: dimension, quality }
      if (!best || candidate.bytes < best.bytes) best = candidate
      if (candidate.bytes <= targetBytes) return { ...candidate, metTarget: true }
    }
  }

  return { ...best, metTarget: best?.bytes <= targetBytes }
}

async function optimizeRow(row, tableInfo) {
  const oldUrl = String(row.image_url || '').trim()
  const baseEntry = { table: tableInfo.table, id: row.id, oldUrl }
  if (!oldUrl) return { status: 'skipped-empty' }
  if (!includeExternal && !isR2Url(oldUrl)) return { status: 'skipped-external' }

  const image = await fetchImage(oldUrl)
  const alreadyGood = isRealWebp(image.buffer) && image.buffer.length <= targetBytes
  if (alreadyGood && !force) {
    writeReport({ ...baseEntry, action: 'skipped-small-webp', oldBytes: image.buffer.length, contentType: image.contentType })
    return { status: 'skipped-small' }
  }

  const optimized = await encodeWebpUnderTarget(image.buffer)
  const reportEntry = {
    ...baseEntry,
    action: apply ? 'optimized' : 'dry-run',
    oldBytes: image.buffer.length,
    newBytes: optimized.bytes,
    savedBytes: image.buffer.length - optimized.bytes,
    targetBytes,
    metTarget: optimized.metTarget,
    width: optimized.width,
    quality: optimized.quality,
    originalContentType: image.contentType,
    originalWasRealWebp: isRealWebp(image.buffer),
  }

  if (!optimized.metTarget) {
    writeReport({ ...reportEntry, action: 'failed-target' })
    return { status: 'failed-target' }
  }

  if (!apply) {
    writeReport(reportEntry)
    return { status: 'would-optimize' }
  }

  const key = objectKeyFor(row, tableInfo)
  const uploaded = await uploadToR2({
    key,
    file: {
      buffer: optimized.buffer,
      contentType: 'image/webp',
    },
  })

  await updateImageUrl(tableInfo.table, row.id, uploaded.url)
  writeReport({ ...reportEntry, key, newUrl: uploaded.url })
  return { status: 'optimized' }
}

async function main() {
  getR2Config()
  if (apply) await assertApplyCanUpdateRows()

  const totals = {
    scanned: 0,
    optimized: 0,
    wouldOptimize: 0,
    skippedSmall: 0,
    skippedExternal: 0,
    failedTarget: 0,
    failed: 0,
  }

  console.log(apply ? 'Optimizing menu/category images...' : 'Dry run: scanning menu/category images for optimization...')
  console.log(`Target: ${formatBytes(targetBytes)}. Max dimension: ${maxDimension}px.`)
  console.log(includeExternal ? 'External HTTP image URLs will also be optimized.' : 'External HTTP image URLs will be left unchanged.')
  if (!apply) console.log('No database rows or R2 objects will be changed. Rerun with --apply to update images.')

  for (const tableInfo of IMAGE_TABLES) {
    const rows = await loadRows(tableInfo.table)
    console.log(`\n${tableInfo.table}: ${rows.length} image rows`)

    for (const row of rows) {
      totals.scanned += 1
      try {
        const result = await optimizeRow(row, tableInfo)
        if (result.status === 'optimized') totals.optimized += 1
        else if (result.status === 'would-optimize') totals.wouldOptimize += 1
        else if (result.status === 'skipped-small') totals.skippedSmall += 1
        else if (result.status === 'skipped-external') totals.skippedExternal += 1
        else if (result.status === 'failed-target') totals.failedTarget += 1
        process.stdout.write('.')
      } catch (error) {
        totals.failed += 1
        writeReport({ table: tableInfo.table, id: row.id, oldUrl: row.image_url, action: 'failed', error: error.message })
        process.stdout.write('!')
      }
    }
    process.stdout.write('\n')
  }

  console.log('\nOptimization summary:')
  console.log(JSON.stringify(totals, null, 2))
  console.log(`Report: ${reportFile}`)
  if (totals.failed > 0 || totals.failedTarget > 0) process.exitCode = 1
}

main().catch(error => {
  console.error(error.message || error)
  process.exit(1)
})
