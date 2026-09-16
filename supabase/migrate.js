#!/usr/bin/env node
import { migrationFiles, migrationStatus, trackedMigrationSql } from '../scripts/migrationTools.js'

async function main() {
  const [mode = '--help', ...names] = process.argv.slice(2)
  if (mode === '--help') {
    console.log('Usage: node supabase/migrate.js --status | --sql <full-filename>... | --apply <full-filename>...\nApply 199_migration_tracking.sql once to initialize tracking. SQL export needs no credentials.\nAPI commands require SUPABASE_PROJECT_REF and SUPABASE_TOKEN. No automatic legacy replay or baseline.')
    return
  }
  const files = migrationFiles()
  if (!['--status', '--sql', '--apply'].includes(mode) || (mode === '--status' ? names.length : !names.length)) throw new Error('Invalid arguments; use --help')
  const selected = names.map(name => {
    const file = files.find(file => file.filename === name)
    if (!file) throw new Error(`Use an exact migration filename: ${name}`)
    return file
  })
  if (new Set(names).size !== names.length) throw new Error('Duplicate migration selection')
  // Tracking must precede repairs to older deployments. Other selected files follow filename order.
  selected.sort((a, b) => a.filename === '199_migration_tracking.sql' ? -1 : b.filename === '199_migration_tracking.sql' ? 1 : a.filename.localeCompare(b.filename))
  const scripts = selected.map(trackedMigrationSql)
  if (mode === '--sql') { console.log(scripts.join('\n')); return }
  const ref = process.env.SUPABASE_PROJECT_REF, token = process.env.SUPABASE_TOKEN
  if (!ref || !/^[a-z0-9]+$/.test(ref) || !token) throw new Error('Set SUPABASE_PROJECT_REF and SUPABASE_TOKEN')
  async function query(sql) {
    const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sql }), signal: AbortSignal.timeout(150000),
    })
    const body = await response.json()
    if (!response.ok) throw new Error(body.message || `Database request failed (${response.status})`)
    return body
  }
  if (mode === '--status') {
    const tables = await query("select to_regclass('public.app_schema_migrations') is not null as present")
    const receipts = tables[0]?.present ? await query('select filename, sha256 from public.app_schema_migrations') : []
    const statuses = migrationStatus(files, receipts)
    for (const row of statuses) console.log(`${row.status.padEnd(16)} ${row.filename}`)
    if (statuses.some(row => ['CHANGED', 'PENDING', 'MISSING_FILE'].includes(row.status))) process.exitCode = 1
    return
  }
  for (let i = 0; i < selected.length; i++) {
    await query(scripts[i])
    console.log(`Verified receipt: ${selected[i].filename}`)
  }
}
main().catch(error => {
  console.error(error.message)
  console.error('No automatic retry. If the connection was lost, check --status before resubmitting the same filename.')
  process.exitCode = 1
})
