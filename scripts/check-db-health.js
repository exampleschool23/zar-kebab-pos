import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

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

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase config. Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or VITE_SUPABASE_ANON_KEY.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: (url, options = {}) => {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 8000)
      return fetch(url, { ...options, signal: controller.signal })
        .finally(() => clearTimeout(timeout))
    },
  },
})

function classifyError(error) {
  const text = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  if (error?.name === 'AbortError' || text.includes('fetch failed') || text.includes('aborted')) return 'network'
  if (text.includes('permission denied') || text.includes('42501')) return 'permission'
  if (text.includes('does not exist') || text.includes('schema cache') || text.includes('42p01') || text.includes('42703')) return 'missing'
  if (text.includes('function') && text.includes('not found')) return 'missing'
  return 'error'
}

function makeCheck(name, ok, detail, required = true) {
  return { name, ok, detail, required }
}

async function checkTable(name, select, required = true) {
  let error = null
  try {
    ;({ error } = await supabase
      .from(name)
      .select(select, { head: true, count: 'exact' })
      .limit(1))
  } catch (err) {
    error = err
  }

  if (!error) {
    return makeCheck(name, true, `table/columns OK: ${select}`, required)
  }

  const kind = classifyError(error)
  const ok = kind === 'permission' && !process.env.SUPABASE_SERVICE_ROLE_KEY
  const hint = ok
    ? 'permission denied with anon key; rerun with SUPABASE_SERVICE_ROLE_KEY for a stronger check'
    : kind === 'network'
      ? `network/request failed: ${error.message}`
    : `${error.code || 'ERROR'} ${error.message}`
  return makeCheck(name, ok, hint, required)
}

async function checkRpc(name, invoke, expectedError, required = true) {
  let error = null
  try {
    ;({ error } = await invoke())
  } catch (err) {
    error = err
  }
  if (!error) {
    return makeCheck(name, true, 'RPC callable', required)
  }

  const message = `${error.message || ''} ${error.details || ''}`.toLowerCase()
  if (expectedError && message.includes(expectedError)) {
    return makeCheck(name, true, `RPC exists; validation returned "${error.message}"`, required)
  }

  const kind = classifyError(error)
  return makeCheck(
    name,
    false,
    kind === 'network' ? `network/request failed: ${error.message}` : `${error.code || 'ERROR'} ${error.message}`,
    required
  )
}

const checks = await Promise.all([
  checkTable('profiles', 'id, role, status, full_name, email'),
  checkTable('restaurant_tables', 'id, name, status, sort_order'),
  checkTable('menu_categories', 'id, name_uz, name_ru, name_en, sort_order'),
  checkTable('menu_items', 'id, category_id, name_uz, name_ru, name_en, price, available, sort_order'),
  checkTable('orders', 'id, table_id, table_name, status, payment_status, service_rate_pct, order_type, order_number'),
  checkTable('order_items', 'id, order_id, menu_item_id, status, order_type, item_type, is_counter_item'),
  checkTable('business_settings', 'id, restaurant_name, service_rate_pct, receipt_footer, auto_print'),
  checkTable('order_payments', 'id, order_id, method, amount'),
  checkRpc(
    'get_public_menu_data()',
    () => supabase.rpc('get_public_menu_data'),
    null,
    false
  ),
  checkRpc(
    'submit_order_to_kitchen(payload)',
    () => supabase.rpc('submit_order_to_kitchen', { payload: {} }),
    'order id is required'
  ),
])

const failedRequired = checks.filter(check => check.required && !check.ok)
const failedOptional = checks.filter(check => !check.required && !check.ok)

console.log('\nSupabase health check\n')
for (const check of checks) {
  const marker = check.ok ? 'OK ' : check.required ? 'FAIL' : 'WARN'
  console.log(`${marker} ${check.name}`)
  console.log(`     ${check.detail}`)
}

if (failedOptional.length > 0) {
  console.log('\nOptional warnings:')
  for (const check of failedOptional) console.log(`- ${check.name}: ${check.detail}`)
}

if (failedRequired.length > 0) {
  const networkFailures = failedRequired.filter(check => check.detail.includes('network/request failed')).length
  if (networkFailures === failedRequired.length) {
    console.log('\nRequired checks failed because Supabase could not be reached. Check network access and Supabase env values, then rerun this script.')
  } else {
    console.log('\nRequired checks failed. Apply missing migrations in order from supabase/ and rerun this script.')
  }
  process.exit(1)
}

console.log('\nAll required Supabase checks passed.')
