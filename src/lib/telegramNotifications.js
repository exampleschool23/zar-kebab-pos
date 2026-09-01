import { supabase } from './supabase.js'

const NOTIFIABLE_STATUSES = new Set(['accepted', 'preparing', 'ready', 'completed', 'cancelled', 'served'])

async function postAuthenticatedTelegramNotification(body) {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) throw sessionError
  if (!session?.access_token) throw new Error('Authentication required')

  const response = await fetch('/api/telegram/employee-notification', {
    method: 'POST',
    keepalive: true,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(result?.error || `Telegram notification failed with ${response.status}`)
  }
  return result
}

export async function notifyTelegramOrderStatus(orderIdOrIds, status) {
  const orderIds = (Array.isArray(orderIdOrIds) ? orderIdOrIds : [orderIdOrIds]).filter(Boolean)
  if (orderIds.length === 0 || !NOTIFIABLE_STATUSES.has(status)) return

  try {
    const response = await fetch('/api/telegram/order-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderIds.length === 1
        ? { orderId: orderIds[0], status }
        : { orderIds, status }),
    })
    if (!response.ok) throw new Error(`Telegram notification failed with ${response.status}`)
  } catch (error) {
    console.warn('[telegram] order status notification failed:', error)
  }
}

async function notifyTelegramSalaryEvent(type, eventId) {
  const failedResult = {
    ok: false,
    allSent: false,
    employee: { status: 'failed' },
    group: { status: 'failed' },
    team: { status: 'failed' },
  }
  if (!eventId || !['payment', 'fine', 'bonus', 'absence', 'rate', 'kpi_rule'].includes(type)) return failedResult
  try {
    const eventIdKey = type === 'kpi_rule' ? 'kpiRuleEventId' : `${type}Id`
    const result = await postAuthenticatedTelegramNotification({
      type,
      [eventIdKey]: eventId,
    })
    return {
      ...failedResult,
      ...result,
      employee: { ...failedResult.employee, ...(result?.employee || {}) },
      group: { ...failedResult.group, ...(result?.group || {}) },
      team: { ...failedResult.team, ...(result?.team || {}) },
    }
  } catch (error) {
    console.warn(`[telegram] employee ${type} notification failed:`, error)
    return failedResult
  }
}

export function notifyTelegramEmployeePayment(paymentId) {
  return notifyTelegramSalaryEvent('payment', paymentId)
}

export function notifyTelegramEmployeeFine(fineId) {
  return notifyTelegramSalaryEvent('fine', fineId)
}

export function notifyTelegramEmployeeBonus(bonusId) {
  return notifyTelegramSalaryEvent('bonus', bonusId)
}

export function notifyTelegramEmployeeAbsence(absenceId) {
  return notifyTelegramSalaryEvent('absence', absenceId)
}

export async function notifyTelegramAbsenceUndo(absenceId) {
  if (!absenceId) return { ok: false, status: 'failed' }
  try {
    return await postAuthenticatedTelegramNotification({ type: 'absence_undo', absenceId })
  } catch (error) {
    console.warn('[telegram] absence undo Investor notification failed:', error)
    return { ok: false, status: 'failed', errorMessage: String(error?.message || error) }
  }
}

export function notifyTelegramEmployeeRate(rateId) {
  return notifyTelegramSalaryEvent('rate', rateId)
}

export function notifyTelegramKpiRuleChange(changeEventId) {
  return notifyTelegramSalaryEvent('kpi_rule', changeEventId)
}

export function retractTelegramSalaryEvent(eventType, eventId) {
  if (!eventId || !['payment', 'bonus', 'fine', 'absence'].includes(eventType)) {
    return Promise.reject(new Error('Unsupported salary event'))
  }
  return postAuthenticatedTelegramNotification({
    type: 'retract_salary_event',
    eventType,
    eventId,
  })
}

export async function notifyTelegramInvestorExpense(expenseId) {
  const failedResult = {
    ok: false,
    status: 'failed',
    telegramMessageId: null,
    errorMessage: '',
  }
  if (!expenseId) return failedResult

  try {
    const result = await postAuthenticatedTelegramNotification({
      type: 'expense',
      expenseId,
    })
    return { ...failedResult, ...result }
  } catch (error) {
    console.warn('[telegram] Investor expense notification failed:', error)
    return {
      ...failedResult,
      errorMessage: String(error?.message || error),
    }
  }
}

async function notifyTelegramMenuEvent(menuItemId, type) {
  const failedResult = {
    ok: false,
    status: 'failed',
    telegramMessageId: null,
    errorMessage: '',
  }
  if (!menuItemId) return failedResult

  try {
    const result = await postAuthenticatedTelegramNotification({
      type,
      menuItemId,
    })
    return { ...failedResult, ...result }
  } catch (error) {
    console.warn(`[telegram] ${type} menu item notification failed:`, error)
    return {
      ...failedResult,
      errorMessage: String(error?.message || error),
    }
  }
}

export function notifyTelegramMenuUnavailable(menuItemId) {
  return notifyTelegramMenuEvent(menuItemId, 'menu_unavailable')
}

export function notifyTelegramMenuAvailable(menuItemId) {
  return notifyTelegramMenuEvent(menuItemId, 'menu_available')
}

export function notifyTelegramMenuCreated(menuItemId) {
  return notifyTelegramMenuEvent(menuItemId, 'menu_created')
}

export function notifyTelegramMenuArchived(menuItemId) {
  return notifyTelegramMenuEvent(menuItemId, 'menu_archived')
}
