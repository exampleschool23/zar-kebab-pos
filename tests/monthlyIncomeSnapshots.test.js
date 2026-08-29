import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

import {
  loadDashboardMonthlyAverageIncome,
  normalizeDashboardMonthlyIncomeRows,
} from '../src/lib/monthlyIncome.js'

const migration = fs.readFileSync(
  new URL('../supabase/157_dashboard_monthly_income_snapshots.sql', import.meta.url),
  'utf8'
)
const loader = fs.readFileSync(new URL('../src/lib/monthlyIncome.js', import.meta.url), 'utf8')
const dashboard = fs.readFileSync(new URL('../src/pages/AdminDashboard.jsx', import.meta.url), 'utf8')

test('monthly income rows normalize exact-money fields and sort chronologically', () => {
  assert.deepEqual(normalizeDashboardMonthlyIncomeRows([
    {
      month_start: '2026-08-01',
      total_income: '3100000',
      day_count: 10,
      average_daily_income: '310000',
      order_count: '45',
      is_finalized: false,
    },
    {
      month_start: '2026-07-01',
      total_income: '6200000',
      day_count: 31,
      average_daily_income: '200000',
      order_count: '82',
      is_finalized: true,
    },
    { month_start: 'invalid', average_daily_income: 99 },
  ]), [
    {
      monthStart: '2026-07-01',
      totalIncome: 6200000,
      dayCount: 31,
      averageDailyIncome: 200000,
      orderCount: 82,
      isFinalized: true,
    },
    {
      monthStart: '2026-08-01',
      totalIncome: 3100000,
      dayCount: 10,
      averageDailyIncome: 310000,
      orderCount: 45,
      isFinalized: false,
    },
  ])
})

test('monthly income loader uses the bounded aggregate RPC rather than order history', async () => {
  const calls = []
  const rows = [{
    month_start: '2026-08-01',
    total_income: 100,
    day_count: 1,
    average_daily_income: 100,
    order_count: 1,
    is_finalized: false,
  }]
  const dbClient = {
    rpc(name, args) {
      calls.push({ name, args })
      return Promise.resolve({ data: rows, error: null })
    },
  }

  const result = await loadDashboardMonthlyAverageIncome({ dbClient, monthCount: 120 })

  assert.deepEqual(calls, [{
    name: 'get_dashboard_monthly_average_income',
    args: { p_month_count: 24 },
  }])
  assert.equal(result[0].averageDailyIncome, 100)
  assert.doesNotMatch(loader, /loadPaidOrdersForRange|from\(['"]orders['"]\)/)
})

test('completed Dashboard months are immutable database snapshots with one-time backfill', () => {
  assert.match(migration, /create table if not exists public\.dashboard_monthly_income_snapshots/i)
  assert.match(migration, /month_start\s+date primary key/i)
  assert.match(migration, /average_daily_income\s+bigint not null/i)
  assert.match(migration, /average_daily_income = round\(total_income::numeric \/ day_count\)::bigint/i)
  assert.match(migration, /before update or delete on public\.dashboard_monthly_income_snapshots/i)
  assert.match(migration, /Finalized Dashboard monthly income snapshots are immutable/i)
  assert.match(migration, /paid_orders as materialized/i)
  assert.match(migration, /'legacy_backfill'/i)
  assert.match(migration, /on conflict \(month_start\) do nothing/i)
})

test('month-end finalization is duplicate-safe and scheduled with Tashkent boundaries', () => {
  assert.match(migration, /create or replace function public\.finalize_dashboard_monthly_income/i)
  assert.match(migration, /timezone\('Asia\/Tashkent', now\(\)\)/i)
  assert.match(migration, /Only completed Tashkent months can be finalized/i)
  assert.match(migration, /pg_advisory_xact_lock\(hashtext\('dashboard-monthly-income:'/i)
  assert.match(migration, /create or replace function public\.finalize_previous_dashboard_monthly_income/i)
  assert.match(migration, /zar-kebab-monthly-income-snapshot/i)
  assert.match(migration, /'10 20 \* \* \*'/i)
})

test('Dashboard monthly chart reads snapshots plus only the live current month aggregate', () => {
  assert.match(migration, /create or replace function public\.get_dashboard_monthly_average_income/i)
  assert.match(migration, /left join public\.dashboard_monthly_income_snapshots snapshot/i)
  assert.match(migration, /current_paid_orders as materialized/i)
  assert.match(migration, /"order"\.paid_at >= v_from_instant/i)
  assert.match(migration, /"order"\.paid_at < v_to_instant_exclusive/i)
  assert.match(migration, /grant execute on function public\.get_dashboard_monthly_average_income\(integer\)[\s\S]*to authenticated/i)
  assert.match(dashboard, /loadDashboardMonthlyAverageIncome/)
  assert.match(dashboard, /monthlyIncomeChartRows\.map/)
  assert.match(dashboard, /formatCompactIncome\(row\.averageDailyIncome, lang\)/)
  assert.match(dashboard, /Average Daily Income by Month/)
})
