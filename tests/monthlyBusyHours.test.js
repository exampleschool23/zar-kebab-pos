import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { loadDashboardMonthlyBusyHours } from '../src/lib/monthlyBusyHours.js'

test('monthly busy-hours loader returns compact two-hour buckets', async () => {
  const rows = await loadDashboardMonthlyBusyHours('2026-09-01', { dbClient: {
    rpc: async (name, args) => {
      assert.equal(name, 'get_dashboard_monthly_busy_hours')
      assert.deepEqual(args, { p_month_start: '2026-09-01' })
      return { data: [{ period_start_hour: 18, order_count: '42' }] }
    },
  } })
  assert.deepEqual(rows, [{ hour: 18, count: 42 }])
})

test('monthly busy-hours RPC is bounded, permission checked, and returns 12 buckets', () => {
  const sql = fs.readFileSync(new URL('../supabase/192_dashboard_monthly_busy_hours.sql', import.meta.url), 'utf8')
  assert.match(sql, /current_staff_can_access\('dashboard'\)/)
  assert.match(sql, /generate_series\(0, 22, 2\)/)
  assert.match(sql, /paid_at >= v_from and "order"\.paid_at < v_to/)
  assert.doesNotMatch(sql, /order_items/)
})
