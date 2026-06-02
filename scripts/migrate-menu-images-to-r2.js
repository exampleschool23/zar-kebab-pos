import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { uploadToR2, getR2Config, keyFromR2Url } from '../api/menu-image/_lib/r2.js'

const IMAGE_TABLES = [
  { table: 'menu_items', type: 'product', folder: 'products', label: 'menu item' },
  { table: 'menu_categories', type: 'category', folder: 'categories', label: 'category' },
]

const IMAGE_EXTENSIONS = {
  'image/avif': 'avif',
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
}

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
const verifyOnly = args.has('--verify')
const reportArgIndex = argv.findIndex(arg => arg === '--apply-report')
const reportEqualsArg = argv.find(arg => arg.startsWith('--apply-report='))
const applyReportFile = reportEqualsArg
  ? resolve(process.cwd(), reportEqualsArg.slice('--apply-report='.length))
  : reportArgIndex !== -1 && argv[reportArgIndex + 1]
    ? resolve(process.cwd(), argv[reportArgIndex + 1])
    : ''
const sqlReportArgIndex = argv.findIndex(arg => arg === '--sql-from-report')
const sqlReportEqualsArg = argv.find(arg => arg.startsWith('--sql-from-report='))
const sqlReportFile = sqlReportEqualsArg
  ? resolve(process.cwd(), sqlReportEqualsArg.slice('--sql-from-report='.length))
  : sqlReportArgIndex !== -1 && argv[sqlReportArgIndex + 1]
    ? resolve(process.cwd(), argv[sqlReportArgIndex + 1])
    : ''
const maxBytes = Number(process.env.MIGRATE_IMAGE_MAX_BYTES || 25 * 1024 * 1024)
const reportDir = resolve(process.cwd(), 'migration-reports')
const reportFile = resolve(reportDir, `menu-images-r2-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`)

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase config. Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or VITE_SUPABASE_ANON_KEY.')
  process.exit(1)
}

if ((apply || applyReportFile) && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Apply mode requires SUPABASE_SERVICE_ROLE_KEY so menu image URLs can be updated without RLS blocking the migration.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

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

function sqlString(value) {
  return `'${String(value ?? '').replace(/'/g, "''")}'`
}

function extensionFromUrl(url) {
  try {
    const ext = extname(new URL(url).pathname).replace(/^\./, '').toLowerCase()
    if (/^[a-z0-9]{2,5}$/.test(ext)) return ext === 'jpeg' ? 'jpg' : ext
  } catch {
    return ''
  }
  return ''
}

function extensionFor(contentType, url) {
  return IMAGE_EXTENSIONS[String(contentType || '').toLowerCase()] || extensionFromUrl(url) || 'img'
}

function objectKeyFor(row, tableInfo, contentType, url) {
  const ext = extensionFor(contentType, url)
  const timestamp = Date.now()
  const random = Math.random().toString(36).slice(2, 10)
  return `menu/${tableInfo.folder}/${safeSlug(row.id)}-${timestamp}-${random}.${ext}`
}

function isAlreadyR2(url) {
  try {
    return Boolean(keyFromR2Url(url))
  } catch {
    return false
  }
}

function isSupabaseStorageUrl(url) {
  try {
    const storageUrl = new URL(url)
    const projectUrl = new URL(supabaseUrl)
    return storageUrl.hostname === projectUrl.hostname && storageUrl.pathname.includes('/storage/v1/object/')
  } catch {
    return false
  }
}

function classifyUrl(url) {
  if (!url) return 'empty'
  if (isAlreadyR2(url)) return 'r2'
  if (isSupabaseStorageUrl(url)) return 'supabase-storage'
  if (/^https?:\/\//i.test(url)) return 'external'
  return 'invalid'
}

async function fetchImage(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`download failed: ${response.status} ${response.statusText}`)

  const contentType = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
  if (!contentType.startsWith('image/')) throw new Error(`not an image: ${contentType || 'unknown content type'}`)

  const contentLength = Number(response.headers.get('content-length') || 0)
  if (contentLength > maxBytes) throw new Error(`image is larger than ${maxBytes} bytes`)

  const buffer = Buffer.from(await response.arrayBuffer())
  if (!buffer.length) throw new Error('downloaded image is empty')
  if (buffer.length > maxBytes) throw new Error(`image is larger than ${maxBytes} bytes`)

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

async function verifyRows() {
  const counts = { total: 0, r2: 0, supabaseStorage: 0, external: 0, invalid: 0, empty: 0 }
  for (const tableInfo of IMAGE_TABLES) {
    const rows = await loadRows(tableInfo.table)
    for (const row of rows) {
      counts.total += 1
      const kind = classifyUrl(row.image_url)
      if (kind === 'r2') counts.r2 += 1
      else if (kind === 'supabase-storage') counts.supabaseStorage += 1
      else if (kind === 'external') counts.external += 1
      else if (kind === 'invalid') counts.invalid += 1
      else counts.empty += 1
    }
  }
  console.log('Menu image URL verification:')
  console.log(JSON.stringify(counts, null, 2))
}

async function migrateRow(row, tableInfo) {
  const oldUrl = String(row.image_url || '').trim()
  const kind = classifyUrl(oldUrl)
  const baseEntry = { table: tableInfo.table, id: row.id, oldUrl, kind }

  if (kind === 'empty') return { status: 'skipped-empty' }
  if (kind === 'r2') return { status: 'skipped-r2' }
  if (kind === 'external' && !includeExternal) return { status: 'skipped-external' }
  if (kind === 'invalid') return { status: 'skipped-invalid' }

  if (!apply) {
    writeReport({ ...baseEntry, action: 'dry-run' })
    return { status: 'would-migrate' }
  }

  const image = await fetchImage(oldUrl)
  const key = objectKeyFor(row, tableInfo, image.contentType, oldUrl)
  const uploaded = await uploadToR2({
    key,
    file: {
      buffer: image.buffer,
      contentType: image.contentType,
    },
  })

  await updateImageUrl(tableInfo.table, row.id, uploaded.url)
  writeReport({ ...baseEntry, action: 'migrated', key, newUrl: uploaded.url, bytes: image.buffer.length, contentType: image.contentType })
  return { status: 'migrated' }
}

async function applyReport(path) {
  if (!existsSync(path)) throw new Error(`Report file not found: ${path}`)

  const entries = readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => JSON.parse(line))
    .filter(entry => entry.action === 'migrated' && entry.table && entry.id && entry.newUrl)

  const totals = { scanned: entries.length, updated: 0, skipped: 0, failed: 0 }
  console.log(`Applying migrated R2 URLs from report: ${path}`)

  for (const entry of entries) {
    try {
      const { data: current, error: readError } = await supabase
        .from(entry.table)
        .select('id, image_url')
        .eq('id', entry.id)
        .single()

      if (readError) throw new Error(`database read failed: ${readError.message}`)
      if (current.image_url === entry.newUrl) {
        totals.skipped += 1
        process.stdout.write('.')
        continue
      }

      await updateImageUrl(entry.table, entry.id, entry.newUrl)
      totals.updated += 1
      process.stdout.write('.')
    } catch (error) {
      totals.failed += 1
      writeReport({ table: entry.table, id: entry.id, oldUrl: entry.oldUrl, newUrl: entry.newUrl, action: 'apply-report-failed', error: error.message })
      process.stdout.write('!')
    }
  }

  process.stdout.write('\n')
  console.log('\nReport apply summary:')
  console.log(JSON.stringify(totals, null, 2))
  if (totals.failed > 0) process.exitCode = 1
}

function entriesFromReport(path) {
  if (!existsSync(path)) throw new Error(`Report file not found: ${path}`)
  return readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => JSON.parse(line))
    .filter(entry => entry.action === 'migrated' && entry.table && entry.id && entry.newUrl)
}

