import { supabase } from './supabase.js'

export async function loadDashboardMonthlyBusyHours(monthStart, { signal, dbClient = supabase } = {}) {
  if (!/^\d{4}-(0[1-9]|1[0-2])-01$/.test(monthStart)) throw new Error('Invalid month')
  let request = dbClient.rpc('get_dashboard_monthly_busy_hours', { p_month_start: monthStart })
  if (signal && typeof request?.abortSignal === 'function') request = request.abortSignal(signal)
  const { data, error } = await request
  if (error) throw error
  return (data || []).map(row => ({
    hour: Number(row.period_start_hour) || 0,
    count: Math.max(0, Number(row.order_count) || 0),
  }))
}
