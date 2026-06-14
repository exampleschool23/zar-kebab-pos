import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const TEST_USER_EMAILS = [
  'kanochiy6611@gmail.com',
  'sherzodovna.0208@gmail.com',
  'ddk9499@gmail.com',
  'yogam1.ddk@gmail.com',
  'javoxirbekshomurodov@gmail.com',
  'ustozkamolovad@gmail.com',
  'shomurodovamaftuna2007@gmail.com',
  'jasurbek@snoonu.com',
  'ustozkamolova@gmail.com',
  'dildoravlogs@gmail.com',
  'dildoramuqumova12@gmail.com',
]

const FALLBACK_TEST_NAMES = [
  'Izzatilla Ismatov',
  'Mehrinoz Amondullayeva',
  'Dostonbek K',
  'Dostonbek Kamalov',
  'Javoxirbek Shomurodov',
  'Дилрабо Камолова',
  'Maftuna Shomurodova',
  'Jasurbek Shomurodov',
  'Диля Камолова',
  'Dildora Vlogs',
  'Dildora Muqumova',
]

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

function parseArgs(argv) {
  const args = {
    apply: false,
    cutoff: '2026-06-11T19:00:00.000Z',
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--apply') {
      args.apply = true
    } else if (arg === '--cutoff' && argv[i + 1]) {
      args.cutoff = new Date(argv[i + 1]).toISOString()
      i += 1
    } else if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    }
  }
  return args
}

function printHelp() {
  console.log(`Usage:
  node scripts/cleanup-test-operations.js [--apply] [--cutoff ISO_DATE]

Default cutoff:
  2026-06-11T19:00:00.000Z
  This is 2026-06-12 00:00 in Asia/Tashkent, so it preserves real data from June 12 onward.

Dry-run is the default. Use --apply only after reviewing the report.
`)
}

function json(value) {
  return JSON.stringify(value, null, 2)
}

function isMissingRpc(error) {
  const message = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return message.includes('cleanup_test_operations') || message.includes('function') || message.includes('not found') || message.includes('pgrst202')
}

async function fetchAll(queryFactory, pageSize = 1000) {
  const rows = []
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1
    const { data, error } = await queryFactory().range(from, to)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < pageSize) break
  }
  return rows
}

async function countIn(supabase, table, column, values) {
  let total = 0
  const chunkSize = 500
  for (let i = 0; i < values.length; i += chunkSize) {
    const chunk = values.slice(i, i + chunkSize)
    const { count, error } = await supabase
      .from(table)
      .select('id', { count: 'exact', head: true })
      .in(column, chunk)
    if (error) throw error
    total += count || 0
  }
  return total
}

async function localPreview(supabase, cutoff) {
  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id,email,full_name,role,status,created_at')
    .in('email', TEST_USER_EMAILS)
    .order('full_name', { ascending: true })
  if (profileError) throw profileError

  const profileIds = profiles.map(profile => profile.id)
  const testNames = [...new Set([
    ...profiles.map(profile => profile.full_name).filter(Boolean),
    ...FALLBACK_TEST_NAMES,
  ])]

  const orders = await fetchAll(() => supabase
    .from('orders')
    .select('id,created_at,waiter_name,table_name,status,payment_status,total'))

  const cutoffMs = Date.parse(cutoff)
  const matchedOrders = orders.filter(order => {
    const createdAt = Date.parse(order.created_at)
    return createdAt < cutoffMs || testNames.includes(order.waiter_name)
  })
  const orderIds = matchedOrders.map(order => order.id)

  let orderItemsToDelete = 0
  let orderPaymentsToDelete = 0
  let orderPaymentAuditToDelete = 0
  if (orderIds.length > 0) {
    orderItemsToDelete = await countIn(supabase, 'order_items', 'order_id', orderIds)
    orderPaymentsToDelete = await countIn(supabase, 'order_payments', 'order_id', orderIds)
    orderPaymentAuditToDelete = await countIn(supabase, 'order_payment_audit', 'order_id', orderIds)
  }

  const cancellationRows = await fetchAll(() => supabase
    .from('order_item_cancellations')
    .select('id,order_id,created_by,created_at'))
  const orderIdSet = new Set(orderIds)
  const profileIdSet = new Set(profileIds)
  const orderItemCancellationsToDelete = cancellationRows.filter(row => (
    Date.parse(row.created_at) < cutoffMs ||
    orderIdSet.has(row.order_id) ||
    profileIdSet.has(row.created_by)
  )).length

  const profileAuditRows = await fetchAll(() => supabase
    .from('profile_audit')
    .select('id,profile_id,actor_id,changed_at'))
  const profileAuditToDelete = profileAuditRows.filter(row => (
    Date.parse(row.changed_at) < cutoffMs ||
    profileIdSet.has(row.profile_id) ||
    profileIdSet.has(row.actor_id)
  )).length

  const loyaltyRows = await fetchAll(() => supabase
    .from('loyalty_transactions')
    .select('id,order_id,created_by,created_at'))
  const loyaltyTransactionsPreserved = loyaltyRows.filter(row => (
    Date.parse(row.created_at) < cutoffMs ||
    orderIdSet.has(row.order_id) ||
    profileIdSet.has(row.created_by)
  )).length

  return {
    apply: false,
    rpcInstalled: false,
    cutoffUtc: cutoff,
    cutoffMeaning: 'default equals 2026-06-12 00:00 Asia/Tashkent; matching rows are before this timestamp',
    matchedProfiles: profiles,
    matchedWaiterNames: testNames,
    ordersToDelete: orderIds.length,
    orderItemsToDelete,
    orderPaymentsToDelete,
    orderPaymentAuditToDelete,
    orderItemCancellationsToDelete,
    profileAuditToDelete,
    loyaltyTransactionsPreserved,
    sampleOrders: matchedOrders
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      .slice(0, 20),
    note: 'Install supabase/039_cleanup_test_operations.sql before applying. Loyalty transactions are intentionally preserved to avoid corrupting wallet balances.',
  }
}

loadEnvFile(resolve(process.cwd(), '.env.local'))
loadEnvFile(resolve(process.cwd(), '.env'))

const args = parseArgs(process.argv.slice(2))
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing Supabase config. Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

let report
const { data, error } = await supabase.rpc('cleanup_test_operations', {
  p_cutoff: args.cutoff,
  p_test_emails: TEST_USER_EMAILS,
  p_apply: args.apply,
})

if (error && isMissingRpc(error)) {
  if (args.apply) {
    console.error('cleanup_test_operations RPC is not installed. Run supabase/039_cleanup_test_operations.sql in Supabase SQL Editor first, then rerun with --apply.')
    process.exit(1)
  }
  report = await localPreview(supabase, args.cutoff)
} else if (error) {
  console.error('Cleanup failed:')
  console.error(json(error))
  process.exit(1)
} else {
  report = { rpcInstalled: true, ...data }
}

mkdirSync(resolve(process.cwd(), 'migration-reports'), { recursive: true })
const reportPath = resolve(process.cwd(), 'migration-reports', `test-operations-cleanup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
writeFileSync(reportPath, `${json(report)}\n`)

console.log(args.apply ? 'Cleanup applied.' : 'Cleanup dry-run.')
console.log(json(report))
console.log(`Report: ${reportPath}`)
