/**
 * Zar Kebab – Supabase DB health check
 * Run in the browser console while on the app (so the Supabase client is available),
 * OR run from Node: node scripts/check-db.js
 */

const SUPABASE_URL = 'https://bcdbljpwhyawaasimjmk.supabase.co'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjZGJsanB3aHlhd2Fhc2ltam1rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4NjYxODUsImV4cCI6MjA5NDQ0MjE4NX0.zUpXmrJ9ossyyCBN0XBRzAMPqJfKJtXnq_gyjNpV9u8'

async function q(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
  })
  return r.json()
}

async function checkDB() {
  console.log('🔍 Checking Supabase DB…\n')

  // ── 1. Legacy orders with NULL payment_status ──────────────────────────────
  const nullOrders = await q(
    '/orders?select=id,table_id,table_name,status,payment_status,created_at,total' +
    '&payment_status=is.null&order=created_at.desc&limit=50'
  )
  console.log(`\n── 1. Orders with NULL payment_status ──────────────── (${nullOrders.length ?? '?'})`)
  if (Array.isArray(nullOrders) && nullOrders.length) {
    nullOrders.forEach(o =>
      console.log(`  ${o.id.slice(0,8)}  table="${o.table_name}"  status="${o.status}"  created=${o.created_at?.slice(0,16)}  total=${o.total}`)
    )
    console.warn('  ⚠️  These are the "legacy" orders that caused the Request Bill / Confirm Served bugs.')
    console.warn('  ⚠️  Run the migration below to fix them in DB.')
  } else {
    console.log('  ✅ None found')
  }

  // ── 2. Active (unpaid) orders ──────────────────────────────────────────────
  const active = await q(
    '/orders?select=id,table_id,table_name,status,payment_status,created_at,total' +
    '&payment_status=neq.paid&order=created_at.desc&limit=50'
  )
  console.log(`\n── 2. Active (non-paid) orders ─────────────────────── (${active.length ?? '?'})`)
  if (Array.isArray(active)) {
    active.forEach(o =>
      console.log(`  ${o.id.slice(0,8)}  table="${o.table_name}"  status="${o.status}"  payment_status="${o.payment_status}"  created=${o.created_at?.slice(0,16)}  total=${o.total}`)
    )
  }

  // ── 3. Stale occupied tables with no unpaid orders ─────────────────────────
  const tables = await q('/restaurant_tables?select=id,name,status&order=name')
  const activeIds = new Set((Array.isArray(active) ? active : []).map(o => o.table_id).filter(Boolean))
  const stale = Array.isArray(tables)
    ? tables.filter(t => ['occupied', 'needs_bill'].includes(t.status) && !activeIds.has(t.id))
    : []
  console.log(`\n── 3. Tables status ────────────────────────────────── (${tables.length ?? '?'} total)`)
  if (Array.isArray(tables)) {
    tables.forEach(t =>
      console.log(`  ${t.name.padEnd(15)} ${t.status}`)
    )
  }
  if (stale.length) {
    console.warn(`\n  ⚠️  ${stale.length} table(s) stuck as occupied/needs_bill with NO active orders:`)
    stale.forEach(t => console.warn(`     → ${t.name} (${t.status})`))
    console.warn('  ⚠️  These can be reset with the migration below.')
  } else {
    console.log('\n  ✅ No stale table statuses found')
  }

  // ── 4. Summary + migration SQL ────────────────────────────────────────────
  const needsMigration = (Array.isArray(nullOrders) && nullOrders.length > 0) || stale.length > 0
  if (needsMigration) {
    console.log('\n── 4. Suggested migration SQL ──────────────────────────────────────────────')
    if (Array.isArray(nullOrders) && nullOrders.length > 0) {
      console.log(`
-- Fix legacy orders: set payment_status to 'unpaid' where it is NULL
UPDATE orders
SET payment_status = 'unpaid'
WHERE payment_status IS NULL
  AND status NOT IN ('paid', 'cancelled', 'completed');
`)
    }
    if (stale.length) {
      const ids = stale.map(t => `'${t.id}'`).join(', ')
      console.log(`
-- Reset stale table statuses that have no active orders
UPDATE restaurant_tables
SET status = 'available'
WHERE id IN (${ids})
  AND status IN ('occupied', 'needs_bill');
`)
    }
  } else {
    console.log('\n✅ DB looks clean — no migration needed')
  }
}

checkDB().catch(console.error)
