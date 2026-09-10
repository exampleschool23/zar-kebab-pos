import { supabase } from './supabase.js'

export async function loadDashboardWeeklyIncome(monthStart, { signal, dbClient = supabase } = {}) {
  if (!/^\d{4}-(0[1-9]|1[0-2])-01$/.test(monthStart)) throw new Error('Invalid month')
  let request = dbClient.rpc('get_dashboard_recent_period_income', { p_month_start: monthStart })
  if (signal && typeof request.abortSignal === 'function') request = request.abortSignal(signal)
  const { data, error } = await request
  if (error) throw error
  return (data || []).map(row => ({
    weekStart: row.week_start,
    weekEnd: row.week_end,
    totalIncome: Number(row.total_income) || 0,
    dayCount: Number(row.day_count) || 0,
    averageDailyIncome: Number(row.average_daily_income) || 0,
  }))
}

// Presentation only: preserve zero-sale periods within an income-producing month.
export function hideZeroIncomeMonths(rows = []) {
  const activeMonths = new Set(rows.filter(row => row.totalIncome > 0).map(row => row.weekStart.slice(0, 7)))
  return rows.filter(row => activeMonths.has(row.weekStart.slice(0, 7)))
}