function exportSqlFromReport(path) {
  const entries = entriesFromReport(path)
  const outputPath = path.replace(/\.jsonl$/i, '.sql')
  const lines = [
    '-- Generated by scripts/migrate-menu-images-to-r2.js',
    '-- Review, then run in the Supabase SQL editor if you do not want to use SUPABASE_SERVICE_ROLE_KEY locally.',
    'begin;',
    '',
  ]

  for (const entry of entries) {
    if (!IMAGE_TABLES.some(tableInfo => tableInfo.table === entry.table)) continue
    lines.push(`update public.${entry.table}`)
    lines.push(`set image_url = ${sqlString(entry.newUrl)}`)
    lines.push(`where id = ${sqlString(entry.id)} and image_url = ${sqlString(entry.oldUrl)};`)
    lines.push('')
  }

  lines.push('commit;')
  mkdirSync(reportDir, { recursive: true })
  writeFileSync(outputPath, `${lines.join('\n')}\n`)
  console.log(`SQL export written: ${outputPath}`)
}

async function main() {
  getR2Config()

  if (sqlReportFile) {
    exportSqlFromReport(sqlReportFile)
    return
  }

  if (applyReportFile) {
    await applyReport(applyReportFile)
    return
  }

  if (verifyOnly) {
    await verifyRows()
    return
  }

  const totals = {
    scanned: 0,
    migrated: 0,
    wouldMigrate: 0,
    skippedR2: 0,
    skippedExternal: 0,
    skippedInvalid: 0,
    failed: 0,
  }

  console.log(apply ? 'Migrating menu/category images to R2...' : 'Dry run: scanning menu/category images for R2 migration...')
  console.log(includeExternal ? 'External HTTP image URLs will also be copied.' : 'External HTTP image URLs will be left unchanged.')

  for (const tableInfo of IMAGE_TABLES) {
    const rows = await loadRows(tableInfo.table)
    console.log(`\n${tableInfo.table}: ${rows.length} image rows`)

    for (const row of rows) {
      totals.scanned += 1
      try {
        const result = await migrateRow(row, tableInfo)
        if (result.status === 'migrated') totals.migrated += 1
        else if (result.status === 'would-migrate') totals.wouldMigrate += 1
        else if (result.status === 'skipped-r2') totals.skippedR2 += 1
        else if (result.status === 'skipped-external') totals.skippedExternal += 1
        else if (result.status === 'skipped-invalid') totals.skippedInvalid += 1
        process.stdout.write('.')
      } catch (error) {
        totals.failed += 1
        writeReport({ table: tableInfo.table, id: row.id, oldUrl: row.image_url, action: 'failed', error: error.message })
        process.stdout.write('!')
      }
    }
    process.stdout.write('\n')
  }

  console.log('\nMigration summary:')
  console.log(JSON.stringify(totals, null, 2))
  console.log(`Report: ${reportFile}`)

  if (!apply) {
    console.log('\nNo database rows were changed. Rerun with --apply to migrate.')
  }

  if (totals.failed > 0) process.exitCode = 1
}

main().catch(error => {
  console.error(error.message || error)
  process.exit(1)
})
