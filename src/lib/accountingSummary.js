import { getAccountingPaidOrderSummary } from './accounting.js'
import { loadPaidOrdersForRange } from './orderHistory.js'
import { supabase } from './supabase.js'

function isMissingAccountingSummaryRpc(error) {
  const message = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return message.includes('get_accounting_paid_order_summary') && (
    message.includes('could not find the function') ||
    message.includes('schema cache') ||
    message.includes('function') && message.includes('not found')
  )
}

export async function loadAccountingPaidOrderSummary(dateFrom, dateTo, options = {}) {
  const dbClient = options.dbClient || supabase
  const { data, error } = await dbClient.rpc('get_accounting_paid_order_summary', {
    p_date_from: dateFrom,
    p_date_to: dateTo,
  })

  if (!error) return data || {}
  if (!isMissingAccountingSummaryRpc(error) || options.allowLegacyFallback === false) throw error

  // Keep Accounting usable while the frontend and database migration are
  // deployed separately. Once migration 109 is present, this slower path is
  // never used.
  const orders = await loadPaidOrdersForRange(dateFrom, dateTo, {
    dbClient,
    pageSize: options.pageSize,
  })
  return getAccountingPaidOrderSummary(
    orders,
    dateFrom,
    dateTo,
    options.fallbackMenuItemMap
  )
}
