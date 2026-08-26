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
  if (!response.ok) throw new Error(`Telegram notification failed with ${response.status}`)
  return response.json().catch(() => ({}))
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
  if (!eventId || !['payment', 'fine', 'bonus', 'absence', 'rate'].includes(type)) return failedResult
  try {
    const result = await postAuthenticatedTelegramNotification({
      type,
      [`${type}Id`]: eventId,
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

export function notifyTelegramEmployeeRate(rateId) {
  return notifyTelegramSalaryEvent('rate', rateId)
}

export async function notifyTelegramMenuUnavailable(menuItemId) {
  const failedResult = {
    ok: false,
    status: 'failed',
    telegramMessageId: null,
    errorMessage: '',
  }
  if (!menuItemId) return failedResult

  try {
    const result = await postAuthenticatedTelegramNotification({
      type: 'menu_unavailable',
      menuItemId,
    })
    return { ...failedResult, ...result }
  } catch (error) {
    console.warn('[telegram] unavailable menu item notification failed:', error)
    return {
      ...failedResult,
      errorMessage: String(error?.message || error),
    }
  }
}
