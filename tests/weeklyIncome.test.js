import test from 'node:test'
import assert from 'node:assert/strict'
import { hideZeroIncomeMonths, loadDashboardWeeklyIncome } from '../src/lib/weeklyIncome.js'
test('weekly loader is bounded by selected ending month and normalizes money', async () => {
  const rows = await loadDashboardWeeklyIncome('2026-02-01', { dbClient: { rpc: async (name, args) => {
    assert.equal(name, 'get_dashboard_recent_period_income')
    assert.deepEqual(args, { p_month_start: '2026-02-01' })
    return { data: [{ week_start: '2026-02-21', week_end: '2026-02-28', total_income: '800', day_count: 8, average_daily_income: '100' }] }
  } } })
  assert.deepEqual(rows, [{ weekStart: '2026-02-21', weekEnd: '2026-02-28', totalIncome: 800, dayCount: 8, averageDailyIncome: 100 }])
})
test('weekly loader rejects invalid months and propagates failures', async () => {
  await assert.rejects(loadDashboardWeeklyIncome('2026-13-01'), /Invalid month/)
  await assert.rejects(loadDashboardWeeklyIncome('2026-01-01', { dbClient: { rpc: async () => ({ error: new Error('offline') }) } }), /offline/)
})

test('hides wholly zero-income months but preserves zero periods in active months', () => {
  const rows = [
    { weekStart: '2026-05-01', totalIncome: 0 },
    { weekStart: '2026-05-11', totalIncome: 0 },
    { weekStart: '2026-06-01', totalIncome: 0 },
    { weekStart: '2026-06-11', totalIncome: 100 },
    { weekStart: '2026-06-21', totalIncome: 0 },
  ]
  assert.deepEqual(hideZeroIncomeMonths(rows), rows.slice(2))
  assert.deepEqual(hideZeroIncomeMonths(rows.slice(0, 2)), [])
  assert.deepEqual(hideZeroIncomeMonths([]), [])
  assert.equal(rows.length, 5)
})
