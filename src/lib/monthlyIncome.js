import { supabase } from './supabase.js'

export const DASHBOARD_MONTHLY_INCOME_MONTH_COUNT = 12
export const DASHBOARD_DAILY_BREAK_EVEN_INCOME = 10_000_000

function toNonNegativeInteger(value) {
  return Math.max(0, Math.round(Number(value) || 0))
}

export function normalizeDashboardMonthlyIncomeRows(rows = []) {
  return (rows || [])
    .map(row => ({
      monthStart: String(row?.month_start || '').slice(0, 10),
      totalIncome: toNonNegativeInteger(row?.total_income),
      dayCount: toNonNegativeInteger(row?.day_count),
      averageDailyIncome: toNonNegativeInteger(row?.average_daily_income),
      orderCount: toNonNegativeInteger(row?.order_count),
      isFinalized: row?.is_finalized === true,
    }))
    .filter(row => /^\d{4}-\d{2}-01$/.test(row.monthStart))
    .sort((a, b) => a.monthStart.localeCompare(b.monthStart))
}

export function buildDashboardMonthlyIncomeChartRows(rows = []) {
  return [...(rows || [])]
    .filter(row => /^\d{4}-\d{2}-01$/.test(String(row?.monthStart || '')))
    .sort((a, b) => a.monthStart.localeCompare(b.monthStart))
}

export async function loadDashboardMonthlyAverageIncome(options = {}) {
  const dbClient = options.dbClient || supabase
  const requestedCount = Number(options.monthCount) || DASHBOARD_MONTHLY_INCOME_MONTH_COUNT
  const monthCount = Math.max(1, Math.min(Math.round(requestedCount), 24))
  let request = dbClient.rpc('get_dashboard_monthly_average_income', {
    p_month_count: monthCount,
  })
  if (options.signal && typeof request?.abortSignal === 'function') {
    request = request.abortSignal(options.signal)
  }
  const { data, error } = await request
  if (error) throw error
  return normalizeDashboardMonthlyIncomeRows(data)
}
